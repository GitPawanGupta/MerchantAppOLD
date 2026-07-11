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

  // Already terminal — return cached status (skip all processing)
  if (['success', 'failed', 'cancelled'].includes(transaction.status)) {
    logger.info(`verifyPaymentOrder: ${orderId} already in terminal state (${transaction.status}), skipping`);
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
 * Handles both regular payment webhooks and qr_code.credited events
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
  
  // ── Handle Razorpay qr_code.credited event ───────────────────────────────
  // This fires when a customer pays via Razorpay UPI QR
  if (gatewayName === 'razorpay' && payload.event === 'qr_code.credited') {
    return await processQRCodeCreditedWebhook(rawBody, headers, payload);
  }

  // Skip other Razorpay QR-related events that don't map to a payment order
  if (gatewayName === 'razorpay' && payload.event?.startsWith('qr_code.')) {
    logger.info(`Razorpay webhook: ignoring qr_code event "${payload.event}" — not a checkout payment`);
    return { ignored: true, reason: `QR event ${payload.event} not applicable` };
  }

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
 * Handle Razorpay qr_code.credited webhook
 * Fired when customer pays via Razorpay UPI QR (no Razorpay order/checkout involved)
 *
 * Webhook payload structure:
 * {
 *   event: "qr_code.credited",
 *   payload: {
 *     qr_code: { entity: { id, notes: { internal_qr_id }, ... } },
 *     payment: { entity: { id, amount, status, method, vpa, ... } }
 *   }
 * }
 */
const processQRCodeCreditedWebhook = async (rawBody, headers, payload) => {
  // Verify signature
  const signature = headers['x-razorpay-signature'];
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (webhookSecret && signature) {
    const crypto = require('crypto');
    const generated = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');
    if (generated !== signature) {
      logger.warn('qr_code.credited webhook: invalid signature — check RAZORPAY_WEBHOOK_SECRET env var on production server');
      // Still process in non-production to avoid missing payments during dev
      // In production, reject to prevent spoofed webhooks
      if (process.env.NODE_ENV === 'production') {
        return { isValid: false, error: 'Invalid signature' };
      }
    }
  } else if (!webhookSecret) {
    logger.warn('qr_code.credited webhook: RAZORPAY_WEBHOOK_SECRET not set — skipping signature check (insecure)');
  }

  const qrEntity = payload.payload?.qr_code?.entity;
  const paymentEntity = payload.payload?.payment?.entity;

  if (!qrEntity || !paymentEntity) {
    logger.warn('qr_code.credited: missing qr_code or payment entity');
    return { isValid: false, error: 'Missing entities' };
  }

  const razorpayQrId = qrEntity.id;                           // e.g., qr_xxx
  const internalQrId = qrEntity.notes?.internal_qr_id;        // our QR ID
  const rzpPaymentId = paymentEntity.id;                       // pay_xxx
  const amountPaise  = paymentEntity.amount;                   // in paise
  const amountRs     = amountPaise / 100;
  const method       = paymentEntity.method || 'upi';
  const vpa          = paymentEntity.vpa || null;
  const capturedAt   = paymentEntity.captured_at
    ? new Date(paymentEntity.captured_at * 1000) : new Date();

  logger.info(`qr_code.credited: QR ${razorpayQrId} (${internalQrId}), payment ${rzpPaymentId}, ₹${amountRs}`);

  // Find QR by Razorpay QR ID or internal QR ID
  const QRCodeModel = require('../models/QRCode');
  const qr = await QRCodeModel.findOne({
    $or: [
      { razorpayQrId },
      { qrId: internalQrId },
    ],
  }).populate('merchantId', 'merchantId businessName _id');

  if (!qr) {
    logger.warn(`qr_code.credited: QR not found for razorpayQrId=${razorpayQrId} internalQrId=${internalQrId}`);
    return { ignored: true, reason: 'QR not found' };
  }

  const merchant = qr.merchantId;

  // ── Idempotency: check if this payment was already processed ──────────────
  const existingTx = await Transaction.findOne({ cfPaymentId: rzpPaymentId });
  if (existingTx) {
    logger.info(`qr_code.credited: payment ${rzpPaymentId} already processed`);
    return { alreadyProcessed: true };
  }

  // ── Calculate commission ──────────────────────────────────────────────────
  const commissionRate = await getEffectiveCommissionRate(merchant._id);
  const { commissionAmount, settlementAmount } = calculateCommission(amountRs, commissionRate);

  // ── Create transaction record ─────────────────────────────────────────────
  const orderId = generateOrderId('QRP'); // QRP = QR Payment

  const transaction = await Transaction.create({
    orderId,
    merchantId: merchant._id,
    qrCodeId: qr._id,
    cfOrderId: razorpayQrId,   // Store Razorpay QR ID as gateway order ref
    cfPaymentId: rzpPaymentId,
    customerName: 'Customer',
    amount: amountRs,
    commissionRate,
    commissionAmount,
    settlementAmount,
    currency: 'INR',
    status: 'success',         // QR credited = payment confirmed
    paymentGateway: 'razorpay',
    paymentMethod: method,
    upiTransactionId: vpa,
    paymentTime: capturedAt,
  });

  // ── Update merchant balance + QR stats (atomic, single update) ───────────
  await Promise.all([
    Merchant.findByIdAndUpdate(merchant._id, {
      $inc: {
        totalCollected: amountRs,
        totalCommission: commissionAmount,
        pendingSettlement: settlementAmount,
      },
      lastTransactionDate: new Date(),
    }),
    QRCodeModel.findByIdAndUpdate(qr._id, {
      $inc: {
        successfulPayments: 1,
        totalAmountCollected: amountRs,
      },
    }),
  ]);

  // ── Create commission ledger entry ────────────────────────────────────────
  const { CommissionLedger } = require('../models/Commission');
  await CommissionLedger.create({
    transactionId: transaction._id,
    merchantId: merchant._id,
    transactionAmount: amountRs,
    commissionRate,
    flatFee: 0,
    commissionAmount,
    netSettlementAmount: settlementAmount,
    status: 'pending',
  });

  logger.info(`qr_code.credited processed: orderId=${orderId} ₹${amountRs} merchant=${merchant.merchantId} commission=₹${commissionAmount}`);

  // ── Push notification (non-blocking) ─────────────────────────────────────
  setImmediate(async () => {
    try {
      const merchantDoc = await Merchant.findById(merchant._id).select('fcmToken businessName');
      const Notification = require('../models/Notification');

      // Save to DB first (always, even without FCM token)
      await Notification.create({
        merchantId: merchant._id,
        type: 'payment_received',
        title: `💰 Payment Received — ₹${amountRs.toLocaleString('en-IN')}`,
        body: [
          vpa ? `From: ${vpa}` : null,
          qr.label || qr.name ? `QR: ${qr.label || qr.name}` : null,
          `via ${(method || 'upi').toUpperCase()}`,
        ].filter(Boolean).join('  •  '),
        data: { orderId, amount: amountRs, paymentMethod: method, vpa: vpa || '' },
      });

      // Send FCM if token available
      if (merchantDoc?.fcmToken) {
        const notificationService = require('./notificationService');
        await notificationService.sendPaymentReceivedNotification(merchantDoc.fcmToken, {
          amount:        amountRs,
          orderId,
          paymentMethod: method,
          vpa:           vpa || '',
          businessName:  merchantDoc.businessName || '',
          qrLabel:       qr.label || qr.name || '',
        });
      }
    } catch (notifErr) {
      logger.error(`QR payment notification failed: ${notifErr.message}`);
    }
  });

  return {
    processed: true,
    orderId,
    rzpPaymentId,
    amount: amountRs,
    merchantId: merchant.merchantId,
  };
};

/**
 * processQRCodeCreditedPayment — callable directly (e.g., from admin sync)
 * Takes already-parsed payment fields, finds QR, creates transaction.
 * Idempotent: skips if payment already processed.
 */
const processQRCodeCreditedPayment = async ({
  razorpayQrId,
  internalQrId,
  rzpPaymentId,
  amountPaise,
  method,
  vpa,
  capturedAt,
}) => {
  const amountRs = amountPaise / 100;

  // Idempotency
  const existingTx = await Transaction.findOne({ cfPaymentId: rzpPaymentId });
  if (existingTx) {
    return { alreadyProcessed: true, orderId: existingTx.orderId };
  }

  // Find QR
  const qr = await QRCodeModel.findOne({
    $or: [{ razorpayQrId }, { qrId: internalQrId }],
  }).populate('merchantId', 'merchantId businessName _id');

  if (!qr) {
    throw new Error(`QR not found: razorpayQrId=${razorpayQrId} internalQrId=${internalQrId}`);
  }

  const merchant = qr.merchantId;
  const commissionRate = await getEffectiveCommissionRate(merchant._id);
  const { commissionAmount, settlementAmount } = calculateCommission(amountRs, commissionRate);
  const orderId = generateOrderId('QRP');

  const transaction = await Transaction.create({
    orderId,
    merchantId: merchant._id,
    qrCodeId: qr._id,
    cfOrderId: razorpayQrId,
    cfPaymentId: rzpPaymentId,
    customerName: 'Customer',
    amount: amountRs,
    commissionRate,
    commissionAmount,
    settlementAmount,
    currency: 'INR',
    status: 'success',
    paymentGateway: 'razorpay',
    paymentMethod: method || 'upi',
    upiTransactionId: vpa,
    paymentTime: capturedAt || new Date(),
  });

  await Promise.all([
    Merchant.findByIdAndUpdate(merchant._id, {
      $inc: {
        totalCollected: amountRs,
        totalCommission: commissionAmount,
        pendingSettlement: settlementAmount,
      },
      lastTransactionDate: new Date(),
    }),
    QRCodeModel.findByIdAndUpdate(qr._id, {
      $inc: { successfulPayments: 1, totalAmountCollected: amountRs },
    }),
  ]);

  const { CommissionLedger } = require('../models/Commission');
  await CommissionLedger.create({
    transactionId: transaction._id,
    merchantId: merchant._id,
    transactionAmount: amountRs,
    commissionRate,
    flatFee: 0,
    commissionAmount,
    netSettlementAmount: settlementAmount,
    status: 'pending',
  });

  logger.info(`processQRCodeCreditedPayment: orderId=${orderId} ₹${amountRs} merchant=${merchant.merchantId}`);

  return {
    processed: true,
    orderId,
    rzpPaymentId,
    amount: amountRs,
    merchantId: merchant.merchantId,
  };
};

/**
 * Shared logic: update transaction from normalized payment data (from any gateway)
 * Uses atomic findOneAndUpdate to prevent race condition between redirect + webhook
 */
const applyPaymentUpdate = async (transaction, paymentData, webhookPayload = null) => {
  if (!paymentData) return;

  const internalStatus = paymentData.status || 'pending';

  // ── Atomic status transition guard ──────────────────────────────────────────
  // Only allow transition TO success/failed if current status is still pending.
  // This prevents the redirect callback AND webhook from both incrementing counters
  // when they arrive at nearly the same time (race condition).
  if (internalStatus === 'success' || internalStatus === 'failed' || internalStatus === 'cancelled') {
    const updated = await Transaction.findOneAndUpdate(
      {
        _id: transaction._id,
        status: 'pending', // ← atomic guard: only update if STILL pending
      },
      {
        $set: {
          status: internalStatus,
          cfPaymentId: paymentData.paymentId || transaction.cfPaymentId,
          cfReferenceId: paymentData.bankTransactionId || transaction.cfReferenceId,
          paymentMethod: resolvePaymentMethod(paymentData.method),
          paymentInstrument: paymentData.method || null,
          upiTransactionId: paymentData.vpa || null,
          paymentTime: paymentData.capturedAt || new Date(),
          failureReason: paymentData.errorDescription || null,
          ...(webhookPayload || paymentData.rawPayload
            ? { webhookData: webhookPayload || paymentData.rawPayload }
            : {}),
        },
      },
      { new: true }
    );

    if (!updated) {
      // Transaction was already updated by another concurrent request — skip
      logger.info(`applyPaymentUpdate: skipped for ${transaction.orderId} — already processed (race condition guard)`);
      return;
    }

    // Copy updated fields back onto the in-memory object
    Object.assign(transaction, updated.toObject());
  } else {
    // Non-terminal status (e.g. pending) — just update fields, no guard needed
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
  }

  // On success — update merchant totals and QR stats EXACTLY ONCE
  // (guaranteed by the atomic guard above)
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

    logger.info(`Payment confirmed: ${transaction.orderId} ₹${transaction.amount} — merchant+QR balances updated`);

    // ── Push notification (non-blocking) ───────────────────────────────────
    setImmediate(async () => {
      try {
        const merchantDoc = await Merchant.findById(transaction.merchantId).select('fcmToken businessName');
        const Notification = require('../models/Notification');

        await Notification.create({
          merchantId: transaction.merchantId,
          type: 'payment_received',
          title: `💰 Payment Received — ₹${transaction.amount.toLocaleString('en-IN')}`,
          body: [
            transaction.upiTransactionId ? `From: ${transaction.upiTransactionId}` : null,
            `via ${(transaction.paymentMethod || 'upi').toUpperCase()}`,
          ].filter(Boolean).join('  •  '),
          data: {
            orderId:       transaction.orderId,
            amount:        transaction.amount,
            paymentMethod: transaction.paymentMethod,
            vpa:           transaction.upiTransactionId || '',
          },
        });

        if (merchantDoc?.fcmToken) {
          const notificationService = require('./notificationService');
          await notificationService.sendPaymentReceivedNotification(merchantDoc.fcmToken, {
            amount:        transaction.amount,
            orderId:       transaction.orderId,
            paymentMethod: transaction.paymentMethod || 'upi',
            vpa:           transaction.upiTransactionId || '',
            businessName:  merchantDoc.businessName || '',
          });
        }
      } catch (notifErr) {
        logger.error(`Payment notification failed: ${notifErr.message}`);
      }
    });

    // Route settlement to merchant's linked Razorpay account (non-blocking)
    setImmediate(async () => {
      try {
        const merchant = await Merchant.findById(transaction.merchantId);

        if (merchant && merchant.isRazorpayLinked && merchant.razorpayLinkedAccountId) {
          const rzpPaymentId = transaction.cfPaymentId;
          if (rzpPaymentId && rzpPaymentId.startsWith('pay_')) {
            const partnerService = require('./partnerService');
            await partnerService.createTransfer({
              paymentId: rzpPaymentId,
              merchantLinkedAccountId: merchant.razorpayLinkedAccountId,
              settlementAmount: transaction.settlementAmount,
              orderId: transaction.orderId,
            });
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
  processQRCodeCreditedPayment,
};
