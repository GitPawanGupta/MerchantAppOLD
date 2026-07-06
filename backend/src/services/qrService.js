const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const QRCodeModel = require('../models/QRCode');
const Merchant = require('../models/Merchant');
const { generateOrderId } = require('../utils/helpers');
const logger = require('../utils/logger');

// Production backend URL — using custom domain (Razorpay approved)
const CORRECT_BACKEND_URL = 'https://app.pasuai.online';

/**
 * Build the UPI deep link that gets embedded inside the QR.
 * Using UPI deep link means PhonePe/GPay/Paytm will open directly
 * without any "You are leaving" warning popup.
 * Falls back to web URL if merchant has no UPI VPA.
 */
const buildPaymentUrl = (qrId, amount = null, upiVpa = null, merchantName = null) => {
  // If merchant has UPI VPA, embed UPI deep link — no browser redirect, no warnings
  if (upiVpa) {
    const params = new URLSearchParams({
      pa: upiVpa,
      pn: merchantName || 'Merchant',
      cu: 'INR',
      tn: 'Payment via ISS',
    });
    if (amount) params.append('am', amount.toString());
    return `upi://pay?${params.toString()}`;
  }

  // Fallback: web URL (for QRs without UPI VPA)
  const base = `${CORRECT_BACKEND_URL}/api/payment/pay`;
  const params = new URLSearchParams({ qrId });
  if (amount) params.append('amount', amount);
  return `${base}?${params.toString()}`;
};

/**
 * Generate QR code PNG as base64 string
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
 * Create a static QR code for a merchant
 * Static = reusable, any amount, doesn't expire
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
  const upiVpa = merchant.bankDetails?.upiVpa || null;
  const paymentUrl = buildPaymentUrl(qrId, null, upiVpa, merchant.businessName);
  const qrImageBase64 = await generateQRImage(paymentUrl);

  const qr = await QRCodeModel.create({
    merchantId,
    qrId,
    type: 'static',
    label,
    paymentUrl,
    qrImageBase64,
    isActive: true,
  });

  logger.info(`Static QR created for merchant ${merchant.merchantId}: ${qrId}`);
  return qr;
};

/**
 * Create a dynamic QR code — tied to a specific amount/order, can expire
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
  const upiVpa = merchant.bankDetails?.upiVpa || null;
  const paymentUrl = buildPaymentUrl(qrId, amount, upiVpa, merchant.businessName);
  const qrImageBase64 = await generateQRImage(paymentUrl);

  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

  const qr = await QRCodeModel.create({
    merchantId,
    qrId,
    type: 'dynamic',
    fixedAmount: amount,
    label: label || `Pay ₹${amount}`,
    paymentUrl,
    qrImageBase64,
    isActive: true,
    expiresAt,
    orderId,
  });

  logger.info(`Dynamic QR created for merchant ${merchant.merchantId}: ${qrId}, amount: ${amount}`);
  return qr;
};

/**
 * Get all QR codes for a merchant
 */
const getMerchantQRCodes = async (merchantId, { type, isActive } = {}) => {
  const filter = { merchantId };
  if (type) filter.type = type;
  if (isActive !== undefined) filter.isActive = isActive === 'true' || isActive === true;

  const qrCodes = await QRCodeModel.find(filter)
    .select('-qrImageBase64') // exclude heavy base64 in list view
    .sort({ createdAt: -1 });

  return qrCodes;
};

/**
 * Get a single QR code by qrId (public — used when scanning)
 */
const getQRByQrId = async (qrId) => {
  const qr = await QRCodeModel.findOne({ qrId }).populate(
    'merchantId',
    'merchantId businessName businessCategory logo status'
  );

  if (!qr) {
    const err = new Error('QR code not found');
    err.statusCode = 404;
    throw err;
  }

  // Check expiry for dynamic QR
  if (qr.expiresAt && new Date() > qr.expiresAt) {
    qr.isActive = false;
    await qr.save();
    const err = new Error('This QR code has expired');
    err.statusCode = 410;
    throw err;
  }

  if (!qr.isActive) {
    const err = new Error('This QR code is no longer active');
    err.statusCode = 410;
    throw err;
  }

  // Increment scan counter
  await QRCodeModel.findByIdAndUpdate(qr._id, { $inc: { scanCount: 1 } });

  return qr;
};

/**
 * Get QR image (base64) for download
 */
const getQRImage = async (qrId, merchantId) => {
  const qr = await QRCodeModel.findOne({ qrId, merchantId });
  if (!qr) {
    const err = new Error('QR code not found');
    err.statusCode = 404;
    throw err;
  }
  return qr.qrImageBase64;
};

/**
 * Deactivate a QR code
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
  return qr;
};

/**
 * Delete a QR code
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
