const mongoose = require('mongoose');

const settlementSchema = new mongoose.Schema(
  {
    settlementRef: {
      type: String,
      unique: true,
      required: true,
    },
    merchantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Merchant',
      required: false,
    },
    isAdminSettlement: {
      type: Boolean,
      default: false,
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // Amount details
    grossAmount: {
      type: Number,
      required: true, // Total transaction amount
    },
    totalCommission: {
      type: Number,
      required: true, // Total commission deducted
    },
    netAmount: {
      type: Number,
      required: true, // Amount transferred to merchant
    },

    // Transactions included in this settlement
    transactions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Transaction',
      },
    ],
    transactionCount: {
      type: Number,
      default: 0,
    },

    // Bank/Payout details at time of settlement
    bankAccountNumber: { type: String },
    bankIfsc: { type: String },
    bankName: { type: String },
    accountHolderName: { type: String },

    // Cashfree Payout details
    payoutTransferId: {
      type: String, // Cashfree transfer ID
    },
    payoutReferenceId: {
      type: String, // Bank UTR / reference
    },
    payoutMode: {
      type: String,
      enum: ['IMPS', 'NEFT', 'RTGS', 'UPI', 'unknown'],
      default: 'IMPS',
    },

    // Status
    status: {
      type: String,
      enum: ['pending', 'processing', 'success', 'failed', 'reversed'],
      default: 'pending',
    },
    failureReason: { type: String },

    // Scheduling
    scheduledAt: { type: Date },
    initiatedAt: { type: Date },
    completedAt: { type: Date },

    // Type
    type: {
      type: String,
      enum: ['instant', 'scheduled', 'manual'],
      default: 'instant',
    },

    // Initiated by (for manual settlements)
    initiatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // Raw Cashfree response
    payoutResponse: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ─────────────────────────────────────────────────────────────────
// settlementRef already indexed via unique:true in schema definition
settlementSchema.index({ merchantId: 1, createdAt: -1 });
settlementSchema.index({ status: 1 });
settlementSchema.index({ payoutTransferId: 1 });
settlementSchema.index({ createdAt: -1 });

const Settlement = mongoose.model('Settlement', settlementSchema);
module.exports = Settlement;
