const { body, query } = require('express-validator');
const qrService = require('../services/qrService');
const { successResponse, errorResponse } = require('../utils/apiResponse');

// ─── Validation ───────────────────────────────────────────────────────────────
const staticQRValidation = [
  body('label').optional().trim().isLength({ max: 100 }),
];

const dynamicQRValidation = [
  body('amount')
    .isFloat({ min: 1 })
    .withMessage('Amount must be at least ₹1'),
  body('label').optional().trim().isLength({ max: 100 }),
  body('expiresInMinutes')
    .optional()
    .isInt({ min: 5, max: 1440 })
    .withMessage('Expiry must be between 5 and 1440 minutes'),
];

// ─── Handlers ────────────────────────────────────────────────────────────────

/**
 * POST /api/qr/static
 * Create a static QR for the logged-in merchant
 */
const createStaticQR = async (req, res, next) => {
  try {
    const qr = await qrService.createStaticQR(req.merchant._id, req.body.label);
    return successResponse(res, qr, 'Static QR code created', 201);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/qr/dynamic
 * Create a dynamic QR for a specific amount
 */
const createDynamicQR = async (req, res, next) => {
  try {
    const { amount, label, expiresInMinutes } = req.body;
    const qr = await qrService.createDynamicQR(req.merchant._id, {
      amount,
      label,
      expiresInMinutes,
    });
    return successResponse(res, qr, 'Dynamic QR code created', 201);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/qr
 * List all QR codes for the merchant
 */
const listQRCodes = async (req, res, next) => {
  try {
    const qrCodes = await qrService.getMerchantQRCodes(req.merchant._id, req.query);
    return successResponse(res, qrCodes);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/qr/:qrId/image
 * Get QR image as base64 (for download / display)
 */
const getQRImage = async (req, res, next) => {
  try {
    const base64 = await qrService.getQRImage(req.params.qrId, req.merchant._id);
    // Return as PNG binary
    const imgBuffer = Buffer.from(base64.split(',')[1], 'base64');
    res.set('Content-Type', 'image/png');
    res.set('Content-Disposition', `attachment; filename="qr_${req.params.qrId}.png"`);
    return res.send(imgBuffer);
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/qr/:qrId/deactivate
 */
const deactivateQR = async (req, res, next) => {
  try {
    const qr = await qrService.deactivateQR(req.params.qrId, req.merchant._id);
    return successResponse(res, qr, 'QR code deactivated');
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/qr/:qrId
 */
const deleteQR = async (req, res, next) => {
  try {
    await qrService.deleteQR(req.params.qrId, req.merchant._id);
    return successResponse(res, {}, 'QR code deleted');
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/qr/scan/:qrId  (PUBLIC — called when customer scans)
 * Returns merchant info + payment details without auth
 */
const scanQR = async (req, res, next) => {
  try {
    const qr = await qrService.getQRByQrId(req.params.qrId);
    return successResponse(res, {
      qrId: qr.qrId,
      type: qr.type,
      fixedAmount: qr.fixedAmount,
      label: qr.label,
      merchant: qr.merchantId,
      paymentUrl: qr.paymentUrl,
      expiresAt: qr.expiresAt,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  staticQRValidation,
  dynamicQRValidation,
  createStaticQR,
  createDynamicQR,
  listQRCodes,
  getQRImage,
  deactivateQR,
  deleteQR,
  scanQR,
};
