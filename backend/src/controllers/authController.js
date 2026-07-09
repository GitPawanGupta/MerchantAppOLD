const { body } = require('express-validator');
const authService = require('../services/authService');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const logger = require('../utils/logger');

// ─── Validation Rules ─────────────────────────────────────────────────────────
const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
  body('email').isEmail().withMessage('Valid email required').normalizeEmail(),
  body('phone')
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Valid 10-digit Indian phone number required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain uppercase, lowercase, and a number'),
  body('businessName').optional().trim().isLength({ max: 200 }),
  body('businessCategory').optional().isIn([
    'retail', 'restaurant', 'grocery', 'healthcare', 'education',
    'services', 'ecommerce', 'travel', 'entertainment', 'utility', 'other',
  ]),
];

const loginValidation = [
  body('email').isEmail().withMessage('Valid email required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password required'),
];

const changePasswordValidation = [
  body('currentPassword').notEmpty().withMessage('Current password required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('New password must contain uppercase, lowercase, and a number'),
];

// ─── Handlers ────────────────────────────────────────────────────────────────

/**
 * POST /api/auth/register
 */
const register = async (req, res, next) => {
  try {
    const { name, email, phone, password, businessName, businessCategory } = req.body;

    const result = await authService.registerMerchant({
      name, email, phone, password, businessName, businessCategory,
    });

    // Set refresh token as httpOnly cookie
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    return successResponse(
      res,
      {
        accessToken: result.accessToken,
        user: {
          id: result.user._id,
          name: result.user.name,
          email: result.user.email,
          phone: result.user.phone,
          role: result.user.role,
        },
        merchant: {
          id: result.merchant._id,
          merchantId: result.merchant.merchantId,
          businessName: result.merchant.businessName,
          status: result.merchant.status,
        },
      },
      'Registration successful',
      201
    );
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/login
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await authService.login({ email, password });

    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    // Attach merchant info if role is merchant
    let merchantInfo = null;
    if (result.user.role === 'merchant') {
      const Merchant = require('../models/Merchant');
      const merchant = await Merchant.findOne({ userId: result.user._id });
      if (merchant) {
        merchantInfo = {
          id: merchant._id,
          merchantId: merchant.merchantId,
          businessName: merchant.businessName,
          status: merchant.status,
          kycStatus: merchant.kyc?.status,
          isRazorpayLinked: merchant.isRazorpayLinked || false,
          razorpayLinkedAccountId: merchant.razorpayLinkedAccountId || null,
          requiresReAuth: merchant.requiresReAuth || false,
        };
      }
    }

    return successResponse(res, {
      accessToken: result.accessToken,
      user: {
        id: result.user._id,
        name: result.user.name,
        email: result.user.email,
        phone: result.user.phone,
        role: result.user.role,
        lastLogin: result.user.lastLogin,
      },
      merchant: merchantInfo,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/refresh
 */
const refreshToken = async (req, res, next) => {
  try {
    const incomingToken = req.cookies?.refreshToken || req.body?.refreshToken;
    const result = await authService.refreshAccessToken(incomingToken);

    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return successResponse(res, { accessToken: result.accessToken }, 'Token refreshed');
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/logout
 */
const logout = async (req, res, next) => {
  try {
    await authService.logout(req.user._id);

    res.clearCookie('refreshToken');
    return successResponse(res, {}, 'Logged out successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/auth/me
 */
const getMe = async (req, res, next) => {
  try {
    const user = req.user.toObject();
    delete user.password;
    delete user.refreshToken;

    let merchantInfo = null;
    if (req.user.role === 'merchant') {
      const Merchant = require('../models/Merchant');
      const merchant = await Merchant.findOne({ userId: req.user._id }).select(
        'merchantId businessName status kyc.status commissionRate totalCollected totalSettled pendingSettlement settlementPreference bankDetails bankAccounts isRazorpayLinked razorpayLinkedAccountId razorpayLinkedAt requiresReAuth'
      );
      if (merchant) {
        const m = merchant.toObject();
        // Mask account numbers for security
        if (m.bankDetails?.accountNumber) {
          m.bankDetails.accountNumber = m.bankDetails.accountNumber.slice(-4).padStart(m.bankDetails.accountNumber.length, '•');
        }
        if (Array.isArray(m.bankAccounts)) {
          m.bankAccounts = m.bankAccounts.map(acc => ({
            ...acc,
            accountNumber: acc.accountNumber
              ? acc.accountNumber.slice(-4).padStart(acc.accountNumber.length, '•')
              : acc.accountNumber,
          }));
        }
        merchantInfo = m;
      }
    }

    return successResponse(res, { user, merchant: merchantInfo });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/auth/change-password
 */
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    await authService.changePassword(req.user._id, currentPassword, newPassword);
    return successResponse(res, {}, 'Password changed successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  registerValidation,
  loginValidation,
  changePasswordValidation,
  register,
  login,
  refreshToken,
  logout,
  getMe,
  changePassword,
};
