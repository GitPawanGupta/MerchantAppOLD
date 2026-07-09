const { body, param } = require('express-validator');
const merchantService = require('../services/merchantService');
const { successResponse, errorResponse } = require('../utils/apiResponse');

// ─── Validation ───────────────────────────────────────────────────────────────
const updateProfileValidation = [
  body('businessName').optional().trim().isLength({ min: 2, max: 200 }),
  body('businessCategory').optional().isIn([
    'retail', 'restaurant', 'grocery', 'healthcare', 'education',
    'services', 'ecommerce', 'travel', 'entertainment', 'utility', 'other',
  ]),
  body('website').optional().isURL().withMessage('Invalid website URL'),
  body('businessAddress.pincode').optional().matches(/^\d{6}$/).withMessage('Invalid pincode'),
];

const kycValidation = [
  body('panNumber')
    .optional()
    .matches(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/)
    .withMessage('Invalid PAN number'),
  body('gstNumber')
    .optional()
    .matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/)
    .withMessage('Invalid GST number'),
  body('aadharNumber')
    .optional()
    .matches(/^\d{12}$/)
    .withMessage('Aadhaar must be 12 digits'),
  body('businessType').optional().isIn([
    'individual', 'proprietorship', 'partnership', 'pvt_ltd', 'ltd', 'llp', 'other',
  ]),
];

const bankValidation = [
  body('accountHolderName').trim().notEmpty().withMessage('Account holder name required'),
  body('accountNumber').trim().notEmpty().withMessage('Account number required')
    .isLength({ min: 9, max: 18 }).withMessage('Invalid account number length'),
  body('ifscCode')
    .trim()
    .matches(/^[A-Z]{4}0[A-Z0-9]{6}$/)
    .withMessage('Invalid IFSC code'),
  body('bankName').trim().notEmpty().withMessage('Bank name required'),
  body('accountType').optional().isIn(['savings', 'current']),
];

// ─── Handlers ────────────────────────────────────────────────────────────────

/**
 * GET /api/merchant/profile
 */
const getProfile = async (req, res, next) => {
  try {
    const profile = await merchantService.getProfile(req.merchant._id);
    return successResponse(res, profile);
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/merchant/profile
 */
const updateProfile = async (req, res, next) => {
  try {
    const updated = await merchantService.updateProfile(req.merchant._id, req.body);
    return successResponse(res, updated, 'Profile updated successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/merchant/kyc
 */
const submitKYC = async (req, res, next) => {
  try {
    // memoryStorage: files come as buffer — convert to base64 data URIs for storage
    const files = {};
    if (req.files?.panDoc) {
      const f = req.files.panDoc[0];
      files.panDoc = `data:${f.mimetype};base64,${f.buffer.toString('base64')}`;
    }
    if (req.files?.aadharDoc) {
      const f = req.files.aadharDoc[0];
      files.aadharDoc = `data:${f.mimetype};base64,${f.buffer.toString('base64')}`;
    }
    if (req.files?.gstDoc) {
      const f = req.files.gstDoc[0];
      files.gstDoc = `data:${f.mimetype};base64,${f.buffer.toString('base64')}`;
    }

    const updated = await merchantService.submitKYC(req.merchant._id, req.body, files);
    return successResponse(res, { kyc: updated.kyc }, 'KYC submitted for review');
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/merchant/kyc
 */
const getKYCStatus = async (req, res, next) => {
  try {
    const merchant = req.merchant;
    return successResponse(res, {
      status: merchant.kyc?.status || 'pending',
      panNumber: merchant.kyc?.panNumber,
      gstNumber: merchant.kyc?.gstNumber,
      businessType: merchant.kyc?.businessType,
      rejectionReason: merchant.kyc?.rejectionReason,
      verifiedAt: merchant.kyc?.verifiedAt,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/merchant/bank-details
 */
const updateBankDetails = async (req, res, next) => {
  try {
    const updated = await merchantService.updateBankDetails(req.merchant._id, req.body);
    return successResponse(res, { bankDetails: updated.bankDetails }, 'Bank details saved');
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/merchant/bank-details
 */
const getBankDetails = async (req, res, next) => {
  try {
    const { maskString } = require('../utils/helpers');
    const bank = req.merchant.bankDetails;
    if (!bank) {
      return successResponse(res, null, 'No bank details on file');
    }
    return successResponse(res, {
      accountHolderName: bank.accountHolderName,
      accountNumber: maskString(bank.accountNumber, 4),
      ifscCode: bank.ifscCode,
      bankName: bank.bankName,
      accountType: bank.accountType,
      isVerified: bank.isVerified,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/merchant/verify-ifsc
 */
const verifyIFSC = async (req, res, next) => {
  try {
    const { ifsc } = req.query;
    if (!ifsc) {
      return errorResponse(res, 'IFSC code is required', 400);
    }
    const result = await merchantService.verifyIFSC(ifsc);
    return successResponse(res, result, 'IFSC verified');
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/merchant/dashboard
 */
const getDashboard = async (req, res, next) => {
  try {
    const summary = await merchantService.getDashboardSummary(req.merchant._id);
    return successResponse(res, summary);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/merchant/bank-accounts
 */
const getBankAccounts = async (req, res, next) => {
  try {
    const { maskString } = require('../utils/helpers');
    const accounts = await merchantService.getBankAccounts(req.merchant._id);
    const masked = accounts.map(bank => ({
      _id: bank._id,
      accountHolderName: bank.accountHolderName,
      accountNumber: maskString(bank.accountNumber, 4),
      ifscCode: bank.ifscCode,
      bankName: bank.bankName,
      accountType: bank.accountType,
      isPrimary: bank.isPrimary,
      isVerified: bank.isVerified,
    }));
    return successResponse(res, masked);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/merchant/bank-accounts
 */
const addBankAccount = async (req, res, next) => {
  try {
    const accounts = await merchantService.addBankAccount(req.merchant._id, req.body);
    return successResponse(res, accounts, 'Bank account added successfully', 201);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/merchant/bank-accounts/:id/primary
 */
const setPrimaryBankAccount = async (req, res, next) => {
  try {
    const accounts = await merchantService.setPrimaryBankAccount(req.merchant._id, req.params.id);
    return successResponse(res, accounts, 'Primary bank account updated');
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/merchant/bank-accounts/:id
 */
const deleteBankAccount = async (req, res, next) => {
  try {
    const accounts = await merchantService.deleteBankAccount(req.merchant._id, req.params.id);
    return successResponse(res, accounts, 'Bank account deleted');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  updateProfileValidation,
  kycValidation,
  bankValidation,
  getProfile,
  updateProfile,
  submitKYC,
  getKYCStatus,
  updateBankDetails,
  getBankDetails,
  getDashboard,
  verifyIFSC,
  getBankAccounts,
  addBankAccount,
  setPrimaryBankAccount,
  deleteBankAccount,
};
