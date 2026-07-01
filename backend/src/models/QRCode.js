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
    // QR type: static (fixed) or dynamic (per-transaction)
    type: {
      type: String,
      enum: ['static', 'dynamic'],
      default: 'static',
    },
    // For dynamic QR - linked to a specific amount/order
    fixedAmount: {
      type: Number,
      min: 1,
      default: null, // null = any amount
    },
    label: {
      type: String,
      trim: true,
      maxlength: 100,
      default: 'Payment QR',
    },
    // QR image (base64 or URL)
    qrImageBase64: {
      type: String,
    },
    qrImageUrl: {
      type: String,
    },
    // Payment URL embedded in QR
    paymentUrl: {
      type: String,
      required: true,
    },
    // UPI VPA if applicable
    upiVpa: {
      type: String,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Usage stats
    scanCount: { type: Number, default: 0 },
    successfulPayments: { type: Number, default: 0 },
    totalAmountCollected: { type: Number, default: 0 },

    // Expiry for dynamic QR
    expiresAt: {
      type: Date,
      default: null,
    },
    // Order ID if tied to a specific transaction
    orderId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ─────────────────────────────────────────────────────────────────
// qrId already indexed via unique:true in schema definition
qrCodeSchema.index({ merchantId: 1 });
qrCodeSchema.index({ isActive: 1 });
qrCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, partialFilterExpression: { expiresAt: { $ne: null } } });

const QRCode = mongoose.model('QRCode', qrCodeSchema);
module.exports = QRCode;
