const axios = require('axios');
const Merchant = require('../models/Merchant');
const logger = require('../utils/logger');

const RAZORPAY_BASE = 'https://auth.razorpay.com';
const API_BASE = 'https://api.razorpay.com/v1';

const PARTNER_CLIENT_ID = process.env.RAZORPAY_PARTNER_CLIENT_ID;
const PARTNER_CLIENT_SECRET = process.env.RAZORPAY_PARTNER_CLIENT_SECRET;
const REDIRECT_URI = process.env.RAZORPAY_OAUTH_REDIRECT_URI;

// ─── Build OAuth Authorization URL ───────────────────────────────────────────
/**
 * Generate the URL to redirect merchant to Razorpay OAuth consent screen.
 * state = merchantId encoded as base64 (used to identify merchant on callback)
 */
const getAuthorizationUrl = (merchantId) => {
  const state = Buffer.from(merchantId.toString()).toString('base64');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: PARTNER_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: 'read_write',
    state,
  });

  return `${RAZORPAY_BASE}/authorize?${params.toString()}`;
};

// ─── Exchange Auth Code for Tokens ───────────────────────────────────────────
/**
 * Called on OAuth callback — exchange authorization code for access/refresh tokens.
 * Stores tokens on the merchant document.
 */
const handleOAuthCallback = async (code, state) => {
  // Decode merchantId from state
  const merchantId = Buffer.from(state, 'base64').toString('utf8');
  const merchant = await Merchant.findById(merchantId);
  if (!merchant) throw new Error('Merchant not found for OAuth callback');

  // Exchange code for tokens
  const response = await axios.post(
    `${RAZORPAY_BASE}/token`,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: PARTNER_CLIENT_ID,
      client_secret: PARTNER_CLIENT_SECRET,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  const {
    access_token,
    refresh_token,
    token_type,
    expires_in,
    razorpay_account_id,
    public_token,
  } = response.data;

  // Persist on merchant
  merchant.razorpayAccessToken = access_token;
  merchant.razorpayRefreshToken = refresh_token;
  merchant.razorpayLinkedAccountId = razorpay_account_id;
  merchant.razorpayPublicToken = public_token || null;
  merchant.razorpayTokenExpiresAt = new Date(Date.now() + (expires_in - 300) * 1000); // 5 min buffer
  merchant.isRazorpayLinked = true;
  merchant.razorpayLinkedAt = new Date();
  await merchant.save();

  logger.info(`Razorpay OAuth connected for merchant ${merchant.merchantId}: account ${razorpay_account_id}`);
  return merchant;
};

// ─── Refresh Access Token ─────────────────────────────────────────────────────
const refreshAccessToken = async (merchant) => {
  if (!merchant.razorpayRefreshToken) throw new Error('No refresh token available');

  const response = await axios.post(
    `${RAZORPAY_BASE}/token`,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: merchant.razorpayRefreshToken,
      client_id: PARTNER_CLIENT_ID,
      client_secret: PARTNER_CLIENT_SECRET,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  const { access_token, refresh_token, expires_in } = response.data;
  merchant.razorpayAccessToken = access_token;
  if (refresh_token) merchant.razorpayRefreshToken = refresh_token;
  merchant.razorpayTokenExpiresAt = new Date(Date.now() + (expires_in - 300) * 1000);
  await merchant.save();

  return access_token;
};

// ─── Get Valid Access Token (auto-refresh) ────────────────────────────────────
const getAccessToken = async (merchant) => {
  if (!merchant.isRazorpayLinked) return null;

  const now = new Date();
  if (merchant.razorpayTokenExpiresAt && merchant.razorpayTokenExpiresAt > now) {
    return merchant.razorpayAccessToken;
  }

  // Token expired — refresh
  try {
    return await refreshAccessToken(merchant);
  } catch (err) {
    logger.error(`Token refresh failed for merchant ${merchant.merchantId}: ${err.message}`);
    // Mark as unlinked so payment falls back to platform account
    merchant.isRazorpayLinked = false;
    await merchant.save();
    return null;
  }
};

// ─── Revoke OAuth (Disconnect) ────────────────────────────────────────────────
const disconnectAccount = async (merchantId) => {
  const merchant = await Merchant.findById(merchantId);
  if (!merchant || !merchant.isRazorpayLinked) throw new Error('No linked Razorpay account');

  try {
    await axios.post(
      `${RAZORPAY_BASE}/revoke`,
      new URLSearchParams({
        client_id: PARTNER_CLIENT_ID,
        client_secret: PARTNER_CLIENT_SECRET,
        token: merchant.razorpayAccessToken,
        token_type_hint: 'access_token',
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
  } catch (err) {
    // Log but don't throw — clear local state regardless
    logger.warn(`Razorpay revoke API failed for ${merchant.merchantId}: ${err.message}`);
  }

  merchant.razorpayAccessToken = null;
  merchant.razorpayRefreshToken = null;
  merchant.razorpayLinkedAccountId = null;
  merchant.razorpayPublicToken = null;
  merchant.razorpayTokenExpiresAt = null;
  merchant.isRazorpayLinked = false;
  merchant.razorpayLinkedAt = null;
  await merchant.save();

  logger.info(`Razorpay account disconnected for merchant ${merchant.merchantId}`);
  return merchant;
};

// ─── Create Razorpay Transfer (Route Commission) ──────────────────────────────
/**
 * After a payment is captured, transfer the merchant's share to their linked account.
 * Platform keeps commissionAmount, transfers settlementAmount to merchant.
 *
 * Uses Razorpay Route: POST /payments/:paymentId/transfers
 */
const createTransfer = async ({ paymentId, merchantLinkedAccountId, settlementAmount, orderId }) => {
  const platformKeyId = process.env.RAZORPAY_KEY_ID;
  const platformKeySecret = process.env.RAZORPAY_KEY_SECRET;

  const payload = {
    transfers: [
      {
        account: merchantLinkedAccountId,
        amount: Math.round(settlementAmount * 100), // paise
        currency: 'INR',
        notes: {
          orderId,
          purpose: 'merchant_settlement',
        },
        linked_account_notes: ['orderId'],
        on_hold: 0,
      },
    ],
  };

  const response = await axios.post(
    `${API_BASE}/payments/${paymentId}/transfers`,
    payload,
    {
      auth: { username: platformKeyId, password: platformKeySecret },
      headers: { 'Content-Type': 'application/json' },
    }
  );

  logger.info(`Transfer created: ₹${settlementAmount} → ${merchantLinkedAccountId} for order ${orderId}`);
  return response.data;
};

// ─── Get Merchant's Razorpay Account Info ─────────────────────────────────────
const getMerchantAccountInfo = async (merchant) => {
  const accessToken = await getAccessToken(merchant);
  if (!accessToken) return null;

  const response = await axios.get(`${API_BASE}/accounts/${merchant.razorpayLinkedAccountId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  return response.data;
};

module.exports = {
  getAuthorizationUrl,
  handleOAuthCallback,
  getAccessToken,
  disconnectAccount,
  createTransfer,
  getMerchantAccountInfo,
};
