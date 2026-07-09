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
      required: false, // null for admin commission settlements
    },
    isAdminSettlement: {
      type: Boolean,
      default: false,
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // Amount breakdown
    grossAmount: {
      type: Number,
      required: true, // Total transaction amount before commission
    },
    totalCommission: {
      type: Number,
      required: true, // Total commission deducted
    },
    netAmount: {
      type: Number,
      required: true, // Amount transferred to merchant/admin
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

    // Bank details snapshot at time of settlement
    bankAccountNumber: { type: String },
    bankIfsc:          { type: String },
    bankName:          { type: String },
    accountHolderName: { type: String },

    // Payout reference (UTR / bank reference — filled after manual transfer)
    payoutTransferId:  { type: String }, // External transfer/UTR reference
    payoutReferenceId: { type: String }, // Bank UTR reference number
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

    // Timestamps
    scheduledAt:  { type: Date },
    initiatedAt:  { type: Date },
    completedAt:  { type: Date },

    // Type of settlement
    type: {
      type: String,
      enum: ['instant', 'scheduled', 'manual'],
      default: 'instant',
    },

    // Who triggered this settlement (for manual/admin settlements)
    initiatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // Raw gateway response (for audit trail)
    payoutResponse: {
      type: mongoose.Schema.Types.Mixed,
    },

    // Flag to track if merchant balance was updated (prevent double-update)
    isBalanceUpdated: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
// settlementRef already indexed via unique:true in schema definition
settlementSchema.index({ merchantId: 1, createdAt: -1 });
settlementSchema.index({ status: 1 });
settlementSchema.index({ payoutTransferId: 1 });
settlementSchema.index({ createdAt: -1 });

const Settlement = mongoose.model('Settlement', settlementSchema);
module.exports = Settlement;
