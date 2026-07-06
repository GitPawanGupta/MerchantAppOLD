const express = require('express');
const router = express.Router();
const partnerController = require('../controllers/partnerController');
const { authenticate, attachMerchant } = require('../middleware/auth');

// ─── Public — OAuth callback from Razorpay ────────────────────────────────────
// Razorpay redirects here after merchant authorizes — no JWT needed
router.get('/callback', partnerController.oauthCallback);

// ─── Protected — merchant must be logged in ───────────────────────────────────
router.use(authenticate, attachMerchant);

// Get OAuth URL to start connect flow
router.get('/connect', partnerController.getConnectUrl);

// Get current connection status
router.get('/status', partnerController.getStatus);

// Disconnect / revoke linked account
router.post('/disconnect', partnerController.disconnect);

module.exports = router;
