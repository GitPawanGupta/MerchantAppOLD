const crypto = require('crypto');
const paymentGatewayFactory = require('./gateways/PaymentGatewayFactory');
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
 * Create a payment order using active gateway.
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

  // 5. Get active gateway and create order
  const gateway = paymentGatewayFactory.getGateway();
  const gatewayName = gateway.getName();
  
  let gatewayOrder;
  try {
    gatewayOrder = await gateway.createOrder({
      amount: payAmount,
      orderId,
      customerPhone,
      customerEmail,
      customerName: customerName || 'Customer',
    });
  } catch (gwErr) {
    logger.error(`${gatewayName} order creation failed: ${gwErr.message}`);
    
    // Attempt failover if enabled
    if (paymentGatewayFactory.settings?.failoverEnabled) {
      logger.warn(`Attempting failover from ${gatewayName}`);
      const failedOver = await paymentGatewayFactory.attemptFailover();
      
      if (failedOver) {
        // Retry with backup gateway
        const backupGateway = paymentGatewayFactory.getGateway();
        gatewayOrder = await backupGateway.createOrder({
          amount: payAmount,
          orderId,
          customerPhone,
          customerEmail,
          customerName: customerName || 'Customer',
        });
      } else {
        throw gwErr;
      }
    } else {
      throw gwErr;
    }
  }

  // 6. Persist transaction record
  const transaction = await Transaction.create({
    orderId,
    merchantId: merchant._id,
    qrCodeId: qr._id,
    cfOrderId: gatewayOrder.gatewayOrderId,  // Gateway order ID (field name kept for DB compatibility)
    customerName: customerName || 'Customer',
    customerEmail,
    customerPhone,
    amount: payAmount,
    commissionRate,
    commissionAmount,
    settlementAmount,
    currency: 'INR',
    status: 'pending',
    paymentGateway: gatewayName,  // Track which gateway was used
  });

  logger.info(`${gatewayName} order created: ${orderId} (gateway: ${gatewayOrder.gatewayOrderId}) for merchant ${merchant.merchantId}`);

  return {
    transaction,
    gatewayOrderId: gatewayOrder.gatewayOrderId,
    orderId,
    amount: payAmount,
    merchant: {
      businessName: merchant.businessName,
    },
    gateway: gatewayName,
    gatewayOrder, // Full gateway response for checkout
  };
};

/**
 * Verify payment status after gateway return redirect.
 * Gateway-specific verification based on transaction's payment gateway.
 */
const verifyPaymentOrder = async (orderId, paymentId = null, signature = null) => {
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

  // Get gateway adapter (use transaction's gateway or current active)
  const gatewayName = transaction.paymentGateway || paymentGatewayFactory.getGateway().getName();
  const gateway = paymentGatewayFactory.getGatewayByName(gatewayName);

  // If gateway returned payment details on redirect, verify
  if (paymentId && signature) {
    try {
      const verification = await gateway.verifyPayment({
        orderId: transaction.cfOrderId, // Gateway order ID
        paymentId,
        signature,
      });

      if (!verification.isValid) {
        transaction.status = 'failed';
        transaction.failureReason = verification.error || 'Invalid payment signature';
        await transaction.save();
        return transaction;
      }

      // Apply payment update
      await applyPaymentUpdate(transaction, verification);
    } catch (e) {
      logger.error(`${gatewayName} payment verification failed for ${paymentId}: ${e.message}`);
      throw new Error(`Failed to verify payment with ${gatewayName}: ${e.message}`);
    }
  } else {
    // No payment id yet — still pending
    logger.info(`verifyPaymentOrder: no payment ID for ${orderId}, still pending`);
  }

  return transaction;
};

/**
 * Process payment gateway webhook
 * Auto-detects gateway from headers/signature and routes to appropriate adapter
 */
const processWebhook = async (rawBody, headers, payload) => {
  // Detect gateway from headers
  let gatewayName = 'razorpay'; // default
  
  if (headers['x-webhook-signature']) {
    gatewayName = 'cashfree';
  } else if (headers['x-razorpay-signature']) {
    gatewayName = 'razorpay';
  }

  // Get appropriate gateway adapter
  const gateway = paymentGatewayFactory.getGatewayByName(gatewayName);
  
  // Process webhook through adapter
  let webhookResult;
  try {
    webhookResult = await gateway.processWebhook(rawBody, headers, payload);
  } catch (err) {
    logger.error(`${gatewayName} webhook processing error: ${err.message}`);
    throw err;
  }

  if (!webhookResult.isValid) {
    logger.warn(`${gatewayName} webhook validation failed`);
    return webhookResult;
  }

  // Find transaction by gateway order ID
  const transaction = await Transaction.findOne({ cfOrderId: webhookResult.orderId });
  if (!transaction) {
    logger.warn(`${gatewayName} webhook: transaction not found for order ${webhookResult.orderId}`);
    return { ignored: true, reason: 'Transaction not found' };
  }

  // Idempotency — skip if already processed
  if (['success', 'failed', 'cancelled'].includes(transaction.status)) {
    logger.info(`${gatewayName} webhook: transaction ${transaction.orderId} already in terminal state`);
    return { alreadyProcessed: true };
  }

  await applyPaymentUpdate(transaction, webhookResult);

  logger.info(`${gatewayName} webhook processed: ${transaction.orderId} → ${transaction.status}`);
  return { processed: true, orderId: transaction.orderId, status: transaction.status };
};

/**
 * Shared logic: update transaction from normalized payment data (from any gateway)
 */
const applyPaymentUpdate = async (transaction, paymentData, webhookPayload = null) => {
  if (!paymentData) return;

  // paymentData is normalized from gateway adapter
  const internalStatus = paymentData.status || 'pending';

  transaction.status = internalStatus;
  transaction.cfPaymentId = paymentData.paymentId || transaction.cfPaymentId;
  transaction.cfReferenceId = paymentData.bankTransactionId || transaction.cfReferenceId;
  transaction.paymentMethod = resolvePaymentMethod(paymentData.method);
  transaction.paymentInstrument = paymentData.method || null;
  transaction.upiTransactionId = paymentData.vpa || null;
  transaction.paymentTime = paymentData.capturedAt || new Date();
  transaction.failureReason = paymentData.errorDescription || null;
  if (webhookPayload || paymentData.rawPayload) {
    transaction.webhookData = webhookPayload || paymentData.rawPayload;
  }

  await transaction.save();

  // On success — update merchant totals and QR stats
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

    // Route settlement to merchant's linked Razorpay account (non-blocking)
    setImmediate(async () => {
      try {
        const merchant = await Merchant.findById(transaction.merchantId);

        if (merchant && merchant.isRazorpayLinked && merchant.razorpayLinkedAccountId) {
          // Partner Technology: Route payment to merchant's linked account
          const rzpPaymentId = transaction.cfPaymentId;
          if (rzpPaymentId && rzpPaymentId.startsWith('pay_')) {
            await partnerService.createTransfer({
              paymentId: rzpPaymentId,
              merchantLinkedAccountId: merchant.razorpayLinkedAccountId,
              settlementAmount: transaction.settlementAmount,
              orderId: transaction.orderId,
            });
            // Mark as settled via Route
            await Transaction.findByIdAndUpdate(transaction._id, {
              isSettled: true,
              settledAt: new Date(),
            });
            await Merchant.findByIdAndUpdate(transaction.merchantId, {
              $inc: {
                totalSettled: transaction.settlementAmount,
                pendingSettlement: -transaction.settlementAmount,
              },
            });
            logger.info(`Route transfer done for tx ${transaction.orderId}: ₹${transaction.settlementAmount} → ${merchant.razorpayLinkedAccountId}`);
          } else {
            // No linked account — use manual settlement queue
            logger.info(`Merchant ${merchant.merchantId} not linked to Razorpay Partner — queuing for manual settlement`);
          }
        }
      } catch (e) {
        logger.error(`Route transfer failed for tx ${transaction.orderId}: ${e.message}`);
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
