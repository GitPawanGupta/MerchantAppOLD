const { body, query } = require('express-validator');
const paymentService = require('../services/paymentService');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const { getPaginationParams, buildPaginationMeta } = require('../utils/helpers');
const { buildPayPage } = require('./payPageBuilder');
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
      rzpOrderId: result.rzpOrderId,
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
    const signature = req.headers['x-razorpay-signature'];
    const result = await paymentService.processWebhook(rawBody, signature, req.body);
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
    if (!qrId) return res.status(400).send('<h1>Invalid Request: qrId is required</h1>');

    const qr = await QRCode.findOne({ qrId, isActive: true }).populate('merchantId');
    if (!qr || !qr.merchantId) {
      return res.status(404).send(`<!DOCTYPE html><html><head><meta charset="UTF-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Invalid QR</title>
        <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:sans-serif;background:#f0f4ff;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}.card{background:#fff;border-radius:20px;padding:48px 32px;text-align:center;max-width:360px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,.08)}.icon{font-size:48px;margin-bottom:16px}h2{font-size:20px;font-weight:700;color:#111;margin-bottom:8px}p{font-size:14px;color:#6b7280}</style>
        </head><body><div class="card"><div class="icon">❌</div><h2>QR Code Not Found</h2><p>This QR code is invalid, inactive, or expired.</p></div></body></html>`);
    }

    const merchantName = qr.merchantId.businessName;
    const label        = qr.label || 'Payment';
    const fixedAmount  = qr.fixedAmount || 0;
    const rzpKeyId     = process.env.RAZORPAY_KEY_ID;
    const avatarLetter = merchantName.charAt(0).toUpperCase();
    const safeMerchant = merchantName.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/'/g, "\\'");
    const safeLabel    = label.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/'/g, "\\'");

    return res.send(buildPayPage({ merchantName, label, fixedAmount, rzpKeyId, qrId, avatarLetter, safeMerchant, safeLabel }));
  } catch (error) { next(error); }
};

// ─── paymentReturn ────────────────────────────────────────────────────────────
const paymentReturn = async (req, res, next) => {
  const { order_id, razorpay_payment_id, razorpay_signature, error } = req.query;
  try {
    const tx = await paymentService.verifyPaymentOrder(
      order_id,
      razorpay_payment_id || null,
      razorpay_signature || null
    );
    const merchant = await Merchant.findById(tx.merchantId);
    const merchantName = merchant ? merchant.businessName : 'Merchant';
    const isSuccess = tx.status === 'success';

    return res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>Payment ${isSuccess ? 'Successful' : 'Failed'}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Inter',sans-serif;background:#f0f4ff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;}
.card{background:#fff;border-radius:24px;box-shadow:0 4px 32px rgba(0,0,0,.1);width:100%;max-width:400px;overflow:hidden;}
.result-header{padding:40px 24px 28px;text-align:center;background:${isSuccess ? 'linear-gradient(135deg,#dcfce7,#bbf7d0)' : 'linear-gradient(135deg,#fee2e2,#fecaca)'};}
.result-icon{width:72px;height:72px;border-radius:50%;background:${isSuccess ? '#16a34a' : '#dc2626'};color:#fff;font-size:32px;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;}
.result-title{font-size:22px;font-weight:800;color:${isSuccess ? '#15803d' : '#b91c1c'};}
.result-sub{font-size:13px;color:${isSuccess ? '#166534' : '#991b1b'};margin-top:6px;}
.details{padding:24px;}
.detail-row{display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid #f3f4f6;}
.detail-row:last-child{border-bottom:none;}
.detail-label{font-size:13px;color:#6b7280;font-weight:500;}
.detail-value{font-size:13px;font-weight:700;color:#111827;text-align:right;max-width:60%;word-break:break-all;}
.detail-value.amount{font-size:18px;color:#528FF0;}
.close-btn{margin:0 24px 24px;display:block;width:calc(100% - 48px);height:52px;background:#111827;color:#fff;border:none;border-radius:14px;font-size:16px;font-weight:700;cursor:pointer;transition:background .2s;}
.close-btn:hover{background:#1f2937;}
.secure-footer{text-align:center;padding:0 24px 20px;font-size:11px;color:#9ca3af;}
</style>
</head>
<body>
<div class="card">
  <div class="result-header">
    <div class="result-icon">${isSuccess ? '&#10003;' : '&#10007;'}</div>
    <div class="result-title">${isSuccess ? 'Payment Successful!' : 'Payment Failed'}</div>
    <div class="result-sub">${isSuccess ? 'Your payment was completed successfully.' : (error || 'There was an issue processing your payment.')}</div>
  </div>
  <div class="details">
    <div class="detail-row"><span class="detail-label">Pay To</span><span class="detail-value">${merchantName}</span></div>
    <div class="detail-row"><span class="detail-label">Amount</span><span class="detail-value amount">&#8377;${tx.amount.toFixed(2)}</span></div>
    <div class="detail-row"><span class="detail-label">Order ID</span><span class="detail-value">${tx.orderId}</span></div>
    ${isSuccess && tx.cfPaymentId ? `<div class="detail-row"><span class="detail-label">Payment ID</span><span class="detail-value">${tx.cfPaymentId}</span></div>` : ''}
    ${isSuccess && tx.cfReferenceId ? `<div class="detail-row"><span class="detail-label">Bank Ref</span><span class="detail-value">${tx.cfReferenceId}</span></div>` : ''}
    <div class="detail-row"><span class="detail-label">Status</span><span class="detail-value" style="color:${isSuccess ? '#16a34a' : '#dc2626'}">${tx.status.toUpperCase()}</span></div>
  </div>
  <button class="close-btn" onclick="window.close()">Done</button>
  <div class="secure-footer">Secured by Razorpay &middot; ISS Instant Settlement</div>
</div>
</body></html>`);
  } catch (err) { next(err); }
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
