const Transaction = require('../models/Transaction');
const Settlement = require('../models/Settlement');
const Merchant = require('../models/Merchant');
const { CommissionLedger } = require('../models/Commission');
const { getDateRange } = require('../utils/helpers');

// ─── Merchant Reports ─────────────────────────────────────────────────────────

/**
 * Transaction report for a merchant with daily breakdown
 */
const getMerchantTransactionReport = async (merchantId, { period, startDate, endDate } = {}) => {
  const range = startDate && endDate
    ? { startDate: new Date(startDate), endDate: new Date(endDate) }
    : getDateRange(period || 'month');

  const match = {
    merchantId: mongoose_id(merchantId),
    status: 'success',
    createdAt: { $gte: range.startDate, $lte: range.endDate },
  };

  const [summary, dailyBreakdown, byMethod] = await Promise.all([
    // Overall summary
    Transaction.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' },
          totalCommission: { $sum: '$commissionAmount' },
          totalSettlement: { $sum: '$settlementAmount' },
          count: { $sum: 1 },
          avgAmount: { $avg: '$amount' },
          maxAmount: { $max: '$amount' },
          minAmount: { $min: '$amount' },
        },
      },
    ]),

    // Daily breakdown
    Transaction.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' },
          },
          amount: { $sum: '$amount' },
          commission: { $sum: '$commissionAmount' },
          settlement: { $sum: '$settlementAmount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
      {
        $project: {
          date: {
            $dateFromParts: {
              year: '$_id.year',
              month: '$_id.month',
              day: '$_id.day',
            },
          },
          amount: 1,
          commission: 1,
          settlement: 1,
          count: 1,
          _id: 0,
        },
      },
    ]),

    // By payment method
    Transaction.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$paymentMethod',
          amount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { amount: -1 } },
    ]),
  ]);

  return {
    period: { startDate: range.startDate, endDate: range.endDate },
    summary: summary[0] || {
      totalAmount: 0, totalCommission: 0, totalSettlement: 0,
      count: 0, avgAmount: 0, maxAmount: 0, minAmount: 0,
    },
    dailyBreakdown,
    byPaymentMethod: byMethod,
  };
};

/**
 * Settlement report for a merchant
 */
const getMerchantSettlementReport = async (merchantId, { period, startDate, endDate } = {}) => {
  const range = startDate && endDate
    ? { startDate: new Date(startDate), endDate: new Date(endDate) }
    : getDateRange(period || 'month');

  const match = {
    merchantId: mongoose_id(merchantId),
    createdAt: { $gte: range.startDate, $lte: range.endDate },
  };

  const [summary, byStatus, list] = await Promise.all([
    Settlement.aggregate([
      { $match: { ...match, status: 'success' } },
      {
        $group: {
          _id: null,
          totalGross: { $sum: '$grossAmount' },
          totalCommission: { $sum: '$totalCommission' },
          totalNet: { $sum: '$netAmount' },
          count: { $sum: 1 },
        },
      },
    ]),
    Settlement.aggregate([
      { $match: match },
      { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$netAmount' } } },
    ]),
    Settlement.find(match)
      .sort({ createdAt: -1 })
      .limit(50)
      .select('settlementRef grossAmount totalCommission netAmount status type createdAt completedAt payoutMode'),
  ]);

  return {
    period: { startDate: range.startDate, endDate: range.endDate },
    summary: summary[0] || { totalGross: 0, totalCommission: 0, totalNet: 0, count: 0 },
    byStatus,
    recentSettlements: list,
  };
};

// ─── Admin Reports ────────────────────────────────────────────────────────────

/**
 * Platform-wide overview for admin dashboard
 */
const getAdminDashboard = async () => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const monthStart = new Date();
  monthStart.setDate(monthStart.getDate() - 30);

  const [
    totalMerchants,
    activeMerchants,
    pendingKYC,
    todayTx,
    monthTx,
    pendingSettlements,
    recentTx,
    topMerchants,
  ] = await Promise.all([
    Merchant.countDocuments(),
    Merchant.countDocuments({ status: 'active' }),
    Merchant.countDocuments({ 'kyc.status': 'submitted' }),

    // Today's transactions
    Transaction.aggregate([
      { $match: { status: 'success', createdAt: { $gte: todayStart } } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          volume: { $sum: '$amount' },
          commission: { $sum: '$commissionAmount' },
        },
      },
    ]),

    // 30-day transactions
    Transaction.aggregate([
      { $match: { status: 'success', createdAt: { $gte: monthStart } } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          volume: { $sum: '$amount' },
          commission: { $sum: '$commissionAmount' },
          settled: { $sum: '$settlementAmount' },
        },
      },
    ]),

    // Pending settlements
    Settlement.aggregate([
      { $match: { status: { $in: ['pending', 'processing'] } } },
      { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$netAmount' } } },
    ]),

    // Recent 10 transactions
    Transaction.find({ status: 'success' })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('merchantId', 'merchantId businessName')
      .select('orderId amount commissionAmount settlementAmount paymentMethod createdAt merchantId'),

    // Top 5 merchants by volume (30 days)
    Transaction.aggregate([
      { $match: { status: 'success', createdAt: { $gte: monthStart } } },
      {
        $group: {
          _id: '$merchantId',
          volume: { $sum: '$amount' },
          commission: { $sum: '$commissionAmount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { volume: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'merchants',
          localField: '_id',
          foreignField: '_id',
          as: 'merchant',
        },
      },
      { $unwind: '$merchant' },
      {
        $project: {
          merchantId: '$merchant.merchantId',
          businessName: '$merchant.businessName',
          volume: 1,
          commission: 1,
          count: 1,
        },
      },
    ]),
  ]);

  return {
    merchants: {
      total: totalMerchants,
      active: activeMerchants,
      pendingKYC,
    },
    today: todayTx[0] || { count: 0, volume: 0, commission: 0 },
    month: monthTx[0] || { count: 0, volume: 0, commission: 0, settled: 0 },
    pendingSettlements: pendingSettlements[0] || { count: 0, amount: 0 },
    recentTransactions: recentTx,
    topMerchants,
  };
};

/**
 * Platform transaction report with filters (admin)
 */
const getAdminTransactionReport = async ({ period, startDate, endDate, merchantId } = {}) => {
  const range = startDate && endDate
    ? { startDate: new Date(startDate), endDate: new Date(endDate) }
    : getDateRange(period || 'month');

  const match = {
    status: 'success',
    createdAt: { $gte: range.startDate, $lte: range.endDate },
  };
  if (merchantId) match.merchantId = mongoose_id(merchantId);

  const [summary, dailyBreakdown, byMerchant] = await Promise.all([
    Transaction.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalVolume: { $sum: '$amount' },
          totalCommission: { $sum: '$commissionAmount' },
          totalSettled: { $sum: '$settlementAmount' },
          count: { $sum: 1 },
        },
      },
    ]),

    Transaction.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' },
          },
          volume: { $sum: '$amount' },
          commission: { $sum: '$commissionAmount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
      {
        $project: {
          date: { $dateFromParts: { year: '$_id.year', month: '$_id.month', day: '$_id.day' } },
          volume: 1, commission: 1, count: 1, _id: 0,
        },
      },
    ]),

    Transaction.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$merchantId',
          volume: { $sum: '$amount' },
          commission: { $sum: '$commissionAmount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { volume: -1 } },
      { $limit: 20 },
      {
        $lookup: { from: 'merchants', localField: '_id', foreignField: '_id', as: 'merchant' },
      },
      { $unwind: { path: '$merchant', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          merchantId: '$merchant.merchantId',
          businessName: '$merchant.businessName',
          volume: 1, commission: 1, count: 1,
        },
      },
    ]),
  ]);

  return {
    period: { startDate: range.startDate, endDate: range.endDate },
    summary: summary[0] || { totalVolume: 0, totalCommission: 0, totalSettled: 0, count: 0 },
    dailyBreakdown,
    byMerchant,
  };
};

/**
 * Commission report (admin)
 */
const getAdminCommissionReport = async ({ period, startDate, endDate } = {}) => {
  const range = startDate && endDate
    ? { startDate: new Date(startDate), endDate: new Date(endDate) }
    : getDateRange(period || 'month');

  const match = {
    status: 'settled',
    createdAt: { $gte: range.startDate, $lte: range.endDate },
  };

  const [summary, daily, byMerchant] = await Promise.all([
    CommissionLedger.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalCommission: { $sum: '$commissionAmount' },
          totalVolume: { $sum: '$transactionAmount' },
          count: { $sum: 1 },
          avgRate: { $avg: '$commissionRate' },
        },
      },
    ]),

    CommissionLedger.aggregate([
      { $match: match },
      {
        $group: {
          _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' }, day: { $dayOfMonth: '$createdAt' } },
          commission: { $sum: '$commissionAmount' },
          volume: { $sum: '$transactionAmount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
      {
        $project: {
          date: { $dateFromParts: { year: '$_id.year', month: '$_id.month', day: '$_id.day' } },
          commission: 1, volume: 1, count: 1, _id: 0,
        },
      },
    ]),

    CommissionLedger.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$merchantId',
          commission: { $sum: '$commissionAmount' },
          volume: { $sum: '$transactionAmount' },
          count: { $sum: 1 },
          avgRate: { $avg: '$commissionRate' },
        },
      },
      { $sort: { commission: -1 } },
      { $limit: 20 },
      { $lookup: { from: 'merchants', localField: '_id', foreignField: '_id', as: 'merchant' } },
      { $unwind: { path: '$merchant', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          merchantId: '$merchant.merchantId',
          businessName: '$merchant.businessName',
          commission: 1, volume: 1, count: 1, avgRate: 1,
        },
      },
    ]),
  ]);

  return {
    period: { startDate: range.startDate, endDate: range.endDate },
    summary: summary[0] || { totalCommission: 0, totalVolume: 0, count: 0, avgRate: 0 },
    dailyBreakdown: daily,
    byMerchant,
  };
};

/**
 * Settlement report (admin)
 */
const getAdminSettlementReport = async ({ period, startDate, endDate } = {}) => {
  const range = startDate && endDate
    ? { startDate: new Date(startDate), endDate: new Date(endDate) }
    : getDateRange(period || 'month');

  const match = { createdAt: { $gte: range.startDate, $lte: range.endDate } };

  const [summary, byStatus, list] = await Promise.all([
    Settlement.aggregate([
      { $match: { ...match, status: 'success' } },
      {
        $group: {
          _id: null,
          totalGross: { $sum: '$grossAmount' },
          totalCommission: { $sum: '$totalCommission' },
          totalNet: { $sum: '$netAmount' },
          count: { $sum: 1 },
        },
      },
    ]),
    Settlement.aggregate([
      { $match: match },
      { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$netAmount' } } },
    ]),
    Settlement.find(match)
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('merchantId', 'merchantId businessName')
      .select('settlementRef grossAmount totalCommission netAmount status type createdAt completedAt merchantId payoutMode'),
  ]);

  return {
    period: { startDate: range.startDate, endDate: range.endDate },
    summary: summary[0] || { totalGross: 0, totalCommission: 0, totalNet: 0, count: 0 },
    byStatus,
    recentSettlements: list,
  };
};

// Helper: convert string ID to ObjectId safely
const mongoose_id = (id) => {
  const mongoose = require('mongoose');
  return new mongoose.Types.ObjectId(id);
};

module.exports = {
  getMerchantTransactionReport,
  getMerchantSettlementReport,
  getAdminDashboard,
  getAdminTransactionReport,
  getAdminCommissionReport,
  getAdminSettlementReport,
};
