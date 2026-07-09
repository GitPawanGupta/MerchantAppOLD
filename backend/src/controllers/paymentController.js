const { body, query } = require('express-validator');
const paymentService = require('../services/paymentService');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const { getPaginationParams, buildPaginationMeta } = require('../utils/helpers');
const { buildPayPage, buildResultPage, buildErrorPage } = require('./payPageBuilder');
const Transaction = require('../models/Transaction');
const QRCode = require('../models/QRCode');
const Merchant = require('../models/Merchant');
const logger = require('../utils/logger');

// ─── Validation ───────────────────────────────────────────────────────────────
const createOrderValidation = [
  body('qrId').trim().notEmpty().withMessage('qrId is required'),
  body('amount').optional().isFloat({ min: 1 }).withMessage('Amount must be at least ₹1'),
  body('customerName').optional().trim().isLength({ max: 100 }),
  body('customerEmail').optional().isEmail().normalizeEmail(),
  body('customerPhone')
    .optional()
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Invalid phone number'),
];

// ─── createOrder ──────────────────────────────────────────────────────────────
const createOrder = async (req, res, next) => {
  try {
    const { qrId, amount, customerName, customerEmail, customerPhone } = req.body;
    const result = await paymentService.createPaymentOrder({ qrId, amount, customerName, customerEmail, customerPhone });
    return successResponse(res, {
      orderId: result.orderId,
      rzpOrderId: result.gatewayOrderId, // Use gatewayOrderId from service
      amount: result.amount,
      merchant: result.merchant,
    }, 'Payment order created', 201);
  } catch (error) { next(error); }
};

// ─── verifyPayment ────────────────────────────────────────────────────────────
const verifyPayment = async (req, res, next) => {
  try {
    const { order_id, razorpay_payment_id, razorpay_signature } = req.query;
    if (!order_id) return errorResponse(res, 'order_id is required', 400);
    const transaction = await paymentService.verifyPaymentOrder(order_id, razorpay_payment_id || null, razorpay_signature || null);
    return successResponse(res, {
      orderId: transaction.orderId,
      status: transaction.status,
      amount: transaction.amount,
      paymentMethod: transaction.paymentMethod,
      paymentTime: transaction.paymentTime,
      rzpPaymentId: transaction.cfPaymentId,
      rzpReferenceId: transaction.cfReferenceId,
    });
  } catch (error) { next(error); }
};

// ─── webhook ──────────────────────────────────────────────────────────────────
const webhook = async (req, res, next) => {
  try {
    const rawBody = req.rawBody || JSON.stringify(req.body);
    const result = await paymentService.processWebhook(rawBody, req.headers, req.body);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    logger.error(`Webhook error: ${error.message}`);
    return res.status(200).json({ success: false, message: error.message });
  }
};

// ─── showPayPage ──────────────────────────────────────────────────────────────
const showPayPage = async (req, res, next) => {
  try {
    logger.info(`showPayPage hit: ${req.originalUrl}`);

    // ── Resolve qrId from query (handles all casing variants) ──
    let qrId = req.query.qrId || req.query.qrid || req.query.qr_id;
    if (!qrId) {
      for (const key of Object.keys(req.query)) {
        if (key.toLowerCase().includes('qrid') || key.toLowerCase().includes('qr_id')) {
          qrId = req.query[key]; break;
        }
      }
    }
    if (!qrId) {
      const m = (req.originalUrl || '').match(/(?:qrId|qrid|qr_id)=([^&?#\s]+)/i);
      if (m) qrId = decodeURIComponent(m[1]);
    }

    if (!qrId) {
      return res.status(400).send(buildErrorPage({
        icon: '🔗',
        title: 'Invalid Link',
        message: 'This payment link is missing required information. Please ask the merchant for a valid QR code.',
      }));
    }

    // ── Fetch QR + merchant ──
    const qr = await QRCode.findOne({ qrId }).populate('merchantId');

    // Not found at all
    if (!qr || !qr.merchantId) {
      return res.status(404).send(buildErrorPage({
        icon: '❌',
        title: 'QR Code Not Found',
        message: 'This QR code does not exist or has been removed. Please ask the merchant for a new one.',
      }));
    }

    // Expired dynamic QR — mark inactive and show proper message
    if (qr.expiresAt && new Date() > qr.expiresAt) {
      if (qr.isActive) {
        await QRCode.findByIdAndUpdate(qr._id, { isActive: false });
      }
      return res.status(410).send(buildErrorPage({
        icon: '⏰',
        title: 'QR Code Expired',
        message: 'This payment link has expired. Please ask the merchant to generate a new QR code.',
      }));
    }

    // Inactive QR
    if (!qr.isActive) {
      return res.status(410).send(buildErrorPage({
        icon: '🚫',
        title: 'QR Code Inactive',
        message: 'This QR code has been deactivated. Please ask the merchant for an active QR code.',
      }));
    }

    // Merchant not active
    if (qr.merchantId.status !== 'active') {
      return res.status(403).send(buildErrorPage({
        icon: '🏪',
        title: 'Merchant Unavailable',
        message: 'This merchant is currently not accepting payments. Please try again later.',
      }));
    }

    // ── Increment scan count (atomic) ──
    await QRCode.findByIdAndUpdate(qr._id, { $inc: { scanCount: 1 } });

    // ── Build page opts ──
    const merchant         = qr.merchantId;
    const merchantName     = merchant.businessName;
    const merchantCategory = merchant.businessCategory || 'Business';
    const label            = qr.label || 'Payment';
    const fixedAmount      = qr.fixedAmount || 0;
    const rzpKeyId         = process.env.RAZORPAY_KEY_ID;
    const avatarLetter     = merchantName.charAt(0).toUpperCase();
    const logoUrl          = merchant.logo || null;

    return res.send(buildPayPage({
      merchantName,
      merchantCategory,
      label,
      fixedAmount,
      rzpKeyId,
      qrId,
      avatarLetter,
      logoUrl,
    }));
  } catch (error) { next(error); }
};

// ─── paymentReturn ────────────────────────────────────────────────────────────
const paymentReturn = async (req, res, next) => {
  const { order_id, razorpay_payment_id, razorpay_signature, error } = req.query;
  try {
    // Validate minimum params
    if (!order_id) {
      return res.status(400).send(buildErrorPage({
        icon: '🔗',
        title: 'Invalid Return',
        message: 'Order information is missing. Please contact the merchant.',
      }));
    }

    const tx = await paymentService.verifyPaymentOrder(
      order_id,
      razorpay_payment_id || null,
      razorpay_signature  || null
    );

    const merchant     = await Merchant.findById(tx.merchantId).select('businessName');
    const merchantName = merchant ? merchant.businessName : 'Merchant';
    const isSuccess    = tx.status === 'success';

    return res.send(buildResultPage({
      isSuccess,
      merchantName,
      amount:      tx.amount,
      orderId:     tx.orderId,
      paymentId:   tx.cfPaymentId   || null,
      referenceId: tx.cfReferenceId || null,
      errorMsg:    error || tx.failureReason || null,
    }));
  } catch (err) {
    // Even on unexpected errors show a clean result page, not a raw crash
    logger.error(`paymentReturn error: ${err.message}`);
    return res.status(500).send(buildResultPage({
      isSuccess:    false,
      merchantName: 'Merchant',
      amount:       0,
      orderId:      order_id || 'N/A',
      paymentId:    null,
      referenceId:  null,
      errorMsg:     'Unable to verify payment status. Please contact support with your Order ID.',
    }));
  }
};

// ─── listTransactions ─────────────────────────────────────────────────────────
const listTransactions = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPaginationParams(req.query);
    const { status, startDate, endDate, paymentMethod } = req.query;
    const filter = { merchantId: req.merchant._id };
    if (status) filter.status = status;
    if (paymentMethod) filter.paymentMethod = paymentMethod;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }
    const [transactions, total] = await Promise.all([
      Transaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
        .select('-webhookData -commissionAmount -commissionRate -settlementAmount'),
      Transaction.countDocuments(filter),
    ]);
    return res.status(200).json({
      success: true, data: transactions,
      pagination: buildPaginationMeta(total, page, limit),
      timestamp: new Date().toISOString(),
    });
  } catch (error) { next(error); }
};

// ─── getTransaction ───────────────────────────────────────────────────────────
const getTransaction = async (req, res, next) => {
  try {
    const tx = await paymentService.getTransactionByOrderId(req.params.orderId, req.merchant._id);
    return successResponse(res, tx);
  } catch (error) { next(error); }
};

module.exports = {
  createOrderValidation, createOrder, verifyPayment, webhook,
  paymentReturn, listTransactions, getTransaction, showPayPage,
};
