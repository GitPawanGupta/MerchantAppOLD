const mongoose = require('mongoose');

/**
 * CommissionConfig - Global or per-merchant commission rules
 */
const commissionConfigSchema = new mongoose.Schema(
  {
    // null = global config, ObjectId = merchant-specific override
    merchantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Merchant',
      default: null,
      index: true,
    },
    // Rate type
    rateType: {
      type: String,
      enum: ['percentage', 'flat', 'tiered'],
      default: 'percentage',
    },
    // For percentage and flat
    rate: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    // Flat fee in addition to percentage (optional)
    flatFee: {
      type: Number,
      default: 0,
    },
    // Min/max commission caps
    minCommission: {
      type: Number,
      default: 0,
    },
    maxCommission: {
      type: Number,
      default: null, // null = no cap
    },
    // Applicable category (null = all)
    category: {
      type: String,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    description: { type: String },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

commissionConfigSchema.index({ merchantId: 1, isActive: 1 });

const CommissionConfig = mongoose.model('CommissionConfig', commissionConfigSchema);

/**
 * CommissionLedger - Record of every commission deduction
 */
const commissionLedgerSchema = new mongoose.Schema(
  {
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      required: true,
    },
    merchantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Merchant',
      required: true,
    },
    settlementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Settlement',
    },
    transactionAmount: { type: Number, required: true },
    commissionRate: { type: Number, required: true },
    flatFee: { type: Number, default: 0 },
    commissionAmount: { type: Number, required: true },
    netSettlementAmount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    status: {
      type: String,
      enum: ['pending', 'settled', 'reversed'],
      default: 'pending',
    },
  },
  {
    timestamps: true,
  }
);

commissionLedgerSchema.index({ merchantId: 1, createdAt: -1 });
commissionLedgerSchema.index({ transactionId: 1 });
commissionLedgerSchema.index({ settlementId: 1 });
commissionLedgerSchema.index({ createdAt: -1 });

const CommissionLedger = mongoose.model('CommissionLedger', commissionLedgerSchema);

module.exports = { CommissionConfig, CommissionLedger };
