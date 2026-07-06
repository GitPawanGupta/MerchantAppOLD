const express = require('express');
const router = express.Router();
const partnerController = require('../controllers/partnerController');
const { authenticate, attachMerchant } = require('../middleware/auth');
const { webhookLimiter } = require('../middleware/rateLimiter');

// ─── Public — OAuth callback + webhook ───────────────────────────────────────
router.get('/callback', partnerController.oauthCallback);

// Partner account webhook (account.activated, authorization_revoked etc.)
router.post(
  '/webhook',
  webhookLimiter,
  express.raw({ type: 'application/json' }),
  (req, res, next) => {
    if (Buffer.isBuffer(req.body)) {
      req.rawBody = req.body.toString('utf8');
      try { req.body = JSON.parse(req.rawBody); } catch { req.body = {}; }
    }
    next();
  },
  partnerController.partnerWebhook
);

// ─── Protected — merchant must be logged in ───────────────────────────────────
router.use(authenticate, attachMerchant);

router.get('/connect', partnerController.getConnectUrl);
router.get('/status', partnerController.getStatus);
router.post('/disconnect', partnerController.disconnect);

module.exports = router;
