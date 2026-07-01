const reportingService = require('../services/reportingService');
const { successResponse } = require('../utils/apiResponse');

// ─── Merchant Reports ─────────────────────────────────────────────────────────

/**
 * GET /api/reports/transactions
 * Merchant — own transaction report
 */
const merchantTransactionReport = async (req, res, next) => {
  try {
    const report = await reportingService.getMerchantTransactionReport(
      req.merchant._id,
      req.query
    );
    return successResponse(res, report);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/reports/settlements
 * Merchant — own settlement report
 */
const merchantSettlementReport = async (req, res, next) => {
  try {
    const report = await reportingService.getMerchantSettlementReport(
      req.merchant._id,
      req.query
    );
    return successResponse(res, report);
  } catch (error) {
    next(error);
  }
};

// ─── Admin Reports ────────────────────────────────────────────────────────────

/**
 * GET /api/admin/reports/transactions
 */
const adminTransactionReport = async (req, res, next) => {
  try {
    const report = await reportingService.getAdminTransactionReport(req.query);
    return successResponse(res, report);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/reports/commissions
 */
const adminCommissionReport = async (req, res, next) => {
  try {
    const report = await reportingService.getAdminCommissionReport(req.query);
    return successResponse(res, report);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/reports/settlements
 */
const adminSettlementReport = async (req, res, next) => {
  try {
    const report = await reportingService.getAdminSettlementReport(req.query);
    return successResponse(res, report);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  merchantTransactionReport,
  merchantSettlementReport,
  adminTransactionReport,
  adminCommissionReport,
  adminSettlementReport,
};
