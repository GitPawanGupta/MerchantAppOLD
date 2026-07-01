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

// Cashfree webhook — raw body needed for signature verification
router.post(
  '/webhook',
  webhookLimiter,
  express.raw({ type: 'application/json' }),
  (req, res, next) => {
    // Attach raw body string for signature check; parse JSON for handler
    if (Buffer.isBuffer(req.body)) {
      req.rawBody = req.body.toString('utf8');
      try { req.body = JSON.parse(req.rawBody); } catch { req.body = {}; }
    }
    next();
  },
  paymentController.webhook
);

// Browser return redirect from Cashfree
router.get('/return', paymentController.paymentReturn);

// Also expose a public pay page shortcut (QR scan lands here)
router.get('/pay', paymentController.showPayPage);

// ─── Protected routes (merchant) ─────────────────────────────────────────────
router.use(authenticate, attachMerchant);

router.get('/transactions', paymentController.listTransactions);
router.get('/transactions/:orderId', paymentController.getTransaction);

module.exports = router;
