const Razorpay = require('razorpay');

// ─── Razorpay Payment Gateway Config ─────────────────────────────────────────
const RAZORPAY_CONFIG = {
  keyId: process.env.RAZORPAY_KEY_ID,
  keySecret: process.env.RAZORPAY_KEY_SECRET,
};

if (!RAZORPAY_CONFIG.keyId || !RAZORPAY_CONFIG.keySecret) {
  throw new Error('RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set in environment');
}

// ─── Razorpay SDK Instance ────────────────────────────────────────────────────
const razorpayClient = new Razorpay({
  key_id: RAZORPAY_CONFIG.keyId,
  key_secret: RAZORPAY_CONFIG.keySecret,
});

module.exports = {
  RAZORPAY_CONFIG,
  razorpayClient,
};
