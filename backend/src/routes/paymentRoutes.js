const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { authenticate, attachMerchant } = require('../middleware/auth');
const { webhookLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');

// ─── Public routes ────────────────────────────────────────────────────────────

// Customer initiates payment (after scanning QR)
router.post(
  '/create-order',
  paymentController.createOrderValidation,
  validate,
  paymentController.createOrder
);

// Verify payment status (polled after redirect)
router.get('/verify', paymentController.verifyPayment);

// Razorpay webhook — MUST come before express.json() parses the body.
// We capture the raw bytes here for HMAC-SHA256 signature verification.
router.post(
  '/webhook',
  webhookLimiter,
  (req, res, next) => {
    // Collect raw bytes — bypass any previously attached body parsers
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      req.rawBody = raw.toString('utf8');
      try {
        req.body = JSON.parse(req.rawBody);
      } catch {
        req.body = {};
      }
      next();
    });
    req.on('error', next);
  },
  paymentController.webhook
);

// Browser return redirect from Razorpay checkout
router.get('/return', paymentController.paymentReturn);

// Also expose a public pay page shortcut (QR scan lands here)
router.get('/pay', paymentController.showPayPage);

// ─── Protected routes (merchant) ─────────────────────────────────────────────
router.use(authenticate, attachMerchant);

router.get('/transactions', paymentController.listTransactions);
router.get('/transactions/:orderId', paymentController.getTransaction);

module.exports = router;
