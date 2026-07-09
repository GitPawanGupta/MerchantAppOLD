const reportingService = require('../services/reportingService');
const { successResponse } = require('../utils/apiResponse');

// ─── Merchant Reports ─────────────────────────────────────────────────────────
// Admin reports are handled directly in adminController via reportingService.
// This controller is for merchant-facing report endpoints only.

/**
 * GET /api/reports/transactions
 * Merchant — own transaction report with daily breakdown
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

module.exports = {
  merchantTransactionReport,
  merchantSettlementReport,
};
