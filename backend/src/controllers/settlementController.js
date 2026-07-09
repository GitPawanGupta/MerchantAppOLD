const settlementService = require('../services/settlementService');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const { getPaginationParams, buildPaginationMeta } = require('../utils/helpers');

/**
 * GET /api/settlement
 * Merchant — list own settlements (paginated, optional ?status= filter)
 */
const listSettlements = async (req, res, next) => {
  try {
    const { page, limit } = getPaginationParams(req.query);
    const { status } = req.query;

    const { settlements, total } = await settlementService.getMerchantSettlements(
      req.merchant._id,
      { page, limit, status }
    );

    return res.status(200).json({
      success: true,
      data: settlements,
      pagination: buildPaginationMeta(total, page, limit),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/settlement/:settlementRef
 * Merchant — get a single settlement with its transactions
 */
const getSettlementDetail = async (req, res, next) => {
  try {
    const settlement = await settlementService.getSettlementDetail(
      req.params.settlementRef,
      req.merchant._id
    );
    return successResponse(res, settlement);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/settlement/request
 * Merchant — request an on-demand settlement to a saved bank account.
 * No external payout API is called; the record is created with status=pending
 * and settled via Razorpay Route (already ran at payment time) or admin action.
 */
const requestSettlement = async (req, res, next) => {
  try {
    const { bankAccountId } = req.body;

    if (!bankAccountId) {
      return errorResponse(res, 'bankAccountId is required', 400);
    }

    if (req.merchant.status !== 'active') {
      return errorResponse(res, 'Merchant account is not active', 400);
    }

    if (!req.merchant.kyc || req.merchant.kyc.status !== 'approved') {
      return errorResponse(res, 'KYC approval is required for settlements', 400);
    }

    const settlement = await settlementService.manualMerchantSettlement(
      req.merchant._id,
      bankAccountId
    );

    if (!settlement) {
      return errorResponse(
        res,
        'No unsettled transactions or amount below minimum threshold (₹100)',
        400
      );
    }

    return successResponse(
      res,
      {
        settlementRef: settlement.settlementRef,
        netAmount: settlement.netAmount,
        status: settlement.status,
        transactionCount: settlement.transactionCount,
        bankName: settlement.bankName,
        bankAccountNumber: settlement.bankAccountNumber
          ? `****${settlement.bankAccountNumber.slice(-4)}`
          : undefined,
      },
      'Settlement request recorded successfully'
    );
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listSettlements,
  getSettlementDetail,
  requestSettlement,
};
