const crypto = require('crypto');
const { razorpayClient, RAZORPAY_CONFIG } = require('../config/razorpay');
const Transaction = require('../models/Transaction');
const QRCodeModel = require('../models/QRCode');
const Merchant = require('../models/Merchant');
const { CommissionConfig } = require('../models/Commission');
const {
  generateOrderId,
  calculateCommission,
} = require('../utils/helpers');
const logger = require('../utils/logger');

/**
 * Resolve the effective commission rate for a merchant.
 * Merchant-specific config overrides global config.
 */
const getEffectiveCommissionRate = async (merchantId, category = null) => {
  // Try merchant-specific config first
  const merchantConfig = await CommissionConfig.findOne({
    merchantId,
    isActive: true,
  });
  if (merchantConfig) return merchantConfig.rate;

  // Fall back to global config
  const globalConfig = await CommissionConfig.findOne({
    merchantId: null,
    isActive: true,
  });
  if (globalConfig) return globalConfig.rate;

  // Final fallback — env default
  return parseFloat(process.env.DEFAULT_COMMISSION_RATE || '2.0');
};

/**
 * Create a Razorpay payment order.
 * Called when a customer lands on the payment page (after scanning QR).
 */
const createPaymentOrder = async ({ qrId, amount, customerName, customerEmail, customerPhone }) => {
  // 1. Validate QR
  const qr = await QRCodeModel.findOne({ qrId, isActive: true }).populate(
    'merchantId',
    'merchantId businessName status bankDetails kyc commissionRate'
  );

  if (!qr) {
    const err = new Error('Invalid or inactive QR code');
    err.statusCode = 404;
    throw err;
  }

  if (qr.expiresAt && new Date() > qr.expiresAt) {
    const err = new Error('QR code has expired');
    err.statusCode = 410;
    throw err;
  }

  const merchant = qr.merchantId;

  if (merchant.status !== 'active') {
    const err = new Error('Merchant is not active');
    err.statusCode = 400;
    throw err;
  }

  // 2. Resolve amount — fixed for dynamic QR, caller-provided for static
  const payAmount = qr.type === 'dynamic' ? qr.fixedAmount : amount;

  if (!payAmount || payAmount < 1) {
    const err = new Error('Valid amount is required');
    err.statusCode = 400;
    throw err;
  }

  // 3. Calculate commission
  const commissionRate = await getEffectiveCommissionRate(merchant._id);
  const { commissionAmount, settlementAmount } = calculateCommission(payAmount, commissionRate);

  // 4. Generate internal order ID
  const orderId = generateOrderId('ORD');

  // 5. Create order on Razorpay
  // Razorpay amount is in paise (multiply by 100)
  let rzpOrder;
  try {
    rzpOrder = await razorpayClient.orders.create({
      amount: Math.round(payAmount * 100), // paise
      currency: 'INR',
      receipt: orderId,
      notes: {
        merchantId: merchant._id.toString(),
        qrId,
        internalOrderId: orderId,
      },
    });
  } catch (rzpErr) {
    const msg = rzpErr.error?.description || rzpErr.message;
    logger.error(`Razorpay order creation failed: ${msg}`, rzpErr.error);
    const err = new Error(`Payment gateway error: ${msg}`);
    err.statusCode = 502;
    throw err;
  }

  // 6. Persist transaction record
  const transaction = await Transaction.create({
    orderId,
    merchantId: merchant._id,
    qrCodeId: qr._id,
    cfOrderId: rzpOrder.id,          // reusing cfOrderId field to store rzp order id
    customerName: customerName || 'Customer',
    customerEmail,
    customerPhone,
    amount: payAmount,
    commissionRate,
    commissionAmount,
    settlementAmount,
    currency: 'INR',
    status: 'pending',
  });

  logger.info(`Razorpay order created: ${orderId} (rzp: ${rzpOrder.id}) for merchant ${merchant.merchantId}`);

  return {
    transaction,
    rzpOrderId: rzpOrder.id,
    // kept for backward compat with controller response fields
    cfOrderId: rzpOrder.id,
    paymentSessionId: null,           // not used in Razorpay flow
    orderId,
    amount: payAmount,
    merchant: {
      businessName: merchant.businessName,
    },
  };
};

/**
 * Verify payment status after Razorpay return redirect.
 * Razorpay sends razorpay_payment_id + razorpay_signature on success.
 */
const verifyPaymentOrder = async (orderId, rzpPaymentId = null, rzpSignature = null) => {
  const transaction = await Transaction.findOne({ orderId }).populate(
    'merchantId',
    'merchantId businessName'
  );

  if (!transaction) {
    const err = new Error('Transaction not found');
    err.statusCode = 404;
    throw err;
  }

  // Already terminal — return cached status
  if (['success', 'failed', 'cancelled'].includes(transaction.status)) {
    return transaction;
  }

  // If Razorpay returned payment details on redirect, verify signature
  if (rzpPaymentId && rzpSignature) {
    const rzpOrderId = transaction.cfOrderId; // stored rzp order id
    const generated = crypto
      .createHmac('sha256', RAZORPAY_CONFIG.keySecret)
      .update(`${rzpOrderId}|${rzpPaymentId}`)
      .digest('hex');

    if (generated !== rzpSignature) {
      transaction.status = 'failed';
      transaction.failureReason = 'Invalid payment signature';
      await transaction.save();
      return transaction;
    }

    // Fetch payment details from Razorpay
    let payment;
    try {
      payment = await razorpayClient.payments.fetch(rzpPaymentId);
    } catch (e) {
      logger.error(`Razorpay payment fetch failed for ${rzpPaymentId}: ${e.message}`);
      throw new Error('Failed to fetch payment status from gateway');
    }

    await applyPaymentUpdate(transaction, payment);
  } else {
    // No payment id yet — still pending
    logger.info(`verifyPaymentOrder: no rzpPaymentId for ${orderId}, still pending`);
  }

  return transaction;
};

/**
 * Process Razorpay webhook
 * Razorpay sends: x-razorpay-signature header, JSON body
 */
const processWebhook = async (rawBody, signature, payload) => {
  // Verify webhook signature
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.CASHFREE_WEBHOOK_SECRET;
  if (secret) {
    const generated = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    if (generated !== signature) {
      const err = new Error('Invalid webhook signature');
      err.statusCode = 401;
      throw err;
    }
  }

  const event = payload.event;

  // Handle only payment events
  const handled = [
    'payment.captured',
    'payment.failed',
    'order.paid',
  ];

  if (!handled.includes(event)) {
    logger.info(`Razorpay webhook ignored: ${event}`);
    return { ignored: true };
  }

  // Extract payment object
  const payment = payload.payload?.payment?.entity || payload.payload?.order?.entity;
  const rzpOrderId = payment?.order_id || payload.payload?.order?.entity?.id;

  if (!rzpOrderId) {
    logger.warn('Razorpay webhook: no order_id found in payload');
    return { ignored: true };
  }

  // Find transaction by rzp order id (stored in cfOrderId field)
  const transaction = await Transaction.findOne({ cfOrderId: rzpOrderId });
  if (!transaction) {
    logger.warn(`Razorpay webhook: transaction not found for rzp order ${rzpOrderId}`);
    return { ignored: true };
  }

  // Idempotency — skip if already processed
  if (['success', 'failed', 'cancelled'].includes(transaction.status)) {
    logger.info(`Razorpay webhook: transaction ${transaction.orderId} already in terminal state`);
    return { alreadyProcessed: true };
  }

  await applyPaymentUpdate(transaction, payment?.entity || payment, payload);

  logger.info(`Razorpay webhook processed: ${transaction.orderId} → ${transaction.status}`);
  return { processed: true, orderId: transaction.orderId, status: transaction.status };
};

/**
 * Shared logic: update transaction from a Razorpay payment object
 */
const applyPaymentUpdate = async (transaction, payment, webhookPayload = null) => {
  if (!payment) return;

  // Razorpay statuses: captured → success, failed → failed, created/authorized → pending
  const rzpStatus = payment.status;
  let internalStatus = transaction.status;

  if (rzpStatus === 'captured') internalStatus = 'success';
  else if (rzpStatus === 'failed') internalStatus = 'failed';
  else if (rzpStatus === 'refunded') internalStatus = 'failed';
  else internalStatus = 'pending';

  transaction.status = internalStatus;
  transaction.cfPaymentId = payment.id || transaction.cfPaymentId;       // razorpay payment id
  transaction.cfReferenceId = payment.acquirer_data?.bank_transaction_id  // bank ref
    || payment.bank_transaction_id
    || transaction.cfReferenceId;
  transaction.paymentMethod = resolvePaymentMethod(payment.method);
  transaction.paymentInstrument = payment.method || null;
  transaction.upiTransactionId = payment.vpa || null;                     // UPI VPA
  transaction.paymentTime = payment.captured_at
    ? new Date(payment.captured_at * 1000)
    : new Date();
  transaction.failureReason = payment.error_description || payment.description || null;
  if (webhookPayload) transaction.webhookData = webhookPayload;

  await transaction.save();

  // On success — update merchant totals and QR stats, then trigger settlement
  if (internalStatus === 'success') {
    await Promise.all([
      Merchant.findByIdAndUpdate(transaction.merchantId, {
        $inc: {
          totalCollected: transaction.amount,
          totalCommission: transaction.commissionAmount,
          pendingSettlement: transaction.settlementAmount,
        },
      }),
      QRCodeModel.findByIdAndUpdate(transaction.qrCodeId, {
        $inc: { successfulPayments: 1, totalAmountCollected: transaction.amount },
      }),
    ]);

    // Trigger instant settlement (non-blocking) if merchant prefers it
    setImmediate(async () => {
      try {
        const merchant = await Merchant.findById(transaction.merchantId);
        if (merchant && merchant.settlementPreference === 'instant') {
          const settlementService = require('./settlementService');
          await settlementService.triggerInstantSettlement(transaction.merchantId, [transaction._id]);
        } else {
          logger.info(`Instant settlement skipped for tx ${transaction.orderId}: merchant set to on_demand/manual`);
        }
      } catch (e) {
        logger.error(`Instant settlement failed for tx ${transaction.orderId}: ${e.message}`);
      }
    });
  }
};

const resolvePaymentMethod = (method) => {
  if (!method) return 'unknown';
  const m = method.toLowerCase();
  if (m === 'upi') return 'upi';
  if (m === 'card') return 'card';
  if (m === 'netbanking') return 'netbanking';
  if (m === 'wallet') return 'wallet';
  if (m === 'emi') return 'emi';
  return 'unknown';
};

/**
 * Get a single transaction by orderId
 * Commission fields stripped — not visible to merchant
 */
const getTransactionByOrderId = async (orderId, merchantId = null) => {
  const filter = { orderId };
  if (merchantId) filter.merchantId = merchantId;

  const tx = await Transaction.findOne(filter)
    .select('-commissionAmount -commissionRate -settlementAmount -webhookData')
    .populate('merchantId', 'merchantId businessName');

  if (!tx) {
    const err = new Error('Transaction not found');
    err.statusCode = 404;
    throw err;
  }
  return tx;
};

module.exports = {
  createPaymentOrder,
  verifyPaymentOrder,
  processWebhook,
  getTransactionByOrderId,
  getEffectiveCommissionRate,
};
