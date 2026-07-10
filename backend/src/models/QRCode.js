const mongoose = require('mongoose');

const qrCodeSchema = new mongoose.Schema(
  {
    merchantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Merchant',
      required: true,
    },
    qrId: {
      type: String,
      unique: true,
      required: true,
    },
    // QR type: static (reusable, any amount) or dynamic (fixed amount, expires)
    type: {
      type: String,
      enum: ['static', 'dynamic'],
      default: 'static',
    },
    // For dynamic QR — fixed payment amount
    fixedAmount: {
      type: Number,
      min: 1,
      default: null,
    },
    label: {
      type: String,
      trim: true,
      maxlength: 100,
      default: 'Payment QR',
    },
    // QR image is NOT stored in DB — generated on-the-fly by GET /:qrId/image
    // to keep document size small. qrImageUrl kept for future CDN/S3 use.
    qrImageUrl: {
      type: String,
      default: null,
    },
    // Razorpay UPI QR Code ID (qr_xxx) — set when Razorpay QR is created
    razorpayQrId: {
      type: String,
      default: null,
      index: true,
      sparse: true,
    },
    // Hosted image URL from Razorpay CDN — shown directly in app
    razorpayQrImageUrl: {
      type: String,
      default: null,
    },
    // Payment URL embedded inside the QR image
    paymentUrl: {
      type: String,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Usage stats
    scanCount:            { type: Number, default: 0 },
    successfulPayments:   { type: Number, default: 0 },
    totalAmountCollected: { type: Number, default: 0 },

    // Expiry for dynamic QR (null = never expires)
    // NOT using a TTL index — we handle expiry in application code so we can
    // return a proper 410 "expired" message instead of a 404 "not found".
    expiresAt: {
      type: Date,
      default: null,
    },
    // Internal order ID if tied to a specific transaction (dynamic QR)
    orderId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
// qrId already indexed via unique:true above
qrCodeSchema.index({ merchantId: 1, createdAt: -1 });
qrCodeSchema.index({ isActive: 1 });
// expiresAt index for efficient querying of expired QRs (no TTL — app handles expiry)
qrCodeSchema.index({ expiresAt: 1 }, { sparse: true });

const QRCode = mongoose.model('QRCode', qrCodeSchema);
module.exports = QRCode;
