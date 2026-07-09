const Settlement = require('../models/Settlement');
const Transaction = require('../models/Transaction');
const Merchant = require('../models/Merchant');
const { generatePayoutRef } = require('../utils/helpers');
const commissionService = require('./commissionService');
const logger = require('../utils/logger');

// Minimum settlement threshold (₹) - from environment or default to 100
const MIN_SETTLEMENT_AMOUNT = parseFloat(process.env.MIN_SETTLEMENT_AMOUNT || '100');

/**
 * List settlements for a merchant (paginated, optional status filter)
 */
const getMerchantSettlements = async (merchantId, { page = 1, limit = 20, status } = {}) => {
  const skip = (page - 1) * limit;
  const filter = { merchantId };
  if (status) filter.status = status;

  const [settlements, total] = await Promise.all([
    Settlement.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Settlement.countDocuments(filter),
  ]);
  return { settlements, total };
};

/**
 * Get a single settlement by ref — used by both merchant and admin.
 * Alias: getSettlementDetail (controller-facing name)
 */
const getSettlementDetail = async (settlementRef, merchantId = null) => {
  const filter = { settlementRef };
  if (merchantId) filter.merchantId = merchantId;

  const settlement = await Settlement.findOne(filter).populate(
    'transactions',
    'orderId amount commissionAmount settlementAmount paymentMethod status paymentTime'
  );

  if (!settlement) {
    const err = new Error('Settlement not found');
    err.statusCode = 404;
    throw err;
  }
  return settlement;
};

/**
 * Create a settlement record for a batch of transactions.
 * Transfers happen via Razorpay Route automatically (no manual payout).
 * This function creates the accounting record only.
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
    // Razorpay Route handles instant transfer; mark success immediately if linked
    status: merchant.isRazorpayLinked ? 'success' : 'pending',
    type: 'instant',
    payoutMode: merchant.isRazorpayLinked ? 'IMPS' : 'unknown',
    initiatedAt: new Date(),
    completedAt: merchant.isRazorpayLinked ? new Date() : null,
  });

  // Mark transactions settled
  await Transaction.updateMany(
    { _id: { $in: transactions.map((t) => t._id) } },
    { isSettled: true, settledAt: new Date(), settlementId: settlement._id }
  );

  // Record commission ledger entries
  await commissionService.recordCommissionLedger(transactions, settlement._id);

  // Update merchant running balance
  await Merchant.findByIdAndUpdate(merchantId, {
    $inc: {
      totalSettled: netAmount,
      pendingSettlement: -netAmount,
    },
  });

  logger.info(`Settlement record ${settlementRef} created: ₹${netAmount} for merchant ${merchant.merchantId}`);
  return settlement;
};

/**
 * Merchant-initiated (on-demand) settlement.
 * Collects all unsettled successful transactions, validates minimum threshold,
 * then creates a settlement record. No external payout call — settlement happens
 * via Razorpay Route which already ran at payment time, or admin handles manually.
 */
const manualMerchantSettlement = async (merchantId, bankAccountId) => {
  const merchant = await Merchant.findById(merchantId);
  if (!merchant) throw new Error('Merchant not found');

  // Resolve bank account from merchant's saved accounts
  const bankAccount = merchant.bankAccounts.id(bankAccountId);
  if (!bankAccount) {
    const err = new Error('Bank account not found');
    err.statusCode = 404;
    throw err;
  }

  // Gather all unsettled successful transactions (not already in a pending settlement)
  const transactions = await Transaction.find({
    merchantId,
    status: 'success',
    isSettled: false,
    settlementId: null, // Not already linked to another settlement
  });

  if (transactions.length === 0) {
    logger.info(`manualMerchantSettlement: no unsettled transactions for merchant ${merchantId}`);
    return null;
  }

  const netAmount = transactions.reduce((s, t) => s + t.settlementAmount, 0);

  // Enforce minimum threshold
  if (netAmount < MIN_SETTLEMENT_AMOUNT) {
    logger.info(`manualMerchantSettlement: ₹${netAmount} below threshold for merchant ${merchantId}`);
    return null;
  }

  const grossAmount = transactions.reduce((s, t) => s + t.amount, 0);
  const totalCommission = transactions.reduce((s, t) => s + t.commissionAmount, 0);
  const settlementRef = generatePayoutRef('SET');

  const settlement = await Settlement.create({
    settlementRef,
    merchantId,
    grossAmount,
    totalCommission,
    netAmount,
    transactions: transactions.map((t) => t._id),
    transactionCount: transactions.length,
    // Bank details snapshot at time of settlement
    bankAccountNumber: bankAccount.accountNumber,
    bankIfsc: bankAccount.ifscCode,
    bankName: bankAccount.bankName,
    accountHolderName: bankAccount.accountHolderName,
    // No external payout system — status stays pending until admin processes
    status: 'pending',
    type: 'manual',
    payoutMode: 'unknown',
    initiatedAt: new Date(),
  });

  // Link transactions to settlement (but keep isSettled=false until admin approves)
  await Transaction.updateMany(
    { _id: { $in: transactions.map((t) => t._id) } },
    { settlementId: settlement._id }
  );

  // Record commission ledger entries
  await commissionService.recordCommissionLedger(transactions, settlement._id);

  logger.info(
    `Manual settlement ${settlementRef} requested: ₹${netAmount} for merchant ${merchant.merchantId}, bank: ${bankAccount.accountNumber}`
  );
  return settlement;
};

/**
 * Admin-triggered settlement for a specific merchant.
 * Admin doesn't need to supply a bankAccountId — we use the merchant's primary
 * bank account. If merchant has no bank accounts on file the settlement is still
 * created (pending) so admin can track and process offline.
 *
 * Called by: POST /api/admin/merchants/:merchantId/settle
 */
const manualSettle = async (merchantId, adminId) => {
  const merchant = await Merchant.findById(merchantId);
  if (!merchant) throw new Error('Merchant not found');

  // Gather all unsettled successful transactions
  const transactions = await Transaction.find({
    merchantId,
    status: 'success',
    isSettled: false,
  });

  if (transactions.length === 0) {
    logger.info(`manualSettle: no unsettled transactions for merchant ${merchantId}`);
    return null;
  }

  const grossAmount   = transactions.reduce((s, t) => s + t.amount, 0);
  const totalCommission = transactions.reduce((s, t) => s + t.commissionAmount, 0);
  const netAmount     = transactions.reduce((s, t) => s + t.settlementAmount, 0);

  if (netAmount < MIN_SETTLEMENT_AMOUNT) {
    logger.info(`manualSettle: ₹${netAmount} below threshold for merchant ${merchantId}`);
    return null;
  }

  // Snapshot primary bank account if available
  const primaryBank = merchant.bankAccounts?.find((a) => a.isPrimary) || merchant.bankAccounts?.[0];

  const settlementRef = generatePayoutRef('SET');

  const settlement = await Settlement.create({
    settlementRef,
    merchantId,
    grossAmount,
    totalCommission,
    netAmount,
    transactions: transactions.map((t) => t._id),
    transactionCount: transactions.length,
    // Bank snapshot (may be empty if merchant hasn't added accounts yet)
    bankAccountNumber: primaryBank?.accountNumber || null,
    bankIfsc:          primaryBank?.ifscCode       || null,
    bankName:          primaryBank?.bankName        || null,
    accountHolderName: primaryBank?.accountHolderName || null,
    status:      'pending',
    type:        'manual',
    payoutMode:  'unknown',
    initiatedAt: new Date(),
    initiatedBy: adminId,
  });

  // Mark transactions settled
  await Transaction.updateMany(
    { _id: { $in: transactions.map((t) => t._id) } },
    { isSettled: true, settledAt: new Date(), settlementId: settlement._id }
  );

  // Record commission ledger entries
  await commissionService.recordCommissionLedger(transactions, settlement._id);

  // Update merchant running balance
  await Merchant.findByIdAndUpdate(merchantId, {
    $inc: {
      totalSettled:      netAmount,
      pendingSettlement: -netAmount,
    },
  });

  logger.info(
    `Admin ${adminId} triggered manual settlement ${settlementRef}: ₹${netAmount} for merchant ${merchant.merchantId}`
  );
  return settlement;
};

/**
 * Calculate admin's total earned commission that has NOT yet been paid out
 * to the admin's own bank account.
 *
 * Logic:
 *   Total collected commission  = sum of commissionAmount across all CommissionLedger entries
 *   Total already paid out      = sum of netAmount in admin Settlement records (isAdminSettlement: true, status: 'success')
 *   Available balance           = collected - paid out
 *
 * Called by: GET /api/admin/commission/balance
 */
const getAdminCommissionBalance = async () => {
  const { CommissionLedger } = require('../models/Commission');

  const [collectedResult, paidOutResult] = await Promise.all([
    // Total commission ever collected across all merchant settlements
    // Include both 'pending' and 'settled' status as they both represent earned commission
    CommissionLedger.aggregate([
      { $match: { status: { $in: ['pending', 'settled'] } } },
      {
        $group: {
          _id: null,
          totalCollected:     { $sum: '$commissionAmount' },
          totalTransactions:  { $sum: 1 },
          totalVolume:        { $sum: '$transactionAmount' },
        },
      },
    ]),

    // Total commission already paid out to admin bank
    Settlement.aggregate([
      { $match: { isAdminSettlement: true, status: 'success' } },
      {
        $group: {
          _id: null,
          totalPaidOut: { $sum: '$netAmount' },
          count:        { $sum: 1 },
        },
      },
    ]),
  ]);

  const totalCollected    = collectedResult[0]?.totalCollected    || 0;
  const totalTransactions = collectedResult[0]?.totalTransactions || 0;
  const totalVolume       = collectedResult[0]?.totalVolume       || 0;
  const totalPaidOut      = paidOutResult[0]?.totalPaidOut        || 0;
  const payoutCount       = paidOutResult[0]?.count               || 0;

  return {
    totalCollected,       // All-time commission earned
    totalPaidOut,         // Already transferred to admin bank
    availableBalance: totalCollected - totalPaidOut,  // Ready to withdraw
    totalTransactions,    // Number of transactions that generated commission
    totalVolume,          // Gross transaction volume
    payoutCount,          // Number of admin payout settlements so far
  };
};

/**
 * Admin settles their accumulated commission to their own bank account.
 * Creates an admin Settlement record (isAdminSettlement: true).
 * No external payout API — admin processes the transfer manually.
 *
 * Called by: POST /api/admin/commission/settle
 */
const settleAdminCommissions = async (adminId, bankAccountId) => {
  const User = require('../models/User');

  const adminUser = await User.findById(adminId);
  if (!adminUser) throw new Error('Admin user not found');

  // Resolve admin's bank account
  const bankAccount = adminUser.bankAccounts?.id(bankAccountId);
  if (!bankAccount) {
    const err = new Error('Bank account not found');
    err.statusCode = 404;
    throw err;
  }

  // Calculate current available balance
  const { availableBalance } = await getAdminCommissionBalance();

  if (availableBalance < MIN_SETTLEMENT_AMOUNT) {
    const err = new Error(
      `Available commission balance ₹${availableBalance.toFixed(2)} is below minimum threshold ₹${MIN_SETTLEMENT_AMOUNT}`
    );
    err.statusCode = 400;
    throw err;
  }

  const settlementRef = generatePayoutRef('ADMSET');

  const settlement = await Settlement.create({
    settlementRef,
    merchantId:        null,          // not a merchant settlement
    isAdminSettlement: true,
    adminId,
    grossAmount:       availableBalance,
    totalCommission:   0,             // admin keeps 100% of commission
    netAmount:         availableBalance,
    transactions:      [],
    transactionCount:  0,
    // Bank snapshot
    bankAccountNumber: bankAccount.accountNumber,
    bankIfsc:          bankAccount.ifscCode,
    bankName:          bankAccount.bankName,
    accountHolderName: bankAccount.accountHolderName,
    status:      'pending',   // admin processes transfer manually
    type:        'manual',
    payoutMode:  'unknown',
    initiatedAt: new Date(),
    initiatedBy: adminId,
  });

  logger.info(
    `Admin ${adminId} initiated commission settlement ${settlementRef}: ₹${availableBalance} → bank ${bankAccount.accountNumber}`
  );
  return settlement;
};

/**
 * Update settlement status (admin action).
 * Used for one-click approve/reject after manual bank transfer.
 *
 * @param {String} settlementRef - Settlement reference ID
 * @param {Object} updates - { status, payoutReferenceId, payoutMode, failureReason }
 * @param {String} adminId - Admin user ID for audit trail
 */
const updateSettlementStatus = async (settlementRef, updates, adminId) => {
  const settlement = await Settlement.findOne({ settlementRef });
  if (!settlement) {
    const err = new Error('Settlement not found');
    err.statusCode = 404;
    throw err;
  }

  // Only allow updates on pending/processing settlements
  if (!['pending', 'processing'].includes(settlement.status)) {
    const err = new Error(`Settlement is already ${settlement.status} and cannot be updated`);
    err.statusCode = 400;
    throw err;
  }

  const { status, payoutReferenceId, payoutMode, failureReason } = updates;

  // Validate status transition
  if (!['success', 'failed', 'processing'].includes(status)) {
    const err = new Error('Invalid status. Must be success, failed, or processing');
    err.statusCode = 400;
    throw err;
  }

  // Update settlement
  settlement.status = status;
  if (payoutReferenceId) settlement.payoutReferenceId = payoutReferenceId;
  if (payoutMode) settlement.payoutMode = payoutMode;
  if (failureReason) settlement.failureReason = failureReason;

  if (status === 'success') {
    settlement.completedAt = new Date();
    
    // Mark transactions as settled and update merchant balance
    await Transaction.updateMany(
      { _id: { $in: settlement.transactions } },
      { isSettled: true, settledAt: new Date() }
    );
    
    // Update merchant running balance (only if not already updated)
    if (!settlement.isBalanceUpdated) {
      await Merchant.findByIdAndUpdate(settlement.merchantId, {
        $inc: {
          totalSettled: settlement.netAmount,
          pendingSettlement: -settlement.netAmount,
        },
      });
      settlement.isBalanceUpdated = true;
    }
  }

  if (status === 'failed') {
    // Revert merchant balance on failure
    if (!settlement.isAdminSettlement && settlement.merchantId) {
      await Merchant.findByIdAndUpdate(settlement.merchantId, {
        $inc: {
          totalSettled: -settlement.netAmount,
          pendingSettlement: settlement.netAmount,
        },
      });

      // Mark transactions as unsettled again
      await Transaction.updateMany(
        { _id: { $in: settlement.transactions } },
        { isSettled: false, settledAt: null, settlementId: null }
      );

      // Update commission ledger status
      const { CommissionLedger } = require('../models/Commission');
      await CommissionLedger.updateMany(
        { settlementId: settlement._id },
        { status: 'reversed' }
      );
    }
  }

  await settlement.save();

  logger.info(
    `Admin ${adminId} updated settlement ${settlementRef} to ${status}${
      payoutReferenceId ? ` (UTR: ${payoutReferenceId})` : ''
    }`
  );

  return settlement;
};

/**
 * Get formatted bank transfer details for easy copy-paste.
 * Admin uses this to copy details into their bank portal.
 *
 * @param {String} settlementRef - Settlement reference ID
 */
const getSettlementTransferDetails = async (settlementRef) => {
  const settlement = await Settlement.findOne({ settlementRef })
    .populate('merchantId', 'merchantId businessName bankAccounts bankDetails businessPhone')
    .populate({
      path: 'merchantId',
      populate: {
        path: 'userId',
        select: 'phone'
      }
    });

  if (!settlement) {
    const err = new Error('Settlement not found');
    err.statusCode = 404;
    throw err;
  }

  // Format amount with 2 decimals
  const formattedAmount = settlement.netAmount.toFixed(2);

  // Build copy-paste text for admin convenience
  const copyText = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SETTLEMENT TRANSFER DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Settlement Ref: ${settlementRef}
Merchant: ${settlement.merchantId?.businessName || 'N/A'}
Merchant ID: ${settlement.merchantId?.merchantId || 'N/A'}

BANK DETAILS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Account Holder: ${settlement.accountHolderName || 'N/A'}
Account Number: ${settlement.bankAccountNumber || 'N/A'}
IFSC Code: ${settlement.bankIfsc || 'N/A'}
Bank Name: ${settlement.bankName || 'N/A'}

AMOUNT TO TRANSFER:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
₹${formattedAmount}

REFERENCE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Use "${settlementRef}" as payment reference
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `.trim();

  // Get merchant details for UPI/phone
  const merchant = await Merchant.findById(settlement.merchantId);
  const primaryBank = merchant?.bankAccounts?.find(a => a.isPrimary) || merchant?.bankAccounts?.[0];
  const phone = merchant?.userId?.phone || merchant?.businessPhone;

  return {
    settlementRef,
    merchantId: settlement.merchantId?.merchantId,
    merchantName: settlement.merchantId?.businessName,
    accountHolderName: settlement.accountHolderName,
    accountNumber: settlement.bankAccountNumber,
    ifscCode: settlement.bankIfsc,
    bankName: settlement.bankName,
    upiVpa: primaryBank?.upiVpa || merchant?.bankDetails?.upiVpa || null,  // UPI VPA
    phoneNumber: phone || null,  // Phone number for PhonePe
    amount: settlement.netAmount,
    formattedAmount: `₹${formattedAmount}`,
    grossAmount: settlement.grossAmount,
    totalCommission: settlement.totalCommission,
    transactionCount: settlement.transactionCount,
    status: settlement.status,
    initiatedAt: settlement.initiatedAt,
    copyText,
    // Quick transfer methods
    transferMethods: {
      upi: primaryBank?.upiVpa || merchant?.bankDetails?.upiVpa ? {
        vpa: primaryBank?.upiVpa || merchant?.bankDetails?.upiVpa,
        deepLink: `upi://pay?pa=${primaryBank?.upiVpa || merchant?.bankDetails?.upiVpa}&pn=${encodeURIComponent(settlement.accountHolderName || 'Merchant')}&am=${formattedAmount}&cu=INR&tn=${encodeURIComponent(`Settlement ${settlementRef}`)}`
      } : null,
      phonePe: phone ? {
        phone: phone,
        deepLink: `phonepe://pay?pa=${phone}@ybl&pn=${encodeURIComponent(settlement.accountHolderName || 'Merchant')}&am=${formattedAmount}&cu=INR`
      } : null,
      bank: {
        accountNumber: settlement.bankAccountNumber,
        ifscCode: settlement.bankIfsc,
        accountHolderName: settlement.accountHolderName,
        bankName: settlement.bankName
      }
    }
  };
};

/**
 * Bulk approve multiple settlements at once.
 * Admin provides UTR references and payout mode for all settlements.
 *
 * @param {Array<String>} settlementRefs - Array of settlement reference IDs
 * @param {Object} commonData - { payoutMode, payoutReferenceIdPrefix }
 * @param {String} adminId - Admin user ID for audit trail
 */
const bulkApproveSettlements = async (settlementRefs, commonData, adminId) => {
  if (!settlementRefs || settlementRefs.length === 0) {
    const err = new Error('Settlement references are required');
    err.statusCode = 400;
    throw err;
  }

  const { payoutMode, payoutReferenceIdPrefix } = commonData;

  const results = {
    success: [],
    failed: [],
    totalAmount: 0,
  };

  for (const settlementRef of settlementRefs) {
    try {
      const settlement = await Settlement.findOne({ settlementRef });

      if (!settlement) {
        results.failed.push({
          settlementRef,
          reason: 'Settlement not found',
        });
        continue;
      }

      if (!['pending', 'processing'].includes(settlement.status)) {
        results.failed.push({
          settlementRef,
          reason: `Settlement is already ${settlement.status}`,
        });
        continue;
      }

      // Generate unique UTR if prefix provided
      const payoutReferenceId = payoutReferenceIdPrefix
        ? `${payoutReferenceIdPrefix}_${settlementRef}`
        : undefined;

      // Update settlement
      settlement.status = 'success';
      settlement.completedAt = new Date();
      if (payoutMode) settlement.payoutMode = payoutMode;
      if (payoutReferenceId) settlement.payoutReferenceId = payoutReferenceId;

      await settlement.save();

      results.success.push({
        settlementRef,
        merchantId: settlement.merchantId,
        amount: settlement.netAmount,
      });
      results.totalAmount += settlement.netAmount;

      logger.info(`Bulk approved settlement ${settlementRef} by admin ${adminId}`);
    } catch (error) {
      results.failed.push({
        settlementRef,
        reason: error.message,
      });
      logger.error(`Bulk approve failed for ${settlementRef}: ${error.message}`);
    }
  }

  logger.info(
    `Admin ${adminId} bulk approved ${results.success.length}/${settlementRefs.length} settlements, total: ₹${results.totalAmount}`
  );

  return results;
};

module.exports = {
  getMerchantSettlements,
  getSettlementDetail,
  createSettlementRecord,
  manualMerchantSettlement,
  manualSettle,
  getAdminCommissionBalance,
  settleAdminCommissions,
  updateSettlementStatus,
  getSettlementTransferDetails,
  bulkApproveSettlements,
};
