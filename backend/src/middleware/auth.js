const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { errorResponse } = require('../utils/apiResponse');

/**
 * Verify JWT access token
 */
const authenticate = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      return errorResponse(res, 'Access token required', 401);
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select('+passwordChangedAt');
    if (!user) {
      return errorResponse(res, 'User no longer exists', 401);
    }

    if (!user.isActive) {
      return errorResponse(res, 'Account is deactivated', 403);
    }

    if (user.changedPasswordAfter(decoded.iat)) {
      return errorResponse(res, 'Password recently changed. Please login again', 401);
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return errorResponse(res, 'Access token expired', 401);
    }
    if (error.name === 'JsonWebTokenError') {
      return errorResponse(res, 'Invalid access token', 401);
    }
    return errorResponse(res, 'Authentication failed', 401);
  }
};

/**
 * Restrict to specific roles
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return errorResponse(
        res,
        `Role '${req.user.role}' is not authorized for this action`,
        403
      );
    }
    next();
  };
};

/**
 * Attach merchant profile to req (for merchant routes)
 */
const attachMerchant = async (req, res, next) => {
  try {
    const Merchant = require('../models/Merchant');
    const merchant = await Merchant.findOne({ userId: req.user._id });

    if (!merchant) {
      return errorResponse(res, 'Merchant profile not found', 404);
    }

    req.merchant = merchant;
    next();
  } catch (error) {
    return errorResponse(res, 'Failed to load merchant profile', 500);
  }
};

module.exports = { authenticate, authorize, attachMerchant };
