const mongoose = require('mongoose');

/**
 * Payout - tracks Cashfree Payout API calls independently
 * One settlement can have one payout record
 */
const payoutSchema = new mongoose.Schema(
  {
    settlementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Settlement',
      required: true,
    },
    merchantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Merchant',
      required: false,
    },
    isAdminPayout: {
      type: Boolean,
      default: false,
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    // Internal reference
    payoutRef: {
      type: String,
      unique: true,
      required: true,
    },
    // Cashfree transfer details
    transferId: {
      type: String, // Cashfree batchTransferId or transferId
    },
    beneficiaryId: {
      type: String, // Cashfree beneficiary ID
    },
    // Amount
    amount: {
      type: Number,
      required: true,
    },
    currency: { type: String, default: 'INR' },
    // Mode
    transferMode: {
      type: String,
      enum: ['IMPS', 'NEFT', 'RTGS', 'UPI'],
      default: 'IMPS',
    },
    // Bank info at the time of payout
    accountNumber: { type: String },
    ifsc: { type: String },
    accountHolder: { type: String },
    // Status
    status: {
      type: String,
      enum: ['pending', 'processing', 'SUCCESS', 'FAILED', 'REVERSED', 'cancelled'],
      default: 'pending',
    },
    // Cashfree status updates
    cashfreeStatus: { type: String },
    utr: { type: String }, // Bank UTR reference
    failureReason: { type: String },
    // Retry info
    retryCount: { type: Number, default: 0 },
    lastRetryAt: { type: Date },
    // Timestamps
    initiatedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
    // Raw responses
    cashfreeRequest: { type: mongoose.Schema.Types.Mixed },
    cashfreeResponse: { type: mongoose.Schema.Types.Mixed },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ─────────────────────────────────────────────────────────────────
// payoutRef already indexed via unique:true in schema definition
payoutSchema.index({ settlementId: 1 });
payoutSchema.index({ merchantId: 1, createdAt: -1 });
payoutSchema.index({ transferId: 1 });
payoutSchema.index({ status: 1 });

const Payout = mongoose.model('Payout', payoutSchema);
module.exports = Payout;
