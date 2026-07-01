const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const Merchant = require('../models/Merchant');
const logger = require('../utils/logger');

/**
 * Generate access + refresh token pair
 */
const generateTokens = (userId, role) => {
  const accessToken = jwt.sign(
    { id: userId, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  const refreshToken = jwt.sign(
    { id: userId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
  );

  return { accessToken, refreshToken };
};

/**
 * Register a new merchant user + create merchant profile
 */
const registerMerchant = async ({ name, email, phone, password, businessName, businessCategory }) => {
  // Check if user exists
  const existing = await User.findOne({ $or: [{ email }, { phone }] });
  if (existing) {
    const field = existing.email === email ? 'Email' : 'Phone';
    const err = new Error(`${field} is already registered`);
    err.statusCode = 409;
    throw err;
  }

  // Create user
  const user = await User.create({
    name,
    email,
    phone,
    password,
    role: 'merchant',
  });

  // Create merchant profile
  const merchant = await Merchant.create({
    userId: user._id,
    businessName: businessName || name,
    businessCategory: businessCategory || 'other',
  });

  logger.info(`New merchant registered: ${user.email} (${merchant.merchantId})`);

  const { accessToken, refreshToken } = generateTokens(user._id, user.role);

  // Store hashed refresh token
  user.refreshToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
  await user.save({ validateBeforeSave: false });

  return { user, merchant, accessToken, refreshToken };
};

/**
 * Login
 */
const login = async ({ email, password }) => {
  const user = await User.findOne({ email }).select('+password +refreshToken');

  if (!user || !(await user.comparePassword(password))) {
    const err = new Error('Invalid email or password');
    err.statusCode = 401;
    throw err;
  }

  if (!user.isActive) {
    const err = new Error('Account is deactivated. Contact support.');
    err.statusCode = 403;
    throw err;
  }

  // Update last login
  user.lastLogin = new Date();
  const { accessToken, refreshToken } = generateTokens(user._id, user.role);
  user.refreshToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
  await user.save({ validateBeforeSave: false });

  logger.info(`User logged in: ${user.email}`);

  return { user, accessToken, refreshToken };
};

/**
 * Refresh access token
 */
const refreshAccessToken = async (incomingRefreshToken) => {
  if (!incomingRefreshToken) {
    const err = new Error('Refresh token required');
    err.statusCode = 401;
    throw err;
  }

  let decoded;
  try {
    decoded = jwt.verify(incomingRefreshToken, process.env.JWT_REFRESH_SECRET);
  } catch {
    const err = new Error('Invalid or expired refresh token');
    err.statusCode = 401;
    throw err;
  }

  const user = await User.findById(decoded.id).select('+refreshToken');
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 401;
    throw err;
  }

  const hashedIncoming = crypto
    .createHash('sha256')
    .update(incomingRefreshToken)
    .digest('hex');

  if (user.refreshToken !== hashedIncoming) {
    const err = new Error('Refresh token has been revoked');
    err.statusCode = 401;
    throw err;
  }

  const { accessToken, refreshToken: newRefreshToken } = generateTokens(user._id, user.role);
  user.refreshToken = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
  await user.save({ validateBeforeSave: false });

  return { accessToken, refreshToken: newRefreshToken };
};

/**
 * Logout - invalidate refresh token
 */
const logout = async (userId) => {
  await User.findByIdAndUpdate(userId, { refreshToken: null }, { validateBeforeSave: false });
};

/**
 * Change password
 */
const changePassword = async (userId, currentPassword, newPassword) => {
  const user = await User.findById(userId).select('+password');

  if (!(await user.comparePassword(currentPassword))) {
    const err = new Error('Current password is incorrect');
    err.statusCode = 400;
    throw err;
  }

  user.password = newPassword;
  await user.save();

  return true;
};

module.exports = {
  generateTokens,
  registerMerchant,
  login,
  refreshAccessToken,
  logout,
  changePassword,
};
