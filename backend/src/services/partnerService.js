const axios = require('axios');
const crypto = require('crypto');
const FormData = require('form-data');
const Merchant = require('../models/Merchant');
const logger = require('../utils/logger');

// ─── Razorpay endpoints ───────────────────────────────────────────────────────
const OAUTH_AUTHORIZE_BASE = 'https://dashboard.razorpay.com/oauth';
const OAUTH_TOKEN_URL      = 'https://api.razorpay.com/v1/oauth/token';
const OAUTH_REVOKE_URL     = 'https://api.razorpay.com/v1/oauth/token/revoke';
const API_BASE             = 'https://api.razorpay.com/v1';
// Partner Account APIs use v2
const API_V2_BASE          = 'https://api.razorpay.com/v2';

const PARTNER_CLIENT_ID     = process.env.RAZORPAY_PARTNER_CLIENT_ID;
const PARTNER_CLIENT_SECRET = process.env.RAZORPAY_PARTNER_CLIENT_SECRET;
const REDIRECT_URI          = process.env.RAZORPAY_OAUTH_REDIRECT_URI;

// Platform credentials used for linked account creation (partner's own keys)
const platformAuth = {
  username: process.env.RAZORPAY_KEY_ID,
  password: process.env.RAZORPAY_KEY_SECRET,
};

// Refresh token validity per Razorpay docs: 180 days
const REFRESH_TOKEN_TTL_DAYS = 180;

// ─── Build OAuth Authorization URL ───────────────────────────────────────────
/**
 * Generate the Razorpay OAuth consent URL for a merchant.
 *
 * CSRF protection:
 *   - A cryptographically random nonce is generated per request.
 *   - It is saved on the merchant document (razorpayOAuthState).
 *   - The callback verifies the returned state matches this nonce before
 *     exchanging the authorization code.
 */
const getAuthorizationUrl = async (merchantId) => {
  const merchant = await Merchant.findById(merchantId);
  if (!merchant) throw new Error('Merchant not found');

  // Generate a random nonce — 32 hex chars (128 bits of entropy)
  const nonce = crypto.randomBytes(16).toString('hex');

  // Persist nonce so we can verify it on callback
  merchant.razorpayOAuthState = nonce;
  await merchant.save();

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: PARTNER_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: 'read_write',
    state: nonce,
  });

  return `${OAUTH_AUTHORIZE_BASE}/authorize?${params.toString()}`;
};

// ─── Exchange Auth Code for Tokens ───────────────────────────────────────────
/**
 * Called on OAuth callback — exchange authorization code for access/refresh tokens.
 *
 * CSRF check: incoming `state` must match the nonce stored on the merchant.
 * The nonce is cleared after a successful exchange (one-time use).
 *
 * NOTE: `state` here is the raw nonce (not merchantId). The controller is
 * responsible for resolving the merchant before calling this function.
 */
const handleOAuthCallback = async (code, state) => {
  // Find the merchant whose stored nonce matches the incoming state
  const merchant = await Merchant.findOne({ razorpayOAuthState: state });
  if (!merchant) {
    const err = new Error('Invalid or expired OAuth state parameter — possible CSRF attempt');
    err.statusCode = 400;
    throw err;
  }

  // Exchange code for tokens
  let tokenData;
  try {
    const response = await axios.post(
      OAUTH_TOKEN_URL,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: PARTNER_CLIENT_ID,
        client_secret: PARTNER_CLIENT_SECRET,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    tokenData = response.data;
  } catch (err) {
    const msg = err.response?.data?.error_description || err.message;
    logger.error(`Razorpay token exchange failed for merchant ${merchant.merchantId}: ${msg}`);
    const error = new Error(`Token exchange failed: ${msg}`);
    error.statusCode = 502;
    throw error;
  }

  const {
    access_token,
    refresh_token,
    expires_in,
    razorpay_account_id,
  } = tokenData;

  const now = Date.now();

  // Persist tokens and clear the one-time nonce
  merchant.razorpayAccessToken         = access_token;
  merchant.razorpayRefreshToken        = refresh_token;
  merchant.razorpayLinkedAccountId     = razorpay_account_id;
  // Access token — short-lived (~2 hours), keep 5 min buffer
  merchant.razorpayTokenExpiresAt      = new Date(now + (expires_in - 300) * 1000);
  // Refresh token — 180 days per Razorpay docs
  merchant.razorpayRefreshTokenExpiresAt = new Date(now + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  merchant.isRazorpayLinked            = true;
  merchant.razorpayLinkedAt            = new Date();
  merchant.requiresReAuth              = false;
  merchant.razorpayOAuthState          = null; // clear nonce — one-time use

  await merchant.save();

  logger.info(`Razorpay OAuth connected for merchant ${merchant.merchantId}: account ${razorpay_account_id}`);
  return merchant;
};

// ─── Refresh Access Token ─────────────────────────────────────────────────────
/**
 * Use the refresh token to get a new access token.
 * If the refresh token itself is expired (180 days), marks merchant for re-auth
 * instead of silently failing.
 */
const refreshAccessToken = async (merchant) => {
  if (!merchant.razorpayRefreshToken) {
    throw new Error('No refresh token available — merchant must re-authorize');
  }

  // Check if refresh token itself is expired
  if (
    merchant.razorpayRefreshTokenExpiresAt &&
    new Date() > merchant.razorpayRefreshTokenExpiresAt
  ) {
    merchant.isRazorpayLinked = false;
    merchant.requiresReAuth   = true;
    await merchant.save();
    const err = new Error('Razorpay refresh token expired — merchant must re-authorize');
    err.code = 'REFRESH_TOKEN_EXPIRED';
    throw err;
  }

  let tokenData;
  try {
    const response = await axios.post(
      OAUTH_TOKEN_URL,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: merchant.razorpayRefreshToken,
        client_id: PARTNER_CLIENT_ID,
        client_secret: PARTNER_CLIENT_SECRET,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    tokenData = response.data;
  } catch (err) {
    const status = err.response?.status;
    const msg    = err.response?.data?.error_description || err.message;

    // 401 typically means refresh token was revoked — require re-auth
    if (status === 401) {
      merchant.isRazorpayLinked = false;
      merchant.requiresReAuth   = true;
      await merchant.save();
      const error = new Error('Razorpay refresh token revoked — merchant must re-authorize');
      error.code = 'REFRESH_TOKEN_REVOKED';
      throw error;
    }

    throw new Error(`Token refresh failed: ${msg}`);
  }

  const { access_token, refresh_token, expires_in } = tokenData;

  merchant.razorpayAccessToken    = access_token;
  // Razorpay may or may not return a new refresh token on every refresh
  if (refresh_token) {
    merchant.razorpayRefreshToken              = refresh_token;
    // Reset 180-day window from now when a new refresh token is issued
    merchant.razorpayRefreshTokenExpiresAt     = new Date(
      Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000
    );
  }
  merchant.razorpayTokenExpiresAt = new Date(Date.now() + (expires_in - 300) * 1000);
  await merchant.save();

  return access_token;
};

// ─── Get Valid Access Token (auto-refresh) ────────────────────────────────────
/**
 * Returns a valid access token for the merchant, refreshing automatically if needed.
 * Returns null if the merchant is not linked.
 * Throws with err.code = 'REFRESH_TOKEN_EXPIRED' | 'REFRESH_TOKEN_REVOKED' when
 * the merchant must re-do the full OAuth flow.
 */
const getAccessToken = async (merchant) => {
  if (!merchant.isRazorpayLinked) return null;

  const now = new Date();
  if (merchant.razorpayTokenExpiresAt && merchant.razorpayTokenExpiresAt > now) {
    return merchant.razorpayAccessToken;
  }

  // Access token expired — try refresh
  return await refreshAccessToken(merchant);
};

// ─── Revoke OAuth (Disconnect) ────────────────────────────────────────────────
const disconnectAccount = async (merchantId) => {
  const merchant = await Merchant.findById(merchantId);
  if (!merchant || !merchant.isRazorpayLinked) throw new Error('No linked Razorpay account');

  try {
    await axios.post(
      OAUTH_REVOKE_URL,
      new URLSearchParams({
        client_id: PARTNER_CLIENT_ID,
        client_secret: PARTNER_CLIENT_SECRET,
        token: merchant.razorpayAccessToken,
        token_type_hint: 'access_token',
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
  } catch (err) {
    // Log but don't throw — clear local state regardless so merchant isn't stuck
    logger.warn(`Razorpay revoke API failed for ${merchant.merchantId}: ${err.message}`);
  }

  merchant.razorpayAccessToken             = null;
  merchant.razorpayRefreshToken            = null;
  merchant.razorpayLinkedAccountId         = null;
  merchant.razorpayTokenExpiresAt          = null;
  merchant.razorpayRefreshTokenExpiresAt   = null;
  merchant.razorpayOAuthState              = null;
  merchant.isRazorpayLinked                = false;
  merchant.razorpayLinkedAt                = null;
  merchant.requiresReAuth                  = false;
  await merchant.save();

  logger.info(`Razorpay account disconnected for merchant ${merchant.merchantId}`);
  return merchant;
};

// ─── Create Razorpay Transfer (Route) ────────────────────────────────────────
/**
 * After a payment is captured, route the merchant's share to their linked account.
 * Platform keeps commissionAmount; transfers settlementAmount to merchant.
 *
 * Uses Razorpay Route: POST /v1/payments/:paymentId/transfers
 * Authenticated with platform API keys (not merchant access token).
 */
const createTransfer = async ({ paymentId, merchantLinkedAccountId, settlementAmount, orderId }) => {
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
      auth: {
        username: process.env.RAZORPAY_KEY_ID,
        password: process.env.RAZORPAY_KEY_SECRET,
      },
      headers: { 'Content-Type': 'application/json' },
    }
  );

  logger.info(`Route transfer created: ₹${settlementAmount} → ${merchantLinkedAccountId} for order ${orderId}`);
  return response.data;
};

// ─── Get Merchant's Razorpay Account Info ─────────────────────────────────────
const getMerchantAccountInfo = async (merchant) => {
  const accessToken = await getAccessToken(merchant);
  if (!accessToken) return null;

  const response = await axios.get(
    `${API_BASE}/accounts/${merchant.razorpayLinkedAccountId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  return response.data;
};

// ─── Linked Account Creation (Option C — API-based onboarding) ───────────────
/**
 * Step 1: Create a Razorpay linked account (sub-merchant account) via Partner API.
 *
 * This uses the PARTNER's platform API keys — NOT the merchant's OAuth token.
 * The merchant does NOT need an existing Razorpay account.
 *
 * Called when merchant completes platform KYC. We create their Razorpay account
 * on their behalf and store the razorpayLinkedAccountId on our Merchant document.
 *
 * API: POST https://api.razorpay.com/v2/accounts
 * Auth: Platform key_id + key_secret (Basic Auth)
 */
const createLinkedAccount = async (merchant, kycData) => {
  const {
    panNumber,
    gstNumber,
    businessType,
    contactName,
    contactPhone,
    contactEmail,
    businessAddress,
  } = kycData;

  // Map our internal businessType to Razorpay's enum
  const businessTypeMap = {
    individual:     'not_yet_registered',
    proprietorship: 'proprietorship',
    partnership:    'partnership',
    pvt_ltd:        'private_limited',
    ltd:            'public_limited',
    llp:            'llp',
    other:          'not_yet_registered',
  };

  const rzpBusinessType = businessTypeMap[businessType] || 'not_yet_registered';

  const payload = {
    email:                        contactEmail || merchant.userId?.email,
    phone:                        contactPhone || merchant.userId?.phone,
    legal_business_name:          merchant.businessName,
    customer_facing_business_name: merchant.businessName,
    business_type:                rzpBusinessType,
    reference_id:                 merchant.merchantId, // our internal ID
    contact_name:                 contactName || merchant.businessName,
    profile: {
      category:    mapBusinessCategory(merchant.businessCategory),
      subcategory: 'others',
      addresses: {
        registered: {
          street1:     businessAddress?.street || 'Not provided',
          city:        businessAddress?.city   || 'Not provided',
          state:       businessAddress?.state  || 'Not provided',
          postal_code: businessAddress?.pincode ? parseInt(businessAddress.pincode) : 110001,
          country:     'IN',
        },
      },
    },
    legal_info: {
      ...(panNumber && { pan: panNumber }),
      ...(gstNumber && { gst: gstNumber }),
    },
    contact_info: {
      support: {
        email: contactEmail || merchant.userId?.email,
        phone: contactPhone || merchant.userId?.phone,
      },
    },
  };

  let response;
  try {
    response = await axios.post(`${API_V2_BASE}/accounts`, payload, {
      auth: platformAuth,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err.response?.data?.error?.description || err.message;
    logger.error(`Razorpay createLinkedAccount failed for ${merchant.merchantId}: ${msg}`);
    const error = new Error(`Razorpay account creation failed: ${msg}`);
    error.statusCode = 502;
    throw error;
  }

  const rzpAccount = response.data;

  // Persist on merchant
  merchant.razorpayLinkedAccountId = rzpAccount.id;
  merchant.razorpayAccountStatus   = rzpAccount.status; // 'created'
  merchant.isRazorpayLinked        = true;
  merchant.razorpayLinkedAt        = new Date();
  await merchant.save();

  logger.info(`Razorpay linked account created for merchant ${merchant.merchantId}: ${rzpAccount.id}`);
  return rzpAccount;
};

/**
 * Step 2: Create a stakeholder (owner/director) for the linked account.
 *
 * Required for KYC — stakeholder holds PAN, Aadhaar, address.
 *
 * API: POST https://api.razorpay.com/v2/accounts/:accountId/stakeholders
 */
const createStakeholder = async (merchant, stakeholderData) => {
  const {
    name,
    email,
    phone,
    panNumber,
    percentageOwnership = 100,
    address,
  } = stakeholderData;

  const accountId = merchant.razorpayLinkedAccountId;
  if (!accountId) throw new Error('Merchant has no linked Razorpay account');

  const payload = {
    name,
    email:               email || merchant.userId?.email,
    percentage_ownership: percentageOwnership,
    relationship: { director: true },
    phone: {
      primary: phone || merchant.userId?.phone,
    },
    kyc: {
      ...(panNumber && { pan: panNumber }),
    },
    ...(address && {
      addresses: {
        residential: {
          street:      address.street  || 'Not provided',
          city:        address.city    || 'Not provided',
          state:       address.state   || 'Not provided',
          postal_code: address.pincode || '110001',
          country:     'IN',
        },
      },
    }),
  };

  let response;
  try {
    response = await axios.post(
      `${API_V2_BASE}/accounts/${accountId}/stakeholders`,
      payload,
      { auth: platformAuth, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const msg = err.response?.data?.error?.description || err.message;
    logger.error(`createStakeholder failed for ${merchant.merchantId}: ${msg}`);
    const error = new Error(`Stakeholder creation failed: ${msg}`);
    error.statusCode = 502;
    throw error;
  }

  const stakeholder = response.data;

  // Persist stakeholder ID on merchant
  merchant.razorpayStakeholderId = stakeholder.id;
  await merchant.save();

  logger.info(`Stakeholder created for merchant ${merchant.merchantId}: ${stakeholder.id}`);
  return stakeholder;
};

/**
 * Step 3a: Upload a business document to the linked account.
 *
 * document_type options: 'business_proof_url', 'gst_certificate',
 *   'shop_establishment_certificate', 'msme_certificate', 'business_pan_url', 'cancelled_cheque'
 *
 * API: POST https://api.razorpay.com/v1/accounts/:accountId/documents
 */
const uploadAccountDocument = async (merchant, fileBuffer, mimeType, documentType) => {
  const accountId = merchant.razorpayLinkedAccountId;
  if (!accountId) throw new Error('Merchant has no linked Razorpay account');

  const form = new FormData();
  form.append('file', fileBuffer, {
    filename:    `${documentType}.${mimeType.split('/')[1]}`,
    contentType: mimeType,
  });
  form.append('document_type', documentType);

  let response;
  try {
    response = await axios.post(
      `${API_BASE}/accounts/${accountId}/documents`,
      form,
      {
        auth: platformAuth,
        headers: { ...form.getHeaders() },
      }
    );
  } catch (err) {
    const msg = err.response?.data?.error?.description || err.message;
    logger.error(`uploadAccountDocument (${documentType}) failed for ${merchant.merchantId}: ${msg}`);
    const error = new Error(`Document upload failed: ${msg}`);
    error.statusCode = 502;
    throw error;
  }

  logger.info(`Account document '${documentType}' uploaded for merchant ${merchant.merchantId}`);
  return response.data;
};

/**
 * Step 3b: Upload a stakeholder document (personal PAN, Aadhaar front/back).
 *
 * document_type options: 'personal_pan', 'aadhar_front', 'aadhar_back',
 *   'voter_id_front', 'voter_id_back', 'passport_front', 'passport_back'
 *
 * API: POST https://api.razorpay.com/v2/accounts/:accountId/stakeholders/:stakeholderId/documents
 */
const uploadStakeholderDocument = async (merchant, fileBuffer, mimeType, documentType) => {
  const accountId     = merchant.razorpayLinkedAccountId;
  const stakeholderId = merchant.razorpayStakeholderId;
  if (!accountId)     throw new Error('Merchant has no linked Razorpay account');
  if (!stakeholderId) throw new Error('Merchant has no stakeholder — create stakeholder first');

  const form = new FormData();
  form.append('file', fileBuffer, {
    filename:    `${documentType}.${mimeType.split('/')[1]}`,
    contentType: mimeType,
  });
  form.append('document_type', documentType);

  let response;
  try {
    response = await axios.post(
      `${API_V2_BASE}/accounts/${accountId}/stakeholders/${stakeholderId}/documents`,
      form,
      {
        auth: platformAuth,
        headers: { ...form.getHeaders() },
      }
    );
  } catch (err) {
    const msg = err.response?.data?.error?.description || err.message;
    logger.error(`uploadStakeholderDocument (${documentType}) failed for ${merchant.merchantId}: ${msg}`);
    const error = new Error(`Stakeholder document upload failed: ${msg}`);
    error.statusCode = 502;
    throw error;
  }

  logger.info(`Stakeholder document '${documentType}' uploaded for merchant ${merchant.merchantId}`);
  return response.data;
};

/**
 * Step 4: Request product activation for 'route' (needed before transfers work).
 *
 * API: PATCH https://api.razorpay.com/v2/accounts/:accountId/products
 * This submits the account for Razorpay review. Status moves to 'under_review'.
 */
const requestProductActivation = async (merchant) => {
  const accountId = merchant.razorpayLinkedAccountId;
  if (!accountId) throw new Error('Merchant has no linked Razorpay account');

  const payload = {
    product_name: 'route',
    tnc_accepted: true,
  };

  let response;
  try {
    response = await axios.post(
      `${API_V2_BASE}/accounts/${accountId}/products`,
      payload,
      { auth: platformAuth, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const msg = err.response?.data?.error?.description || err.message;
    logger.error(`requestProductActivation failed for ${merchant.merchantId}: ${msg}`);
    const error = new Error(`Product activation request failed: ${msg}`);
    error.statusCode = 502;
    throw error;
  }

  logger.info(`Route product activation requested for merchant ${merchant.merchantId}`);

  // Update local status
  merchant.razorpayAccountStatus = 'under_review';
  await merchant.save();

  return response.data;
};

/**
 * Fetch current linked account status from Razorpay.
 * API: GET https://api.razorpay.com/v2/accounts/:accountId
 */
const fetchLinkedAccountStatus = async (merchant) => {
  const accountId = merchant.razorpayLinkedAccountId;
  if (!accountId) return null;

  try {
    const response = await axios.get(`${API_V2_BASE}/accounts/${accountId}`, {
      auth: platformAuth,
    });

    // Sync status locally
    const rzpStatus = response.data.status;
    if (rzpStatus && rzpStatus !== merchant.razorpayAccountStatus) {
      merchant.razorpayAccountStatus = rzpStatus;
      await merchant.save();
    }

    return response.data;
  } catch (err) {
    logger.warn(`fetchLinkedAccountStatus failed for ${merchant.merchantId}: ${err.message}`);
    return null;
  }
};

// ─── Helper: map our category to Razorpay's category ─────────────────────────
const mapBusinessCategory = (category) => {
  const map = {
    retail:          'retail',
    restaurant:      'food_and_beverage',
    grocery:         'grocery',
    healthcare:      'healthcare',
    education:       'education',
    services:        'services',
    ecommerce:       'ecommerce',
    travel:          'travel',
    entertainment:   'media_and_entertainment',
    utility:         'utilities',
    other:           'others',
  };
  return map[category] || 'others';
};

module.exports = {
  // OAuth connect (existing Razorpay account)
  getAuthorizationUrl,
  handleOAuthCallback,
  getAccessToken,
  disconnectAccount,
  // Route transfer
  createTransfer,
  getMerchantAccountInfo,
  // Linked account creation (Option C — API-based onboarding)
  createLinkedAccount,
  createStakeholder,
  uploadAccountDocument,
  uploadStakeholderDocument,
  requestProductActivation,
  fetchLinkedAccountStatus,
};
