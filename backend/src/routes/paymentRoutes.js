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

// Razorpay webhook — rawBody is already set by express.json() verify callback in app.js
router.post(
  '/webhook',
  webhookLimiter,
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
