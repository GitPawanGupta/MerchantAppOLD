const { CommissionConfig, CommissionLedger } = require('../models/Commission');
const Transaction = require('../models/Transaction');
const logger = require('../utils/logger');

/**
 * Get effective commission rate for a merchant.
 * Merchant-specific config > global config > env default.
 */
const getEffectiveRate = async (merchantId) => {
  const merchantConfig = await CommissionConfig.findOne({
    merchantId,
    isActive: true,
  }).sort({ createdAt: -1 });

  if (merchantConfig) return merchantConfig;

  const globalConfig = await CommissionConfig.findOne({
    merchantId: null,
    isActive: true,
  }).sort({ createdAt: -1 });

  if (globalConfig) return globalConfig;

  // Bare minimum fallback — wrap env default as a plain object
  return {
    rate: parseFloat(process.env.DEFAULT_COMMISSION_RATE || '2.0'),
    flatFee: 0,
    minCommission: 0,
    maxCommission: null,
  };
};

/**
 * Create / update global commission config (admin action)
 */
const setGlobalCommission = async ({ rate, flatFee, minCommission, maxCommission, description, adminId }) => {
  // Deactivate current global config
  await CommissionConfig.updateMany({ merchantId: null, isActive: true }, { isActive: false });

  const config = await CommissionConfig.create({
    merchantId: null,
    rateType: 'percentage',
    rate,
    flatFee: flatFee || 0,
    minCommission: minCommission || 0,
    maxCommission: maxCommission || null,
    description,
    isActive: true,
    updatedBy: adminId,
  });

  logger.info(`Global commission updated to ${rate}% by admin ${adminId}`);
  return config;
};

/**
 * Set a merchant-specific commission override (admin action)
 */
const setMerchantCommission = async (merchantId, { rate, flatFee, minCommission, maxCommission, description, adminId }) => {
  await CommissionConfig.updateMany({ merchantId, isActive: true }, { isActive: false });

  const config = await CommissionConfig.create({
    merchantId,
    rateType: 'percentage',
    rate,
    flatFee: flatFee || 0,
    minCommission: minCommission || 0,
    maxCommission: maxCommission || null,
    description,
    isActive: true,
    updatedBy: adminId,
  });

  // Sync rate on merchant document
  const Merchant = require('../models/Merchant');
  await Merchant.findByIdAndUpdate(merchantId, { commissionRate: rate });

  logger.info(`Merchant ${merchantId} commission set to ${rate}% by admin ${adminId}`);
  return config;
};

/**
 * Remove merchant-specific override (falls back to global)
 */
const removeMerchantCommissionOverride = async (merchantId, adminId) => {
  await CommissionConfig.updateMany({ merchantId, isActive: true }, { isActive: false });

  const Merchant = require('../models/Merchant');
  await Merchant.findByIdAndUpdate(merchantId, { commissionRate: null });

  logger.info(`Merchant ${merchantId} commission override removed by admin ${adminId}`);
};

/**
 * Record commission entries for a batch of transactions (called during settlement)
 */
const recordCommissionLedger = async (transactions, settlementId) => {
  const entries = transactions.map((tx) => ({
    transactionId: tx._id,
    merchantId: tx.merchantId,
    settlementId,
    transactionAmount: tx.amount,
    commissionRate: tx.commissionRate,
    flatFee: 0,
    commissionAmount: tx.commissionAmount,
    netSettlementAmount: tx.settlementAmount,
    currency: 'INR',
    status: 'settled',
  }));

  await CommissionLedger.insertMany(entries, { ordered: false });
};

/**
 * Get commission summary for admin dashboard
 */
const getCommissionSummary = async ({ startDate, endDate, merchantId } = {}) => {
  const match = { status: 'settled' };
  if (merchantId) match.merchantId = merchantId;
  if (startDate || endDate) {
    match.createdAt = {};
    if (startDate) match.createdAt.$gte = new Date(startDate);
    if (endDate) match.createdAt.$lte = new Date(endDate);
  }

  const result = await CommissionLedger.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalCommission: { $sum: '$commissionAmount' },
        totalTransactions: { $sum: 1 },
        totalVolume: { $sum: '$transactionAmount' },
        avgRate: { $avg: '$commissionRate' },
      },
    },
  ]);

  return result[0] || {
    totalCommission: 0,
    totalTransactions: 0,
    totalVolume: 0,
    avgRate: 0,
  };
};

/**
 * Get per-merchant commission breakdown (admin report)
 */
const getCommissionByMerchant = async ({ startDate, endDate } = {}) => {
  const match = { status: 'settled' };
  if (startDate || endDate) {
    match.createdAt = {};
    if (startDate) match.createdAt.$gte = new Date(startDate);
    if (endDate) match.createdAt.$lte = new Date(endDate);
  }

  return CommissionLedger.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$merchantId',
        totalCommission: { $sum: '$commissionAmount' },
        totalVolume: { $sum: '$transactionAmount' },
        transactionCount: { $sum: 1 },
        avgRate: { $avg: '$commissionRate' },
      },
    },
    {
      $lookup: {
        from: 'merchants',
        localField: '_id',
        foreignField: '_id',
        as: 'merchant',
      },
    },
    { $unwind: { path: '$merchant', preserveNullAndEmpty: true } },
    {
      $project: {
        merchantId: '$merchant.merchantId',
        businessName: '$merchant.businessName',
        totalCommission: 1,
        totalVolume: 1,
        transactionCount: 1,
        avgRate: 1,
      },
    },
    { $sort: { totalCommission: -1 } },
  ]);
};

/**
 * List commission configs (admin)
 */
const listCommissionConfigs = async () => {
  return CommissionConfig.find({ isActive: true })
    .populate('merchantId', 'merchantId businessName')
    .populate('updatedBy', 'name email')
    .sort({ merchantId: 1, createdAt: -1 });
};

module.exports = {
  getEffectiveRate,
  setGlobalCommission,
  setMerchantCommission,
  removeMerchantCommissionOverride,
  recordCommissionLedger,
  getCommissionSummary,
  getCommissionByMerchant,
  listCommissionConfigs,
};
