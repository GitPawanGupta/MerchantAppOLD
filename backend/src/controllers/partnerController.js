const multer = require('multer');
const path = require('path');
const partnerService = require('../services/partnerService');
const Merchant = require('../models/Merchant');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const crypto = require('crypto');
const logger = require('../utils/logger');

// ─── Multer config for KYC document uploads (onboarding flow) ────────────────
const ALLOWED_DOC_TYPES = {
  '.jpg':  ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png':  ['image/png'],
  '.pdf':  ['application/pdf'],
};

const docUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedMimes = ALLOWED_DOC_TYPES[ext];
    if (!allowedMimes || !allowedMimes.includes(file.mimetype)) {
      return cb(new Error('Only JPG, PNG, and PDF files are allowed'), false);
    }
    cb(null, true);
  },
}).fields([
  { name: 'businessDoc',      maxCount: 1 }, // business proof
  { name: 'panDoc',           maxCount: 1 }, // business PAN
  { name: 'aadharFront',      maxCount: 1 }, // stakeholder aadhaar front
  { name: 'aadharBack',       maxCount: 1 }, // stakeholder aadhaar back
  { name: 'cancelledCheque',  maxCount: 1 }, // bank proof
]);

// ─── OAuth Connect (existing Razorpay account) ────────────────────────────────

/**
 * GET /api/partner/connect
 * Returns the Razorpay OAuth authorization URL for an existing Razorpay account holder.
 * Generates a fresh CSRF nonce on every call.
 */
const getConnectUrl = async (req, res, next) => {
  try {
    const url = await partnerService.getAuthorizationUrl(req.merchant._id.toString());
    return successResponse(res, { url });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/partner/callback?code=...&state=...
 * Razorpay redirects here after merchant authorizes (OAuth flow only).
 */
const oauthCallback = async (req, res, next) => {
  try {
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      logger.warn(`OAuth error from Razorpay: ${oauthError}`);
      return res.redirect(
        `${process.env.APP_BASE_URL}?razorpay_connect=failed&reason=${encodeURIComponent(oauthError)}`
      );
    }

    if (!code || !state) {
      return res.redirect(
        `${process.env.APP_BASE_URL}?razorpay_connect=failed&reason=missing_params`
      );
    }

    await partnerService.handleOAuthCallback(code, state);
    return res.redirect(`${process.env.APP_BASE_URL}?razorpay_connect=success`);
  } catch (error) {
    logger.error(`OAuth callback error: ${error.message}`);
    const reason = error.statusCode === 400 ? 'invalid_state' : 'server_error';
    return res.redirect(
      `${process.env.APP_BASE_URL}?razorpay_connect=failed&reason=${reason}`
    );
  }
};

/**
 * GET /api/partner/status
 * Returns current Razorpay connection + onboarding status for the merchant.
 */
const getStatus = async (req, res, next) => {
  try {
    const m = req.merchant;

    // Optionally sync latest status from Razorpay if account exists
    let rzpAccountData = null;
    if (m.razorpayLinkedAccountId) {
      rzpAccountData = await partnerService.fetchLinkedAccountStatus(m);
    }

    return successResponse(res, {
      // OAuth connect fields
      isLinked:           m.isRazorpayLinked || false,
      linkedAccountId:    m.razorpayLinkedAccountId || null,
      linkedAt:           m.razorpayLinkedAt || null,
      requiresReAuth:     m.requiresReAuth || false,
      tokenExpiresAt:     m.razorpayTokenExpiresAt || null,
      // Linked account onboarding fields
      accountStatus:      m.razorpayAccountStatus || null,
      stakeholderId:      m.razorpayStakeholderId || null,
      // Full Razorpay account data (if available)
      razorpayAccount:    rzpAccountData,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/partner/disconnect
 * Revokes OAuth tokens and unlinks the merchant's Razorpay account.
 */
const disconnect = async (req, res, next) => {
  try {
    await partnerService.disconnectAccount(req.merchant._id);
    return successResponse(res, null, 'Razorpay account disconnected');
  } catch (error) {
    next(error);
  }
};

// ─── Linked Account Onboarding (Option C) ─────────────────────────────────────

/**
 * POST /api/partner/onboard
 *
 * Step 1 + 2 combined: Create a Razorpay linked account for the merchant AND
 * create their stakeholder (director/owner) in a single API call.
 *
 * This is triggered after our platform KYC is approved. The merchant doesn't
 * need an existing Razorpay account — we create it on their behalf.
 *
 * Body:
 *   contactName    string   Owner/director full name (as per PAN)
 *   contactPhone   string   10-digit phone
 *   contactEmail   string   Email (defaults to user account email)
 *   panNumber      string   Business/personal PAN
 *   gstNumber      string   GST number (optional)
 *   businessType   string   proprietorship | partnership | pvt_ltd | etc.
 *   businessAddress object  { street, city, state, pincode }
 */
const initiateOnboarding = async (req, res, next) => {
  try {
    const merchant = req.merchant;

    // Guard: KYC must be approved before Razorpay onboarding
    if (!merchant.kyc || merchant.kyc.status !== 'approved') {
      return errorResponse(res, 'KYC must be approved before Razorpay onboarding', 400);
    }

    // Guard: already onboarded
    if (merchant.razorpayLinkedAccountId) {
      return errorResponse(
        res,
        `Razorpay account already exists (${merchant.razorpayLinkedAccountId}). Use /status to check.`,
        409
      );
    }

    const {
      contactName,
      contactPhone,
      contactEmail,
      panNumber,
      gstNumber,
      businessType,
      businessAddress,
    } = req.body;

    if (!contactName) return errorResponse(res, 'contactName is required', 400);
    if (!panNumber)   return errorResponse(res, 'panNumber is required', 400);

    // Populate merchant user for email/phone fallback
    await merchant.populate('userId', 'email phone');

    // Step 1: Create linked account
    const rzpAccount = await partnerService.createLinkedAccount(merchant, {
      contactName,
      contactPhone,
      contactEmail,
      panNumber,
      gstNumber,
      businessType: businessType || merchant.kyc?.businessType,
      businessAddress: businessAddress || merchant.businessAddress,
    });

    // Reload merchant after save inside createLinkedAccount
    const updatedMerchant = await Merchant.findById(merchant._id);

    // Step 2: Create stakeholder immediately after account creation
    const stakeholder = await partnerService.createStakeholder(updatedMerchant, {
      name:  contactName,
      email: contactEmail || updatedMerchant.userId?.email,
      phone: contactPhone || updatedMerchant.userId?.phone,
      panNumber,
      percentageOwnership: 100,
      address: businessAddress || updatedMerchant.businessAddress,
    });

    logger.info(`Onboarding initiated for merchant ${merchant.merchantId}: account ${rzpAccount.id}, stakeholder ${stakeholder.id}`);

    return successResponse(
      res,
      {
        razorpayAccountId: rzpAccount.id,
        accountStatus:     rzpAccount.status,
        stakeholderId:     stakeholder.id,
        nextStep:          'Upload KYC documents via POST /api/partner/onboard/documents',
      },
      'Razorpay account created successfully',
      201
    );
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/partner/onboard/documents
 *
 * Step 3: Upload KYC documents to the linked account and stakeholder.
 *
 * Accepts multipart/form-data with optional fields:
 *   businessDoc     — business proof (GST cert, shop establishment, etc.)
 *   panDoc          — business PAN card scan
 *   aadharFront     — stakeholder Aadhaar front
 *   aadharBack      — stakeholder Aadhaar back
 *   cancelledCheque — cancelled cheque for bank verification
 *
 * At least one document must be provided.
 */
const uploadOnboardingDocuments = async (req, res, next) => {
  // Run multer first
  docUpload(req, res, async (multerErr) => {
    if (multerErr) {
      return errorResponse(res, multerErr.message, 400);
    }

    try {
      const merchant = req.merchant;

      if (!merchant.razorpayLinkedAccountId) {
        return errorResponse(res, 'Razorpay account not created yet. Call POST /api/partner/onboard first.', 400);
      }

      const files = req.files || {};
      if (Object.keys(files).length === 0) {
        return errorResponse(res, 'At least one document file is required', 400);
      }

      const results = {};
      const errors  = [];

      // Upload each provided document
      const uploadTasks = [
        files.businessDoc     && { field: 'businessDoc',     docType: 'business_proof_url',  kind: 'account' },
        files.panDoc          && { field: 'panDoc',          docType: 'business_pan_url',     kind: 'account' },
        files.cancelledCheque && { field: 'cancelledCheque', docType: 'cancelled_cheque',     kind: 'account' },
        files.aadharFront     && { field: 'aadharFront',     docType: 'aadhar_front',         kind: 'stakeholder' },
        files.aadharBack      && { field: 'aadharBack',      docType: 'aadhar_back',          kind: 'stakeholder' },
      ].filter(Boolean);

      for (const task of uploadTasks) {
        const file = files[task.field][0];
        try {
          let result;
          if (task.kind === 'account') {
            result = await partnerService.uploadAccountDocument(
              merchant, file.buffer, file.mimetype, task.docType
            );
          } else {
            // Stakeholder doc — requires stakeholderId
            if (!merchant.razorpayStakeholderId) {
              errors.push({ field: task.field, error: 'No stakeholder ID found' });
              continue;
            }
            result = await partnerService.uploadStakeholderDocument(
              merchant, file.buffer, file.mimetype, task.docType
            );
          }
          results[task.field] = { success: true, data: result };
        } catch (uploadErr) {
          logger.warn(`Document upload failed for ${task.field}: ${uploadErr.message}`);
          errors.push({ field: task.field, error: uploadErr.message });
        }
      }

      const allFailed = Object.keys(results).length === 0 && errors.length > 0;
      if (allFailed) {
        return errorResponse(res, 'All document uploads failed', 502, { errors });
      }

      return successResponse(
        res,
        {
          uploaded: results,
          failed:   errors,
          nextStep: errors.length === 0
            ? 'All documents uploaded. Call POST /api/partner/onboard/activate to request product activation.'
            : 'Some documents failed — retry the failed ones before activating.',
        },
        `${Object.keys(results).length} document(s) uploaded successfully`
      );
    } catch (error) {
      next(error);
    }
  });
};

/**
 * POST /api/partner/onboard/activate
 *
 * Step 4: Request Route product activation.
 * Submits the account to Razorpay for review. Once approved, transfers will work.
 */
const activateOnboarding = async (req, res, next) => {
  try {
    const merchant = req.merchant;

    if (!merchant.razorpayLinkedAccountId) {
      return errorResponse(res, 'Razorpay account not created yet. Call POST /api/partner/onboard first.', 400);
    }

    if (merchant.razorpayAccountStatus === 'activated') {
      return errorResponse(res, 'Razorpay account is already activated', 409);
    }

    const result = await partnerService.requestProductActivation(merchant);

    return successResponse(
      res,
      {
        accountId:     merchant.razorpayLinkedAccountId,
        accountStatus: 'under_review',
        razorpayData:  result,
      },
      'Product activation requested. Razorpay will review and activate the account.'
    );
  } catch (error) {
    next(error);
  }
};

// ─── Partner Webhook ──────────────────────────────────────────────────────────

/**
 * POST /api/partner/webhook
 * Handles Razorpay Partner Technology account events.
 *
 * Events handled:
 *   account.instantly_activated        — mark merchant activated
 *   account.activated_kyc_pending      — mark merchant linked
 *   account.app.authorization_revoked  — unlink + set requiresReAuth
 */
const partnerWebhook = async (req, res) => {
  try {
    const rawBody   = req.rawBody || JSON.stringify(req.body);
    const signature = req.headers['x-razorpay-signature'];
    const secret    = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (secret && signature) {
      const generated = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
      if (generated !== signature) {
        logger.warn('Partner webhook: invalid signature');
        return res.status(200).json({ success: false, message: 'Invalid signature' });
      }
    }

    const event     = req.body.event;
    const accountId = req.body.payload?.account?.entity?.id
                   || req.body.payload?.account?.id
                   || null;

    logger.info(`Partner webhook: ${event} | account: ${accountId}`);

    if (event === 'account.instantly_activated') {
      if (accountId) {
        await Merchant.findOneAndUpdate(
          { razorpayLinkedAccountId: accountId },
          { isRazorpayLinked: true, razorpayAccountStatus: 'activated', requiresReAuth: false }
        );
        logger.info(`Account activated: ${accountId}`);
      }
    } else if (event === 'account.activated_kyc_pending') {
      if (accountId) {
        await Merchant.findOneAndUpdate(
          { razorpayLinkedAccountId: accountId },
          { isRazorpayLinked: true, razorpayAccountStatus: 'under_review', requiresReAuth: false }
        );
      }
    } else if (event === 'account.app.authorization_revoked') {
      if (accountId) {
        await Merchant.findOneAndUpdate(
          { razorpayLinkedAccountId: accountId },
          {
            isRazorpayLinked:            false,
            requiresReAuth:              true,
            razorpayAccessToken:         null,
            razorpayRefreshToken:        null,
            razorpayTokenExpiresAt:      null,
            razorpayRefreshTokenExpiresAt: null,
          }
        );
        logger.info(`Authorization revoked — merchant must re-authorize: ${accountId}`);
      }
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    logger.error(`Partner webhook error: ${error.message}`);
    return res.status(200).json({ success: false });
  }
};

module.exports = {
  // OAuth connect (existing Razorpay account)
  getConnectUrl,
  oauthCallback,
  getStatus,
  disconnect,
  // Linked account onboarding (Option C)
  initiateOnboarding,
  uploadOnboardingDocuments,
  activateOnboarding,
  // Webhook
  partnerWebhook,
};
