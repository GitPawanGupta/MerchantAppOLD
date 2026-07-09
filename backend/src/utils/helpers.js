const crypto = require('crypto');

/**
 * Generate a unique order ID with prefix
 */
const generateOrderId = (prefix = 'ORD') => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}_${timestamp}_${random}`;
};

/**
 * Generate a unique payout reference ID
 */
const generatePayoutRef = (prefix = 'PAY') => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${prefix}_${timestamp}_${random}`;
};

/**
 * Calculate commission amount
 * @param {number} amount - Transaction amount
 * @param {number} rate - Commission rate in percentage
 * @returns {{ commissionAmount: number, settlementAmount: number }}
 */
const calculateCommission = (amount, rate) => {
  const commissionAmount = parseFloat(((amount * rate) / 100).toFixed(2));
  const settlementAmount = parseFloat((amount - commissionAmount).toFixed(2));
  return { commissionAmount, settlementAmount };
};

/**
 * Paginate query params
 */
const getPaginationParams = (query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 10));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

/**
 * Build pagination meta object
 */
const buildPaginationMeta = (total, page, limit) => ({
  total,
  page,
  limit,
  totalPages: Math.ceil(total / limit),
  hasNext: page * limit < total,
  hasPrev: page > 1,
});

/**
 * Mask sensitive string (e.g. account numbers)
 */
const maskString = (str, visibleCount = 4) => {
  if (!str || str.length <= visibleCount) return str;
  return '*'.repeat(str.length - visibleCount) + str.slice(-visibleCount);
};

/**
 * Get date range for reports
 */
const getDateRange = (period) => {
  const now = new Date();
  let startDate;

  switch (period) {
    case 'today':
      startDate = new Date(now.setHours(0, 0, 0, 0));
      break;
    case 'yesterday':
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);
      const endOfYesterday = new Date(startDate);
      endOfYesterday.setHours(23, 59, 59, 999);
      return { startDate, endDate: endOfYesterday };
    case 'week':
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
      break;
    case 'month':
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 30);
      break;
    case 'quarter':
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 90);
      break;
    default:
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 30);
  }

  return { startDate, endDate: new Date() };
};

module.exports = {
  generateOrderId,
  generatePayoutRef,
  calculateCommission,
  getPaginationParams,
  buildPaginationMeta,
  maskString,
  getDateRange,
};
