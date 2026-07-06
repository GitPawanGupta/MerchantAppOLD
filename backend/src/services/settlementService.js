const Settlement = require('../models/Settlement');
const Transaction = require('../models/Transaction');
const Merchant = require('../models/Merchant');
const { CommissionLedger } = require('../models/Commission');
const { generatePayoutRef } = require('../utils/helpers');
const commissionService = require('./commissionService');
const logger = require('../utils/logger');

/**
 * List settlements for a merchant (paginated)
 */
const getMerchantSettlements = async (merchantId, { page = 1, limit = 20 } = {}) => {
  const skip = (page - 1) * limit;
  const [settlements, total] = await Promise.all([
    Settlement.find({ merchantId }).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Settlement.countDocuments({ merchantId }),
  ]);
  return { settlements, total };
};

/**
 * Get a single settlement by ref
 */
const getSettlementByRef = async (settlementRef, merchantId = null) => {
  const filter = { settlementRef };
  if (merchantId) filter.merchantId = merchantId;
  const settlement = await Settlement.findOne(filter);
  if (!settlement) {
    const err = new Error('Settlement not found');
    err.statusCode = 404;
    throw err;
  }
  return settlement;
};

/**
 * Create a settlement record for a batch of transactions.
 * With Partner Technology, transfers happen via Razorpay Route automatically.
 * This creates the accounting record only.
 */
const createSettlementRecord = async (merchantId, transactionIds) => {
  const merchant = await Merchant.findById(merchantId);
  if (!merchant) throw new Error('Merchant not found');

  const transactions = await Transaction.find({
    _id: { $in: transactionIds },
    merchantId,
    status: 'success',
    isSettled: false,
  });

  if (transactions.length === 0) {
    logger.info(`No unsettled transactions for merchant ${merchantId}`);
    return null;
  }

  const grossAmount = transactions.reduce((s, t) => s + t.amount, 0);
  const totalCommission = transactions.reduce((s, t) => s + t.commissionAmount, 0);
  const netAmount = transactions.reduce((s, t) => s + t.settlementAmount, 0);

  const settlementRef = generatePayoutRef('SET');

  const settlement = await Settlement.create({
    settlementRef,
    merchantId,
    grossAmount,
    totalCommission,
    netAmount,
    transactions: transactions.map((t) => t._id),
    transactionCount: transactions.length,
    status: merchant.isRazorpayLinked ? 'success' : 'pending',
    type: 'instant',
    payoutMode: merchant.isRazorpayLinked ? 'RAZORPAY_ROUTE' : 'manual',
    initiatedAt: new Date(),
    completedAt: merchant.isRazorpayLinked ? new Date() : null,
  });

  // Mark transactions settled
  await Transaction.updateMany(
    { _id: { $in: transactions.map((t) => t._id) } },
    { isSettled: true, settledAt: new Date(), settlementId: settlement._id }
  );

  // Commission ledger
  await commissionService.recordCommissionLedger(transactions, settlement._id);

  // Update merchant balance
  await Merchant.findByIdAndUpdate(merchantId, {
    $inc: {
      totalSettled: netAmount,
      pendingSettlement: -netAmount,
    },
  });

  logger.info(`Settlement record ${settlementRef} created: ₹${netAmount} for merchant ${merchant.merchantId}`);
  return settlement;
};

module.exports = {
  getMerchantSettlements,
  getSettlementByRef,
  createSettlementRecord,
};
