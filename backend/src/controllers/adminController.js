const { body } = require('express-validator');
const mongoose = require('mongoose');
const User = require('../models/User');
const Merchant = require('../models/Merchant');
const Transaction = require('../models/Transaction');
const Settlement = require('../models/Settlement');
const commissionService = require('../services/commissionService');
const settlementService = require('../services/settlementService');
const reportingService = require('../services/reportingService');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const { getPaginationParams, buildPaginationMeta } = require('../utils/helpers');
const logger = require('../utils/logger');

// ─── Validation ───────────────────────────────────────────────────────────────
const globalCommissionValidation = [
  body('rate')
    .isFloat({ min: 0, max: 100 })
    .withMessage('Rate must be between 0 and 100'),
  body('flatFee').optional().isFloat({ min: 0 }),
  body('minCommission').optional().isFloat({ min: 0 }),
  body('maxCommission').optional().isFloat({ min: 0 }),
  body('description').optional().trim().isLength({ max: 200 }),
];

const merchantCommissionValidation = [
  body('rate')
    .isFloat({ min: 0, max: 100 })
    .withMessage('Rate must be between 0 and 100'),
  body('flatFee').optional().isFloat({ min: 0 }),
  body('description').optional().trim().isLength({ max: 200 }),
];

const kycActionValidation = [
  body('action')
    .isIn(['approve', 'reject', 'under_review'])
    .withMessage('Action must be approve, reject, or under_review'),
  body('rejectionReason')
    .if(body('action').equals('reject'))
    .notEmpty()
    .withMessage('Rejection reason required when rejecting KYC'),
];

const merchantStatusValidation = [
  body('status')
    .isIn(['active', 'suspended', 'closed'])
    .withMessage('Status must be active, suspended, or closed'),
  body('reason').optional().trim().isLength({ max: 300 }),
];

const bankValidation = [
  body('accountHolderName').trim().notEmpty().withMessage('Account holder name required'),
  body('accountNumber').trim().notEmpty().withMessage('Account number required')
    .isLength({ min: 9, max: 18 }).withMessage('Invalid account number length'),
  body('ifscCode')
    .trim()
    .matches(/^[A-Z]{4}0[A-Z0-9]{6}$/)
    .withMessage('Invalid IFSC code'),
  body('bankName').trim().notEmpty().withMessage('Bank name required'),
  body('accountType').optional().isIn(['savings', 'current']),
];

// ─── Dashboard ────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/dashboard
 */
const getDashboard = async (req, res, next) => {
  try {
    const data = await reportingService.getAdminDashboard();
    return successResponse(res, data);
  } catch (error) {
    next(error);
  }
};

// ─── Merchant Management ──────────────────────────────────────────────────────

/**
 * GET /api/admin/merchants
 * List all merchants with filters and pagination
 */
const listMerchants = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPaginationParams(req.query);
    const { status, kycStatus, search } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (kycStatus) filter['kyc.status'] = kycStatus;
    if (search) {
      const regex = new RegExp(search, 'i');
      filter.$or = [
        { businessName: regex },
        { merchantId: regex },
      ];
    }

    const [merchants, total] = await Promise.all([
      Merchant.find(filter)
        .populate('userId', 'name email phone isActive lastLogin')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        // Exclude sensitive fields and heavy base64 KYC documents from list view
        .select('-bankDetails.accountNumber -kyc.aadharNumber -kyc.panDoc -kyc.aadharDoc -kyc.gstDoc'),
      Merchant.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: merchants,
      pagination: buildPaginationMeta(total, page, limit),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/merchants/:merchantId
 * Get full merchant detail
 */
const getMerchantDetail = async (req, res, next) => {
  try {
    const merchant = await Merchant.findOne({ merchantId: req.params.merchantId })
      .populate('userId', 'name email phone isActive isEmailVerified lastLogin createdAt')
      .populate('onboardedBy', 'name email')
      // KYC documents (base64) served separately via GET /kyc/documents to keep this response lean
      .select('-kyc.panDoc -kyc.aadharDoc -kyc.gstDoc');

    if (!merchant) {
      return errorResponse(res, 'Merchant not found', 404);
    }

    // Get commission config for this merchant
    const commissionConfig = await commissionService.getEffectiveRate(merchant._id);

    return successResponse(res, { merchant, commissionConfig });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/admin/merchants/:merchantId/status
 * Activate / suspend / close a merchant
 */
const updateMerchantStatus = async (req, res, next) => {
  try {
    const { status, reason } = req.body;

    const merchant = await Merchant.findOneAndUpdate(
      { merchantId: req.params.merchantId },
      { status, notes: reason || undefined },
      { new: true }
    ).populate('userId', 'name email');

    if (!merchant) {
      return errorResponse(res, 'Merchant not found', 404);
    }

    // Also toggle user account active flag
    const isActive = status === 'active';
    await User.findByIdAndUpdate(merchant.userId._id, { isActive });

    logger.info(
      `Admin ${req.user._id} set merchant ${merchant.merchantId} status to ${status}`
    );

    return successResponse(res, { merchantId: merchant.merchantId, status }, `Merchant ${status}`);
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/admin/merchants/:merchantId/kyc
 * Move KYC through its review lifecycle:
 *   under_review — admin has started reviewing (blocks merchant re-submission)
 *   approve      — KYC accepted, merchant auto-activated if still pending
 *   reject       — KYC rejected with a reason (merchant can re-submit)
 */
const updateKYCStatus = async (req, res, next) => {
  try {
    const { action, rejectionReason } = req.body;

    const merchant = await Merchant.findOne({ merchantId: req.params.merchantId });
    if (!merchant) {
      return errorResponse(res, 'Merchant not found', 404);
    }

    const currentStatus = merchant.kyc?.status;

    // Validate transition — only actionable from submitted or under_review
    if (!['submitted', 'under_review'].includes(currentStatus)) {
      return errorResponse(
        res,
        `KYC is currently '${currentStatus}' and cannot be actioned`,
        400
      );
    }

    // under_review: admin marks KYC as being actively reviewed
    if (action === 'under_review') {
      if (currentStatus !== 'submitted') {
        return errorResponse(res, 'KYC must be in submitted status to mark as under_review', 400);
      }
      merchant.kyc.status = 'under_review';
      await merchant.save();

      logger.info(`Admin ${req.user._id} marked KYC under_review for merchant ${merchant.merchantId}`);
      return successResponse(
        res,
        { merchantId: merchant.merchantId, kycStatus: merchant.kyc.status },
        'KYC marked as under review'
      );
    }

    // approve / reject
    merchant.kyc.status          = action === 'approve' ? 'approved' : 'rejected';
    merchant.kyc.rejectionReason = action === 'reject' ? rejectionReason : undefined;
    merchant.kyc.verifiedAt      = action === 'approve' ? new Date() : undefined;
    merchant.kyc.verifiedBy      = req.user._id;

    // Auto-activate merchant on KYC approval if still pending
    if (action === 'approve' && merchant.status === 'pending') {
      merchant.status = 'active';
      await User.findByIdAndUpdate(merchant.userId, { isActive: true });
    }

    await merchant.save();

    logger.info(`Admin ${req.user._id} ${action}d KYC for merchant ${merchant.merchantId}`);

    // ── Auto-trigger Razorpay linked account creation on KYC approval ──────
    // Runs non-blocking (setImmediate) so it doesn't delay the admin response.
    // Only triggered if:
    //   1. Action is approve
    //   2. Merchant does NOT already have a linked Razorpay account
    //   3. Merchant has a PAN number in KYC (required by Razorpay)
    if (action === 'approve' && !merchant.razorpayLinkedAccountId && merchant.kyc?.panNumber) {
      setImmediate(async () => {
        try {
          const partnerService = require('../services/partnerService');

          // Reload with user populated for email/phone
          const freshMerchant = await Merchant.findById(merchant._id).populate('userId', 'email phone name');

          await freshMerchant.populate('userId', 'email phone name');

          // Step 1+2: Create linked account + stakeholder
          await partnerService.createLinkedAccount(freshMerchant, {
            contactName:     freshMerchant.userId?.name   || freshMerchant.businessName,
            contactPhone:    freshMerchant.userId?.phone,
            contactEmail:    freshMerchant.userId?.email,
            panNumber:       freshMerchant.kyc?.panNumber,
            gstNumber:       freshMerchant.kyc?.gstNumber,
            businessType:    freshMerchant.kyc?.businessType,
            businessAddress: freshMerchant.businessAddress,
          });

          // Reload after createLinkedAccount saved razorpayLinkedAccountId
          const afterAccount = await Merchant.findById(merchant._id);

          await partnerService.createStakeholder(afterAccount, {
            name:     freshMerchant.userId?.name || freshMerchant.businessName,
            email:    freshMerchant.userId?.email,
            phone:    freshMerchant.userId?.phone,
            panNumber: freshMerchant.kyc?.panNumber,
            percentageOwnership: 100,
            address: freshMerchant.businessAddress,
          });

          logger.info(`Auto Razorpay onboarding completed for merchant ${merchant.merchantId}`);
        } catch (rzpErr) {
          // Non-fatal — admin can manually trigger onboarding from merchant detail page
          logger.error(`Auto Razorpay onboarding failed for ${merchant.merchantId}: ${rzpErr.message}`);
        }
      });
    }

    return successResponse(
      res,
      {
        merchantId:     merchant.merchantId,
        kycStatus:      merchant.kyc.status,
        merchantStatus: merchant.status,
      },
      `KYC ${action}d successfully`
    );
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/merchants/:merchantId/settle
 * Manually trigger settlement for a merchant
 */
const manualSettle = async (req, res, next) => {
  try {
    const merchant = await Merchant.findOne({ merchantId: req.params.merchantId });
    if (!merchant) {
      return errorResponse(res, 'Merchant not found', 404);
    }

    const settlement = await settlementService.manualSettle(merchant._id, req.user._id);

    if (!settlement) {
      return errorResponse(res, 'No unsettled transactions or amount below minimum threshold', 400);
    }

    return successResponse(
      res,
      {
        settlementRef: settlement.settlementRef,
        netAmount: settlement.netAmount,
        status: settlement.status,
        transactionCount: settlement.transactionCount,
      },
      'Manual settlement initiated'
    );
  } catch (error) {
    next(error);
  }
};

// ─── Transaction Management ───────────────────────────────────────────────────

/**
 * GET /api/admin/transactions
 * All transactions across all merchants
 */
const listAllTransactions = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPaginationParams(req.query);
    const { status, merchantId, startDate, endDate, paymentMethod } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (paymentMethod) filter.paymentMethod = paymentMethod;
    if (merchantId) {
      const m = await Merchant.findOne({ merchantId });
      if (m) filter.merchantId = m._id;
    }
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const [transactions, total] = await Promise.all([
      Transaction.find(filter)
        .populate('merchantId', 'merchantId businessName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-webhookData'),
      Transaction.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: transactions,
      pagination: buildPaginationMeta(total, page, limit),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/transactions/:orderId
 */
const getTransactionDetail = async (req, res, next) => {
  try {
    const tx = await Transaction.findOne({ orderId: req.params.orderId })
      .populate('merchantId', 'merchantId businessName')
      .populate('settlementId', 'settlementRef status netAmount');

    if (!tx) {
      return errorResponse(res, 'Transaction not found', 404);
    }
    return successResponse(res, tx);
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/admin/transactions/:orderId/status
 * Manually update transaction status (e.g., pending -> success)
 * Used when payment gateway webhook fails or manual verification is needed
 */
const updateTransactionStatus = async (req, res, next) => {
  try {
    const { status, paymentMethod, upiTransactionId, failureReason, notes } = req.body;

    // Validate status
    const validStatuses = ['success', 'failed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return errorResponse(
        res,
        `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        400
      );
    }

    // Find transaction
    const tx = await Transaction.findOne({ orderId: req.params.orderId })
      .populate('merchantId', 'merchantId businessName');

    if (!tx) {
      return errorResponse(res, 'Transaction not found', 404);
    }

    // Prevent updating already successful/refunded transactions
    if (tx.status === 'success' && status !== 'success') {
      return errorResponse(res, 'Cannot modify successful transaction', 400);
    }
    if (tx.status === 'refunded') {
      return errorResponse(res, 'Cannot modify refunded transaction', 400);
    }

    // Already in the same status
    if (tx.status === status) {
      return errorResponse(res, `Transaction is already marked as ${status}`, 400);
    }

    const oldStatus = tx.status;

    // Update transaction fields
    tx.status = status;
    
    if (status === 'success') {
      tx.paymentTime = tx.paymentTime || new Date();
      if (paymentMethod) tx.paymentMethod = paymentMethod;
      if (upiTransactionId) tx.upiTransactionId = upiTransactionId;
      tx.failureReason = undefined; // Clear any previous failure reason
    } else if (status === 'failed' || status === 'cancelled') {
      tx.failureReason = failureReason || `Manually marked as ${status} by admin`;
    }

    await tx.save();

    // Audit log
    logger.info(
      `Admin ${req.user._id} manually updated transaction ${tx.orderId} from ${oldStatus} to ${status}. ` +
      `Merchant: ${tx.merchantId.merchantId}. Notes: ${notes || 'N/A'}`
    );

    // If marking as success, update merchant balance and create commission ledger entry
    if (status === 'success' && oldStatus !== 'success') {
      await Merchant.findByIdAndUpdate(tx.merchantId._id, {
        $inc: { 
          totalRevenue: tx.amount,
          availableBalance: tx.settlementAmount,
          pendingSettlement: tx.settlementAmount,  // Add to pending settlement
          totalCommission: tx.commissionAmount
        },
        lastTransactionDate: new Date(),
      });

      // Create commission ledger entry
      const { CommissionLedger } = require('../models/Commission');
      await CommissionLedger.create({
        transactionId: tx._id,
        merchantId: tx.merchantId._id,
        transactionAmount: tx.amount,
        commissionRate: tx.commissionRate,
        flatFee: 0,
        commissionAmount: tx.commissionAmount,
        netSettlementAmount: tx.settlementAmount,
        status: 'pending',
      });

      logger.info(
        `Updated merchant ${tx.merchantId.merchantId} balance. ` +
        `Settlement amount: ₹${tx.settlementAmount}, Commission: ₹${tx.commissionAmount}`
      );
    }

    return successResponse(
      res,
      {
        orderId: tx.orderId,
        status: tx.status,
        amount: tx.amount,
        merchantId: tx.merchantId.merchantId,
        businessName: tx.merchantId.businessName,
        updatedBy: req.user.email,
        updatedAt: tx.updatedAt,
      },
      `Transaction status updated to ${status}`
    );
  } catch (error) {
    next(error);
  }
};

// Validation for transaction status update
const transactionStatusValidation = [
  body('status')
    .isIn(['success', 'failed', 'cancelled'])
    .withMessage('Status must be success, failed, or cancelled'),
  body('paymentMethod')
    .optional()
    .isIn(['upi', 'card', 'netbanking', 'wallet', 'emi'])
    .withMessage('Invalid payment method'),
  body('upiTransactionId').optional().trim().isLength({ max: 100 }),
  body('failureReason').optional().trim().isLength({ max: 300 }),
  body('notes').optional().trim().isLength({ max: 500 }),
];

// ─── Settlement Management ────────────────────────────────────────────────────

/**
 * GET /api/admin/settlements
 */
const listAllSettlements = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPaginationParams(req.query);
    const { status, merchantId, startDate, endDate } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }
    if (merchantId) {
      const m = await Merchant.findOne({ merchantId });
      if (m) filter.merchantId = m._id;
    }

    const [settlements, total] = await Promise.all([
      Settlement.find(filter)
        .populate('merchantId', 'merchantId businessName')
        .populate('initiatedBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-transactions -payoutResponse'),
      Settlement.countDocuments(filter),
    ]);

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
 * GET /api/admin/settlements/:settlementRef
 */
const getSettlementDetail = async (req, res, next) => {
  try {
    const settlement = await settlementService.getSettlementDetail(req.params.settlementRef);
    return successResponse(res, settlement);
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/admin/settlements/:settlementRef/status
 * One-click settlement status update (approve/reject after manual bank transfer)
 */
const updateSettlementStatus = async (req, res, next) => {
  try {
    const { status, payoutReferenceId, payoutMode, failureReason } = req.body;

    if (!status) {
      return errorResponse(res, 'Status is required', 400);
    }

    const settlement = await settlementService.updateSettlementStatus(
      req.params.settlementRef,
      { status, payoutReferenceId, payoutMode, failureReason },
      req.user._id
    );

    return successResponse(
      res,
      {
        settlementRef: settlement.settlementRef,
        status: settlement.status,
        netAmount: settlement.netAmount,
        payoutReferenceId: settlement.payoutReferenceId,
        completedAt: settlement.completedAt,
      },
      `Settlement ${status === 'success' ? 'approved' : status === 'failed' ? 'rejected' : 'updated'} successfully`
    );
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/settlements/:settlementRef/transfer-details
 * Get formatted bank transfer details for easy copy-paste into bank portal
 */
const getSettlementTransferDetails = async (req, res, next) => {
  try {
    const details = await settlementService.getSettlementTransferDetails(
      req.params.settlementRef
    );
    return successResponse(res, details);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/settlements/bulk-approve
 * Bulk approve multiple settlements at once
 */
const bulkApproveSettlements = async (req, res, next) => {
  try {
    const { settlementRefs, payoutMode, payoutReferenceIdPrefix } = req.body;

    if (!settlementRefs || !Array.isArray(settlementRefs) || settlementRefs.length === 0) {
      return errorResponse(res, 'settlementRefs array is required', 400);
    }

    const results = await settlementService.bulkApproveSettlements(
      settlementRefs,
      { payoutMode, payoutReferenceIdPrefix },
      req.user._id
    );

    return successResponse(
      res,
      results,
      `Bulk approval completed: ${results.success.length} succeeded, ${results.failed.length} failed`
    );
  } catch (error) {
    next(error);
  }
};

// ─── Commission Config ────────────────────────────────────────────────────────

/**
 * GET /api/admin/commission/configs
 */
const listCommissionConfigs = async (req, res, next) => {
  try {
    const configs = await commissionService.listCommissionConfigs();
    return successResponse(res, configs);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/commission/global
 * Set / update global commission rate
 */
const setGlobalCommission = async (req, res, next) => {
  try {
    const { rate, flatFee, minCommission, maxCommission, description } = req.body;
    const config = await commissionService.setGlobalCommission({
      rate,
      flatFee,
      minCommission,
      maxCommission,
      description,
      adminId: req.user._id,
    });
    return successResponse(res, config, `Global commission set to ${rate}%`, 201);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/commission/merchant/:merchantId
 * Set merchant-specific commission override
 */
const setMerchantCommission = async (req, res, next) => {
  try {
    const merchant = await Merchant.findOne({ merchantId: req.params.merchantId });
    if (!merchant) {
      return errorResponse(res, 'Merchant not found', 404);
    }

    const { rate, flatFee, description } = req.body;
    const config = await commissionService.setMerchantCommission(merchant._id, {
      rate,
      flatFee,
      description,
      adminId: req.user._id,
    });
    return successResponse(res, config, `Commission for ${merchant.merchantId} set to ${rate}%`, 201);
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/admin/commission/merchant/:merchantId
 * Remove merchant-specific override (falls back to global)
 */
const removeMerchantCommission = async (req, res, next) => {
  try {
    const merchant = await Merchant.findOne({ merchantId: req.params.merchantId });
    if (!merchant) {
      return errorResponse(res, 'Merchant not found', 404);
    }

    await commissionService.removeMerchantCommissionOverride(merchant._id, req.user._id);
    return successResponse(res, {}, 'Merchant commission override removed');
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/commission/merchant/:merchantId
 * Get current effective commission rate for a specific merchant
 */
const getMerchantCommission = async (req, res, next) => {
  try {
    const merchant = await Merchant.findOne({ merchantId: req.params.merchantId })
      .select('merchantId businessName commissionRate');
    if (!merchant) {
      return errorResponse(res, 'Merchant not found', 404);
    }

    const config = await commissionService.getEffectiveRate(merchant._id);

    // Check if merchant has a custom override
    const { CommissionConfig } = require('../models/Commission');
    const hasOverride = await CommissionConfig.exists({
      merchantId: merchant._id,
      isActive: true,
    });

    return successResponse(res, {
      merchantId:   merchant.merchantId,
      businessName: merchant.businessName,
      effectiveRate: config.rate,
      flatFee:      config.flatFee || 0,
      minCommission: config.minCommission || 0,
      maxCommission: config.maxCommission || null,
      hasCustomOverride: !!hasOverride,
      source: hasOverride ? 'merchant_override' : 'global_default',
    });
  } catch (error) {
    next(error);
  }
};

// ─── Reports ──────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/reports/transactions
 */
const transactionReport = async (req, res, next) => {
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
const commissionReport = async (req, res, next) => {
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
const settlementReport = async (req, res, next) => {
  try {
    const report = await reportingService.getAdminSettlementReport(req.query);
    return successResponse(res, report);
  } catch (error) {
    next(error);
  }
};

// ─── User Management ──────────────────────────────────────────────────────────

/**
 * GET /api/admin/users
 */
const listUsers = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPaginationParams(req.query);
    const { role, isActive, search } = req.query;

    const filter = {};
    if (role) filter.role = role;
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (search) {
      const regex = new RegExp(search, 'i');
      filter.$or = [{ name: regex }, { email: regex }, { phone: regex }];
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-password -refreshToken -passwordResetToken'),
      User.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: users,
      pagination: buildPaginationMeta(total, page, limit),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/seed
 * Create default admin user — only usable when no admin exists yet
 */
// ─── Admin Bank Accounts ─────────────────────────────────────────────────────

/**
 * GET /api/admin/bank-accounts
 */
const getBankAccounts = async (req, res, next) => {
  try {
    const adminUser = await User.findById(req.user._id);
    if (!adminUser) return errorResponse(res, 'Admin user not found', 404);

    return successResponse(res, adminUser.bankAccounts || []);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/bank-accounts
 */
const addBankAccount = async (req, res, next) => {
  try {
    const adminUser = await User.findById(req.user._id);
    if (!adminUser) return errorResponse(res, 'Admin user not found', 404);

    const bankData = req.body;
    if (!bankData.accountHolderName || !bankData.accountNumber || !bankData.ifscCode) {
      return errorResponse(res, 'Account holder name, number, and IFSC code are required', 400);
    }

    const axios = require('axios');
    let verifiedBankName = bankData.bankName || 'Unknown Bank';
    try {
      const ifscRes = await axios.get(`https://ifsc.razorpay.com/${bankData.ifscCode.toUpperCase()}`, { timeout: 5000 });
      if (ifscRes.status === 200 && ifscRes.data) {
        verifiedBankName = ifscRes.data.BANK || bankData.bankName || 'Unknown Bank';
      }
    } catch (err) {
      if (err.response && err.response.status === 404) {
        return errorResponse(res, 'Invalid IFSC code. Please check and try again.', 400);
      }
      logger.warn(`Razorpay IFSC lookup failed for ${bankData.ifscCode}: ${err.message}`);
    }

    const isPrimary = !adminUser.bankAccounts || adminUser.bankAccounts.length === 0;

    const newAccount = {
      accountHolderName: bankData.accountHolderName,
      accountNumber: bankData.accountNumber,
      ifscCode: bankData.ifscCode.toUpperCase(),
      bankName: verifiedBankName,
      accountType: bankData.accountType || 'current',
      isPrimary,
      isVerified: false,
    };

    adminUser.bankAccounts.push(newAccount);
    await adminUser.save();

    return successResponse(res, adminUser.bankAccounts, 'Bank account added successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/bank-accounts/:id/primary
 */
const setPrimaryBankAccount = async (req, res, next) => {
  try {
    const adminUser = await User.findById(req.user._id);
    if (!adminUser) return errorResponse(res, 'Admin user not found', 404);

    const bankAccountId = req.params.id;
    let found = false;
    adminUser.bankAccounts.forEach((acc) => {
      if (acc._id.toString() === bankAccountId.toString()) {
        acc.isPrimary = true;
        found = true;
      } else {
        acc.isPrimary = false;
      }
    });

    if (!found) {
      return errorResponse(res, 'Bank account not found', 404);
    }

    await adminUser.save();
    return successResponse(res, adminUser.bankAccounts, 'Primary bank account updated');
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/admin/bank-accounts/:id
 */
const deleteBankAccount = async (req, res, next) => {
  try {
    const adminUser = await User.findById(req.user._id);
    if (!adminUser) return errorResponse(res, 'Admin user not found', 404);

    const bankAccountId = req.params.id;
    const acc = adminUser.bankAccounts.id(bankAccountId);
    if (!acc) {
      return errorResponse(res, 'Bank account not found', 404);
    }

    if (acc.isPrimary && adminUser.bankAccounts.length > 1) {
      return errorResponse(res, 'Cannot delete primary bank account. Set another account as primary first.', 400);
    }

    adminUser.bankAccounts.pull(bankAccountId);
    await adminUser.save();

    return successResponse(res, adminUser.bankAccounts, 'Bank account deleted successfully');
  } catch (error) {
    next(error);
  }
};

// ─── Admin Commission Settlement ─────────────────────────────────────────────

/**
 * GET /api/admin/commission/balance
 */
const getCommissionBalance = async (req, res, next) => {
  try {
    const balance = await settlementService.getAdminCommissionBalance();
    return successResponse(res, balance);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/commission/settle
 */
const settleCommission = async (req, res, next) => {
  try {
    const { bankAccountId } = req.body;
    if (!bankAccountId) {
      return errorResponse(res, 'Bank account ID is required', 400);
    }

    const settlement = await settlementService.settleAdminCommissions(req.user._id, bankAccountId);
    return successResponse(res, settlement, 'Admin commission settlement initiated successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/verify-ifsc
 */
const verifyIFSC = async (req, res, next) => {
  try {
    const { ifsc } = req.query;
    if (!ifsc) {
      return errorResponse(res, 'IFSC code is required', 400);
    }
    
    const axios = require('axios');
    try {
      const ifscRes = await axios.get(`https://ifsc.razorpay.com/${ifsc.toUpperCase()}`, { timeout: 5000 });
      if (ifscRes.status === 200 && ifscRes.data) {
        return successResponse(res, {
          isValid: true,
          bankName: ifscRes.data.BANK,
          branch: ifscRes.data.BRANCH,
          city: ifscRes.data.CITY,
          state: ifscRes.data.STATE,
        }, 'IFSC verified');
      }
    } catch (err) {
      if (err.response && err.response.status === 404) {
        return errorResponse(res, 'Invalid IFSC code', 404);
      }
      return errorResponse(res, 'IFSC verification service unavailable', 500);
    }
    return successResponse(res, { isValid: false });
  } catch (error) {
    next(error);
  }
};

const seedAdmin = async (req, res, next) => {
  try {
    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
      return errorResponse(res, 'Admin user already exists', 409);
    }

    const admin = await User.create({
      name: 'Super Admin',
      email: process.env.ADMIN_EMAIL || 'admin@issmerchant.com',
      phone: '9000000000',
      password: process.env.ADMIN_PASSWORD || 'Admin@123456',
      role: 'admin',
      isActive: true,
      isEmailVerified: true,
    });

    logger.info(`Admin user seeded: ${admin.email}`);
    return successResponse(
      res,
      { email: admin.email, role: admin.role },
      'Admin user created. Change the password immediately.',
      201
    );
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/merchants/:merchantId/kyc/documents
 * Admin-only: serve KYC documents for a specific merchant.
 *
 * Documents are stored as base64 data URIs in MongoDB (kyc.panDoc, aadharDoc, gstDoc).
 * This endpoint is the ONLY place they are exposed — they are excluded from all
 * other merchant queries via .select('-kyc.panDoc -kyc.aadharDoc -kyc.gstDoc').
 *
 * Returns metadata + base64 data URIs. Admin can render or download from frontend.
 */
const getKYCDocuments = async (req, res, next) => {
  try {
    // Explicitly select only the document fields — never included in other queries
    const merchant = await Merchant.findOne({ merchantId: req.params.merchantId })
      .select('merchantId kyc.status kyc.panDoc kyc.aadharDoc kyc.gstDoc kyc.panNumber kyc.businessType');

    if (!merchant) {
      return errorResponse(res, 'Merchant not found', 404);
    }

    const kyc = merchant.kyc || {};

    return successResponse(res, {
      merchantId:   merchant.merchantId,
      kycStatus:    kyc.status,
      panNumber:    kyc.panNumber,
      businessType: kyc.businessType,
      documents: {
        panDoc:    kyc.panDoc    ? { hasFile: true,  dataUri: kyc.panDoc    } : { hasFile: false },
        aadharDoc: kyc.aadharDoc ? { hasFile: true,  dataUri: kyc.aadharDoc } : { hasFile: false },
        gstDoc:    kyc.gstDoc    ? { hasFile: true,  dataUri: kyc.gstDoc    } : { hasFile: false },
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  // Validation
  globalCommissionValidation,
  merchantCommissionValidation,
  kycActionValidation,
  merchantStatusValidation,
  bankValidation,
  transactionStatusValidation,
  // Dashboard
  getDashboard,
  // Merchants
  listMerchants,
  getMerchantDetail,
  updateMerchantStatus,
  updateKYCStatus,
  getKYCDocuments,
  manualSettle,
  // Transactions
  listAllTransactions,
  getTransactionDetail,
  updateTransactionStatus,
  // Settlements
  listAllSettlements,
  getSettlementDetail,
  updateSettlementStatus,
  getSettlementTransferDetails,
  bulkApproveSettlements,
  // Commission
  listCommissionConfigs,
  setGlobalCommission,
  setMerchantCommission,
  getMerchantCommission,
  removeMerchantCommission,
  // Reports
  transactionReport,
  commissionReport,
  settlementReport,
  // Users
  listUsers,
  seedAdmin,
  // Admin Bank Accounts
  getBankAccounts,
  addBankAccount,
  setPrimaryBankAccount,
  deleteBankAccount,
  verifyIFSC,
  // Admin Commission Settlement
  getCommissionBalance,
  settleCommission,
};
