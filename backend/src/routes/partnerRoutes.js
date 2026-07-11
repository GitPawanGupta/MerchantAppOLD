const express = require('express');
const router = express.Router();
const partnerController = require('../controllers/partnerController');
const { authenticate, attachMerchant } = require('../middleware/auth');
const { webhookLimiter } = require('../middleware/rateLimiter');

// ─── Public — OAuth callback + webhook ───────────────────────────────────────
router.get('/callback', partnerController.oauthCallback);

router.post(
  '/webhook',
  webhookLimiter,
  (req, res, next) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      req.rawBody = raw.toString('utf8');
      try { req.body = JSON.parse(req.rawBody); } catch { req.body = {}; }
      next();
    });
    req.on('error', next);
  },
  partnerController.partnerWebhook
);

// ─── Protected — merchant must be logged in ───────────────────────────────────
router.use(authenticate, attachMerchant);

// OAuth connect (for merchants who already have a Razorpay account)
router.get('/connect', partnerController.getConnectUrl);
router.post('/disconnect', partnerController.disconnect);

// Status — works for both OAuth-connected and API-onboarded merchants
router.get('/status', partnerController.getStatus);

// ─── Linked Account Onboarding (Option C — API-based) ────────────────────────
// Step 1+2: Create Razorpay account + stakeholder (requires platform KYC approved)
router.post('/onboard', partnerController.initiateOnboarding);

// Step 3: Upload KYC documents (multipart/form-data)
// Fields: businessDoc, panDoc, aadharFront, aadharBack, cancelledCheque
router.post('/onboard/documents', partnerController.uploadOnboardingDocuments);

// Step 4: Request Route product activation (submit for Razorpay review)
router.post('/onboard/activate', partnerController.activateOnboarding);

module.exports = router;
