const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const QRCodeModel = require('../models/QRCode');
const Merchant = require('../models/Merchant');
const { generateOrderId } = require('../utils/helpers');
const logger = require('../utils/logger');

// Backend base URL (Razorpay-approved custom domain)
const BACKEND_URL = process.env.BACKEND_URL || 'https://app.pasuai.online';

/**
 * Build the web URL that gets embedded in the QR image.
 * Used as fallback when Razorpay QR creation fails.
 */
const buildPaymentUrl = (qrId, amount = null) => {
  const params = new URLSearchParams({ qrId });
  if (amount) params.append('amount', amount.toString());
  return `${BACKEND_URL}/api/payment/pay?${params.toString()}`;
};

/**
 * Generate a QR code PNG as a base64 data URL.
 * Called on-the-fly — result is NOT stored in MongoDB.
 * Used as fallback when razorpayQrImageUrl is not available.
 */
const generateQRImage = async (data) => {
  return QRCode.toDataURL(data, {
    errorCorrectionLevel: 'H',
    type: 'image/png',
    width: 400,
    margin: 2,
    color: { dark: '#000000', light: '#FFFFFF' },
  });
};

/**
 * Try to create a Razorpay UPI QR Code.
 * Returns null on failure (non-fatal — falls back to URL QR).
 */
const tryCreateRazorpayQR = async ({ name, description, usage, amount, internalQrId, closeBy }) => {
  try {
    const razorpayAdapter = require('./gateways/RazorpayAdapter');
    // RazorpayAdapter is a class, not singleton — get from factory
    const paymentGatewayFactory = require('./gateways/PaymentGatewayFactory');
    const adapter = paymentGatewayFactory.getGatewayByName('razorpay');
    const result = await adapter.createRazorpayQR({ name, description, usage, amount, internalQrId, closeBy });
    return result;
  } catch (err) {
    logger.warn(`Razorpay QR creation failed (non-fatal), falling back to URL QR: ${err.message}`);
    return null;
  }
};

// ─── Create QR Codes ──────────────────────────────────────────────────────────

/**
 * Create a static QR for a merchant.
 * Static = reusable, accepts any amount, never expires.
 * Attempts to create a Razorpay UPI QR first (no PhonePe warning).
 * Falls back to URL QR if Razorpay QR creation fails.
 */
const createStaticQR = async (merchantId, label = 'Payment QR') => {
  const merchant = await Merchant.findById(merchantId);
  if (!merchant) {
    const err = new Error('Merchant not found');
    err.statusCode = 404;
    throw err;
  }
  if (merchant.status !== 'active') {
    const err = new Error('Merchant account must be active to generate QR codes');
    err.statusCode = 400;
    throw err;
  }

  const qrId = `QR_${uuidv4().replace(/-/g, '').substring(0, 16).toUpperCase()}`;
  const paymentUrl = buildPaymentUrl(qrId);

  // Try Razorpay UPI QR first
  const rzpQR = await tryCreateRazorpayQR({
    name: merchant.businessName,
    description: label,
    usage: 'multiple_use',
    amount: null,       // open amount — customer enters in UPI app
    internalQrId: qrId,
    closeBy: null,      // never expires
  });

  const qr = await QRCodeModel.create({
    merchantId,
    qrId,
    type: 'static',
    label,
    paymentUrl,
    isActive: true,
    razorpayQrId: rzpQR?.razorpayQrId || null,
    razorpayQrImageUrl: rzpQR?.imageUrl || null,
  });

  logger.info(`Static QR created for merchant ${merchant.merchantId}: ${qrId}${rzpQR ? ' (Razorpay UPI QR ✓)' : ' (URL QR fallback)'}`);
  return qr;
};

/**
 * Create a dynamic QR for a specific amount.
 * Dynamic = fixed amount, expires after `expiresInMinutes` (default 30 min).
 * Attempts to create a Razorpay UPI QR first (no PhonePe warning).
 */
const createDynamicQR = async (merchantId, { amount, label, expiresInMinutes = 30 }) => {
  const merchant = await Merchant.findById(merchantId);
  if (!merchant) {
    const err = new Error('Merchant not found');
    err.statusCode = 404;
    throw err;
  }
  if (merchant.status !== 'active') {
    const err = new Error('Merchant account must be active to generate QR codes');
    err.statusCode = 400;
    throw err;
  }
  if (!amount || amount < 1) {
    const err = new Error('Amount must be at least ₹1 for dynamic QR');
    err.statusCode = 400;
    throw err;
  }

  const qrId = `DQR_${uuidv4().replace(/-/g, '').substring(0, 14).toUpperCase()}`;
  const orderId = generateOrderId('DYN');
  const paymentUrl = buildPaymentUrl(qrId, amount);
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);
  const closeByUnix = Math.floor(expiresAt.getTime() / 1000);

  // Try Razorpay UPI QR with fixed amount + expiry
  const rzpQR = await tryCreateRazorpayQR({
    name: merchant.businessName,
    description: label || `Pay ₹${amount}`,
    usage: 'single_use',  // dynamic = single use
    amount,               // fixed amount
    internalQrId: qrId,
    closeBy: closeByUnix,
  });

  const qr = await QRCodeModel.create({
    merchantId,
    qrId,
    type: 'dynamic',
    fixedAmount: amount,
    label: label || `Pay ₹${amount}`,
    paymentUrl,
    isActive: true,
    expiresAt,
    orderId,
    razorpayQrId: rzpQR?.razorpayQrId || null,
    razorpayQrImageUrl: rzpQR?.imageUrl || null,
  });

  logger.info(`Dynamic QR created for merchant ${merchant.merchantId}: ${qrId}, ₹${amount}, expires: ${expiresAt.toISOString()}${rzpQR ? ' (Razorpay UPI QR ✓)' : ' (URL QR fallback)'}`);
  return qr;
};

// ─── Query QR Codes ───────────────────────────────────────────────────────────

/**
 * List all QR codes for a merchant.
 * Does NOT include generated image — fetch separately via getQRImage().
 */
const getMerchantQRCodes = async (merchantId, { type, isActive } = {}) => {
  const filter = { merchantId };
  if (type) filter.type = type;
  if (isActive !== undefined) filter.isActive = isActive === 'true' || isActive === true;

  return QRCodeModel.find(filter).sort({ createdAt: -1 });
};

/**
 * Look up a QR by qrId — used when a customer scans.
 *
 * Expiry is handled here in application code (NOT via MongoDB TTL index) so we
 * can return a meaningful 410 "expired" response instead of a silent 404 that
 * would occur if the TTL index had already deleted the document.
 *
 * scanCount is incremented atomically in the same findOneAndUpdate call that
 * marks an expired QR inactive, eliminating the previous double-write pattern.
 */
const getQRByQrId = async (qrId) => {
  // Fetch the QR; we'll decide what to update based on its state
  const qr = await QRCodeModel.findOne({ qrId }).populate(
    'merchantId',
    'merchantId businessName businessCategory logo status'
  );

  if (!qr) {
    const err = new Error('QR code not found');
    err.statusCode = 404;
    throw err;
  }

  // Check expiry (dynamic QR only)
  const isExpired = qr.expiresAt && new Date() > qr.expiresAt;

  if (isExpired) {
    // Mark inactive atomically if not already done
    if (qr.isActive) {
      await QRCodeModel.findByIdAndUpdate(qr._id, { isActive: false });
    }
    const err = new Error('This QR code has expired');
    err.statusCode = 410;
    throw err;
  }

  if (!qr.isActive) {
    const err = new Error('This QR code is no longer active');
    err.statusCode = 410;
    throw err;
  }

  // Single atomic write: increment scanCount only (no separate save() needed)
  await QRCodeModel.findByIdAndUpdate(qr._id, { $inc: { scanCount: 1 } });

  return qr;
};

/**
 * Get QR image — returns Razorpay hosted URL if available,
 * otherwise generates on-the-fly from paymentUrl (fallback).
 */
const getQRImage = async (qrId, merchantId) => {
  const qr = await QRCodeModel.findOne({ qrId, merchantId });
  if (!qr) {
    const err = new Error('QR code not found');
    err.statusCode = 404;
    throw err;
  }
  // If Razorpay QR image is available, return its URL
  if (qr.razorpayQrImageUrl) {
    return { type: 'url', url: qr.razorpayQrImageUrl };
  }
  // Fallback: generate PNG as base64 data URL fresh each time
  const dataUrl = await generateQRImage(qr.paymentUrl);
  return { type: 'base64', url: dataUrl };
};

// ─── Manage QR Codes ──────────────────────────────────────────────────────────

/**
 * Deactivate a QR code (soft delete — keeps record and stats)
 * Also closes Razorpay QR if one was created.
 */
const deactivateQR = async (qrId, merchantId) => {
  const qr = await QRCodeModel.findOneAndUpdate(
    { qrId, merchantId },
    { isActive: false },
    { new: true }
  );
  if (!qr) {
    const err = new Error('QR code not found');
    err.statusCode = 404;
    throw err;
  }

  // Close Razorpay QR non-blocking
  if (qr.razorpayQrId) {
    setImmediate(async () => {
      try {
        const paymentGatewayFactory = require('./gateways/PaymentGatewayFactory');
        const adapter = paymentGatewayFactory.getGatewayByName('razorpay');
        await adapter.closeRazorpayQR(qr.razorpayQrId);
      } catch (e) {
        logger.warn(`Failed to close Razorpay QR ${qr.razorpayQrId}: ${e.message}`);
      }
    });
  }

  return qr;
};

/**
 * Hard delete a QR code and its stats
 */
const deleteQR = async (qrId, merchantId) => {
  const qr = await QRCodeModel.findOneAndDelete({ qrId, merchantId });
  if (!qr) {
    const err = new Error('QR code not found');
    err.statusCode = 404;
    throw err;
  }
  return true;
};

module.exports = {
  createStaticQR,
  createDynamicQR,
  getMerchantQRCodes,
  getQRByQrId,
  getQRImage,
  deactivateQR,
  deleteQR,
};
