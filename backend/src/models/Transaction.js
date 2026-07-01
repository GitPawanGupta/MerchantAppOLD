const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    // Internal IDs
    orderId: {
      type: String,
      unique: true,
      required: true,
    },
    merchantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Merchant',
      required: true,
    },
    qrCodeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'QRCode',
    },

    // Cashfree IDs
    cfOrderId: {
      type: String, // Cashfree's order ID
    },
    cfPaymentId: {
      type: String, // Cashfree's payment ID
    },
    cfReferenceId: {
      type: String, // Bank reference number
    },

    // Customer details
    customerName: { type: String, trim: true },
    customerEmail: { type: String, trim: true, lowercase: true },
    customerPhone: { type: String, trim: true },

    // Amount breakdown
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    commissionRate: {
      type: Number,
      required: true,
    },
    commissionAmount: {
      type: Number,
      required: true,
    },
    settlementAmount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: 'INR',
    },

    // Payment details
    paymentMethod: {
      type: String,
      enum: ['upi', 'card', 'netbanking', 'wallet', 'emi', 'unknown'],
      default: 'unknown',
    },
    paymentInstrument: {
      type: String, // e.g. "UPI", "VISA", "SBI"
    },
    upiTransactionId: {
      type: String,
    },

    // Status
    status: {
      type: String,
      enum: ['created', 'pending', 'success', 'failed', 'cancelled', 'refunded'],
      default: 'created',
    },

    // Settlement linkage
    settlementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Settlement',
      default: null,
    },
    isSettled: {
      type: Boolean,
      default: false,
    },
    settledAt: {
      type: Date,
    },

    // Webhook / callback data
    webhookData: {
      type: mongoose.Schema.Types.Mixed,
    },
    failureReason: {
      type: String,
    },

    // Refund info
    refundStatus: {
      type: String,
      enum: ['none', 'initiated', 'processed', 'failed'],
      default: 'none',
    },
    refundAmount: {
      type: Number,
      default: 0,
    },
    refundId: {
      type: String,
    },
    refundedAt: {
      type: Date,
    },

    // Timestamps from Cashfree
    paymentTime: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ─────────────────────────────────────────────────────────────────
// orderId already indexed via unique:true in schema definition
transactionSchema.index({ merchantId: 1, createdAt: -1 });
transactionSchema.index({ cfOrderId: 1 });
transactionSchema.index({ cfPaymentId: 1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ isSettled: 1 });
transactionSchema.index({ settlementId: 1 });
transactionSchema.index({ createdAt: -1 });

const Transaction = mongoose.model('Transaction', transactionSchema);
module.exports = Transaction;
