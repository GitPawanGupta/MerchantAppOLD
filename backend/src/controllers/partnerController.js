const partnerService = require('../services/partnerService');
const Merchant = require('../models/Merchant');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * GET /api/partner/connect
 * Returns the Razorpay OAuth authorization URL for the logged-in merchant.
 * Merchant clicks this URL to start the OAuth flow.
 */
const getConnectUrl = async (req, res, next) => {
  try {
    const url = partnerService.getAuthorizationUrl(req.merchant._id.toString());
    return successResponse(res, { url });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/partner/callback?code=...&state=...
 * Razorpay redirects here after merchant authorizes.
 * Exchanges auth code for tokens and saves on merchant.
 * Then redirects merchant back to the Flutter app deep link.
 */
const oauthCallback = async (req, res, next) => {
  try {
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      logger.warn(`OAuth error from Razorpay: ${oauthError}`);
      return res.redirect(`${process.env.APP_BASE_URL}?razorpay_connect=failed&reason=${oauthError}`);
    }

    if (!code || !state) {
      return res.redirect(`${process.env.APP_BASE_URL}?razorpay_connect=failed&reason=missing_params`);
    }

    await partnerService.handleOAuthCallback(code, state);

    // Redirect back to app — Flutter will detect this and refresh profile
    return res.redirect(`${process.env.APP_BASE_URL}?razorpay_connect=success`);
  } catch (error) {
    logger.error(`OAuth callback error: ${error.message}`);
    return res.redirect(`${process.env.APP_BASE_URL}?razorpay_connect=failed&reason=server_error`);
  }
};

/**
 * GET /api/partner/status
 * Returns current Razorpay connection status for the logged-in merchant.
 */
const getStatus = async (req, res, next) => {
  try {
    const merchant = req.merchant;
    return successResponse(res, {
      isLinked: merchant.isRazorpayLinked || false,
      linkedAccountId: merchant.razorpayLinkedAccountId || null,
      linkedAt: merchant.razorpayLinkedAt || null,
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

/**
 * POST /api/partner/webhook
 * Handles Razorpay Partner Technology account events.
 * Same secret as payment webhook — verify signature first.
 */
const partnerWebhook = async (req, res) => {
  try {
    const rawBody = req.rawBody || JSON.stringify(req.body);
    const signature = req.headers['x-razorpay-signature'];
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    // Verify signature
    if (secret && signature) {
      const generated = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
      if (generated !== signature) {
        logger.warn('Partner webhook: invalid signature');
        return res.status(200).json({ success: false, message: 'Invalid signature' });
      }
    }

    const event = req.body.event;
    const accountId = req.body.payload?.account?.entity?.id
      || req.body.payload?.account?.id
      || null;

    logger.info(`Partner webhook received: ${event} | account: ${accountId}`);

    if (event === 'account.instantly_activated' || event === 'account.activated_kyc_pending') {
      // Merchant's linked Razorpay account is now active
      if (accountId) {
        await Merchant.findOneAndUpdate(
          { razorpayLinkedAccountId: accountId },
          { isRazorpayLinked: true }
        );
        logger.info(`Account activated: ${accountId}`);
      }
    } else if (event === 'account.app.authorization_revoked') {
      // Merchant revoked our access — unlink
      if (accountId) {
        await Merchant.findOneAndUpdate(
          { razorpayLinkedAccountId: accountId },
          {
            isRazorpayLinked: false,
            razorpayAccessToken: null,
            razorpayRefreshToken: null,
            razorpayTokenExpiresAt: null,
          }
        );
        logger.info(`Authorization revoked for account: ${accountId}`);
      }
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    logger.error(`Partner webhook error: ${error.message}`);
    return res.status(200).json({ success: false });
  }
};

module.exports = { getConnectUrl, oauthCallback, getStatus, disconnect, partnerWebhook };
