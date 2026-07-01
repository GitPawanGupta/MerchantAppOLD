const mongoose = require('mongoose');
const Settlement = require('../models/Settlement');
const Transaction = require('../models/Transaction');
const Merchant = require('../models/Merchant');
const Payout = require('../models/Payout');
const User = require('../models/User');
const { CommissionLedger } = require('../models/Commission');
const { getPayoutClient } = require('../config/cashfree');
const { generatePayoutRef, calculateCommission } = require('../utils/helpers');
const commissionService = require('./commissionService');
const logger = require('../utils/logger');

/**
 * Register or update a Cashfree Payout beneficiary for a merchant.
 * Must be called after bank details are saved/verified.
 */
const ensureBeneficiary = async (merchant, bankAccount = null) => {
  const account = bankAccount || merchant.bankAccounts.find(a => a.isPrimary) || merchant.bankAccounts[0];
  if (!account) {
    throw new Error('Merchant has no bank details configured');
  }

  const payoutClient = await getPayoutClient();

  const beneficiaryId = account.isPrimary
    ? `MERBEN_${merchant._id.toString()}`
    : `MERBEN_ACC_${account._id.toString()}`;

  // Check if already exists
  try {
    const check = await payoutClient.get(
      `/payout/v1/getBeneficiary/${beneficiaryId}`
    );
    if (check.data?.status === 'SUCCESS') {
      // Already registered — update local record if needed
      if (account.cashfreeBeneficiaryId !== beneficiaryId) {
        account.cashfreeBeneficiaryId = beneficiaryId;
        await merchant.save();
      }
      return beneficiaryId;
    }
  } catch {
    // Not found — will create below
  }

  const payload = {
    beneId: beneficiaryId,
    name: account.accountHolderName,
    email: merchant.userId?.email || 'merchant@example.com',
    phone: merchant.userId?.phone || '9999999999',
    bankAccount: account.accountNumber,
    ifsc: account.ifscCode,
    address1: merchant.businessAddress?.street || 'India',
    city: merchant.businessAddress?.city || 'Mumbai',
    state: merchant.businessAddress?.state || 'Maharashtra',
    pincode: merchant.businessAddress?.pincode || '400001',
  };

  const res = await payoutClient.post('/payout/v1/addBeneficiary', payload);

  if (res.data?.status !== 'SUCCESS') {
    const msg = res.data?.message || 'Failed to register beneficiary';
    logger.error(`Cashfree beneficiary registration failed for ${merchant.merchantId}: ${msg}`);
    throw new Error(msg);
  }

  account.cashfreeBeneficiaryId = beneficiaryId;
  await merchant.save();

  logger.info(`Cashfree beneficiary registered for merchant ${merchant.merchantId} (Account: ${account.accountNumber})`);
  return beneficiaryId;
};

/**
 * Trigger instant settlement for a list of transaction IDs.
 * Called automatically after a successful payment webhook.
 */
const triggerInstantSettlement = async (merchantId, transactionIds, bankAccountId = null) => {
  const merchant = await Merchant.findById(merchantId).populate('userId', 'email phone');

  if (!merchant) throw new Error('Merchant not found');

  let bankAccount = null;
  if (bankAccountId) {
    bankAccount = merchant.bankAccounts.id(bankAccountId);
  } else {
    bankAccount = merchant.bankAccounts.find(a => a.isPrimary) || merchant.bankAccounts[0];
  }

  if (!bankAccount) {
    logger.warn(`Settlement skipped for ${merchantId}: no bank details`);
    return null;
  }

  // Only settle transactions that are successful and not yet settled
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

  // Compute totals
  const grossAmount = transactions.reduce((s, t) => s + t.amount, 0);
  const totalCommission = transactions.reduce((s, t) => s + t.commissionAmount, 0);
  const netAmount = transactions.reduce((s, t) => s + t.settlementAmount, 0);

  const minSettlement = parseFloat(process.env.MIN_SETTLEMENT_AMOUNT || '100');
  if (netAmount < minSettlement) {
    logger.info(`Settlement deferred for ${merchantId}: netAmount ₹${netAmount} < min ₹${minSettlement}`);
    return null;
  }

  const settlementRef = generatePayoutRef('SET');

  // Create settlement record (pending)
  const settlement = await Settlement.create({
    settlementRef,
    merchantId,
    grossAmount,
    totalCommission,
    netAmount,
    transactions: transactions.map((t) => t._id),
    transactionCount: transactions.length,
    bankAccountNumber: bankAccount.accountNumber,
    bankIfsc: bankAccount.ifscCode,
    bankName: bankAccount.bankName,
    accountHolderName: bankAccount.accountHolderName,
    status: 'processing',
    type: 'instant',
    initiatedAt: new Date(),
  });

  // Mark transactions as settled
  await Transaction.updateMany(
    { _id: { $in: transactions.map((t) => t._id) } },
    {
      isSettled: true,
      settledAt: new Date(),
      settlementId: settlement._id,
    }
  );

  // Record commission ledger entries
  await commissionService.recordCommissionLedger(transactions, settlement._id);

  // Execute payout via Cashfree
  try {
    await executePayout(merchant, settlement, bankAccount);
  } catch (payoutErr) {
    logger.error(`Payout execution failed for settlement ${settlementRef}: ${payoutErr.message}`);
    await Settlement.findByIdAndUpdate(settlement._id, {
      status: 'failed',
      failureReason: payoutErr.message,
    });
    // Revert merchant pending settlement
    await Merchant.findByIdAndUpdate(merchantId, {
      $inc: { pendingSettlement: netAmount },
    });
    throw payoutErr;
  }

  // Update merchant running totals
  await Merchant.findByIdAndUpdate(merchantId, {
    $inc: {
      totalSettled: netAmount,
      pendingSettlement: -netAmount,
    },
  });

  logger.info(
    `Settlement ${settlementRef} initiated: ₹${netAmount} for merchant ${merchant.merchantId}`
  );

  return settlement;
};

/**
 * Execute the actual Cashfree Payout transfer.
 * Skipped gracefully if Payout credentials are not yet configured.
 */
const executePayout = async (merchant, settlement, bankAccount = null) => {
  // Guard — skip if Cashfree Payout not approved/configured yet
  if (!process.env.CASHFREE_PAYOUT_CLIENT_ID || process.env.CASHFREE_PAYOUT_CLIENT_ID.includes('your_')) {
    logger.warn(`Cashfree Payout not configured — settlement ${settlement.settlementRef} queued as pending`);
    await Settlement.findByIdAndUpdate(settlement._id, {
      status: 'pending',
      failureReason: 'Payout not configured — awaiting Cashfree Payout approval',
    });
    return;
  }

  const payoutRef = generatePayoutRef('PAY');

  // Ensure beneficiary is registered
  const beneficiaryId = await ensureBeneficiary(merchant, bankAccount);

  const payoutClient = await getPayoutClient();

  const account = bankAccount || merchant.bankAccounts.find(a => a.isPrimary) || merchant.bankAccounts[0];

  const transferPayload = {
    beneId: beneficiaryId,
    amount: settlement.netAmount.toFixed(2),
    transferId: payoutRef,
    transferMode: 'IMPS',
    remarks: `Settlement ${settlement.settlementRef}`,
  };

  // Create payout record (pending)
  const payoutRecord = await Payout.create({
    settlementId: settlement._id,
    merchantId: merchant._id,
    payoutRef,
    beneficiaryId,
    amount: settlement.netAmount,
    transferMode: 'IMPS',
    accountNumber: account.accountNumber,
    ifsc: account.ifscCode,
    accountHolder: account.accountHolderName,
    status: 'processing',
    initiatedAt: new Date(),
    cashfreeRequest: transferPayload,
  });

  let cfResponse;
  try {
    const res = await payoutClient.post('/payout/v1/requestTransfer', transferPayload);
    cfResponse = res.data;
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    await Payout.findByIdAndUpdate(payoutRecord._id, {
      status: 'FAILED',
      failureReason: msg,
      cashfreeResponse: err.response?.data,
    });
    await Settlement.findByIdAndUpdate(settlement._id, {
      status: 'failed',
      failureReason: msg,
    });
    throw new Error(msg);
  }

  // Update payout record with Cashfree response
  const cfStatus = cfResponse?.status === 'SUCCESS' ? 'processing' : 'FAILED';
  await Payout.findByIdAndUpdate(payoutRecord._id, {
    transferId: cfResponse?.data?.referenceId || payoutRef,
    cashfreeStatus: cfResponse?.status,
    cashfreeResponse: cfResponse,
    status: cfStatus,
  });

  // Update settlement with transfer info
  await Settlement.findByIdAndUpdate(settlement._id, {
    payoutTransferId: cfResponse?.data?.referenceId || payoutRef,
    payoutMode: 'IMPS',
    status: cfStatus === 'processing' ? 'processing' : 'failed',
    payoutResponse: cfResponse,
  });

  logger.info(`Payout ${payoutRef} submitted to Cashfree for settlement ${settlement.settlementRef}`);
  return payoutRecord;
};

/**
 * Process Cashfree Payout webhook to update settlement/payout status
 */
const processPayoutWebhook = async (payload) => {
  const { transferId, status, utr, reason } = payload?.data || {};

  if (!transferId) {
    logger.warn('Payout webhook: no transferId');
    return { ignored: true };
  }

  const payout = await Payout.findOne({ transferId });
  if (!payout) {
    // Try by payoutRef
    const payoutByRef = await Payout.findOne({ payoutRef: transferId });
    if (!payoutByRef) {
      logger.warn(`Payout webhook: no payout found for transferId ${transferId}`);
      return { ignored: true };
    }
  }

  const payoutDoc = payout || (await Payout.findOne({ payoutRef: transferId }));

  const cfStatus = status?.toUpperCase();
  let internalStatus = 'processing';
  if (cfStatus === 'SUCCESS') internalStatus = 'SUCCESS';
  else if (['FAILED', 'REJECTED', 'REVERSED'].includes(cfStatus)) internalStatus = 'FAILED';

  await Payout.findByIdAndUpdate(payoutDoc._id, {
    cashfreeStatus: cfStatus,
    status: internalStatus,
    utr: utr || null,
    failureReason: reason || null,
    completedAt: internalStatus !== 'processing' ? new Date() : undefined,
  });

  const settlementStatus = internalStatus === 'SUCCESS'
    ? 'success'
    : internalStatus === 'FAILED'
    ? 'failed'
    : 'processing';

  await Settlement.findByIdAndUpdate(payoutDoc.settlementId, {
    status: settlementStatus,
    payoutReferenceId: utr,
    completedAt: settlementStatus !== 'processing' ? new Date() : undefined,
    failureReason: reason || null,
  });

  // On failure — restore merchant pending settlement
  if (internalStatus === 'FAILED') {
    const settlement = await Settlement.findById(payoutDoc.settlementId);
    if (settlement && !settlement.isAdminSettlement) {
      await Merchant.findByIdAndUpdate(payoutDoc.merchantId, {
        $inc: {
          totalSettled: -settlement.netAmount,
          pendingSettlement: settlement.netAmount,
        },
      });
      // Unmark transactions
      await Transaction.updateMany(
        { settlementId: payoutDoc.settlementId },
        { isSettled: false, settledAt: null, settlementId: null }
      );
    }
  }

  logger.info(`Payout webhook processed: ${transferId} → ${internalStatus}`);
  return { processed: true, transferId, status: internalStatus };
};

/**
 * Manually trigger a settlement (admin action)
 */
const manualSettle = async (merchantId, adminId) => {
  const merchant = await Merchant.findById(merchantId).populate('userId', 'email phone');
  if (!merchant) throw new Error('Merchant not found');

  const unsettledTxIds = await Transaction.find({
    merchantId,
    status: 'success',
    isSettled: false,
  }).select('_id');

  if (unsettledTxIds.length === 0) {
    throw new Error('No unsettled transactions found');
  }

  const settlement = await triggerInstantSettlement(
    merchantId,
    unsettledTxIds.map((t) => t._id)
  );

  if (settlement) {
    await Settlement.findByIdAndUpdate(settlement._id, {
      type: 'manual',
      initiatedBy: adminId,
    });
  }

  return settlement;
};

/**
 * Get settlement list for a merchant
 */
const getMerchantSettlements = async (merchantId, { page = 1, limit = 10, status } = {}) => {
  const skip = (page - 1) * limit;
  const filter = { merchantId };
  if (status) filter.status = status;

  const [settlements, total] = await Promise.all([
    Settlement.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-transactions -payoutResponse -totalCommission'),
    Settlement.countDocuments(filter),
  ]);

  return { settlements, total };
};

/**
 * Get a single settlement with its transactions
 */
const getSettlementDetail = async (settlementRef, merchantId = null) => {
  const filter = { settlementRef };
  if (merchantId) filter.merchantId = merchantId;

  const settlement = await Settlement.findOne(filter)
    .populate('transactions', 'orderId amount status paymentMethod createdAt customerName')
    .populate('merchantId', 'merchantId businessName')
    .populate('initiatedBy', 'name email');

  if (!settlement) {
    const err = new Error('Settlement not found');
    err.statusCode = 404;
    throw err;
  }

  return settlement;
};

/**
 * Manually trigger a settlement to a specific bank account (Merchant action)
 */
const manualMerchantSettlement = async (merchantId, bankAccountId) => {
  const merchant = await Merchant.findById(merchantId).populate('userId', 'email phone');
  if (!merchant) throw new Error('Merchant not found');

  const bankAccount = merchant.bankAccounts.id(bankAccountId);
  if (!bankAccount) throw new Error('Bank account not found');

  const unsettledTxIds = await Transaction.find({
    merchantId,
    status: 'success',
    isSettled: false,
  }).select('_id');

  if (unsettledTxIds.length === 0) {
    throw new Error('No unsettled transactions found');
  }

  const settlement = await triggerInstantSettlement(
    merchantId,
    unsettledTxIds.map((t) => t._id),
    bankAccountId
  );

  if (settlement) {
    await Settlement.findByIdAndUpdate(settlement._id, {
      type: 'manual',
    });
  }

  return settlement;
};

/**
 * Register or update a Cashfree Payout beneficiary for an administrator.
 */
const ensureAdminBeneficiary = async (adminUser, bankAccount) => {
  if (!bankAccount) {
    throw new Error('Admin has no bank details configured');
  }

  const payoutClient = await getPayoutClient();

  const beneficiaryId = `ADMINBEN_ACC_${bankAccount._id.toString()}`;

  // Check if already exists
  try {
    const check = await payoutClient.get(
      `/payout/v1/getBeneficiary/${beneficiaryId}`
    );
    if (check.data?.status === 'SUCCESS') {
      // Already registered — update local record if needed
      if (bankAccount.cashfreeBeneficiaryId !== beneficiaryId) {
        bankAccount.cashfreeBeneficiaryId = beneficiaryId;
        await adminUser.save();
      }
      return beneficiaryId;
    }
  } catch {
    // Not found — will create below
  }

  const payload = {
    beneId: beneficiaryId,
    name: bankAccount.accountHolderName,
    email: adminUser.email || 'admin@example.com',
    phone: adminUser.phone || '9999999999',
    bankAccount: bankAccount.accountNumber,
    ifsc: bankAccount.ifscCode,
    address1: 'India',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400001',
  };

  const res = await payoutClient.post('/payout/v1/addBeneficiary', payload);

  if (res.data?.status !== 'SUCCESS') {
    const msg = res.data?.message || 'Failed to register beneficiary';
    logger.error(`Cashfree beneficiary registration failed for admin: ${msg}`);
    throw new Error(msg);
  }

  bankAccount.cashfreeBeneficiaryId = beneficiaryId;
  await adminUser.save();

  logger.info(`Cashfree beneficiary registered for admin (Account: ${bankAccount.accountNumber})`);
  return beneficiaryId;
};

/**
 * Execute the actual Cashfree Payout transfer for admin
 */
const executeAdminPayout = async (adminUser, settlement, bankAccount) => {
  const payoutRef = generatePayoutRef('PAY');

  // Ensure beneficiary is registered
  const beneficiaryId = await ensureAdminBeneficiary(adminUser, bankAccount);

  const payoutClient = await getPayoutClient();

  const transferPayload = {
    beneId: beneficiaryId,
    amount: settlement.netAmount.toFixed(2),
    transferId: payoutRef,
    transferMode: 'IMPS',
    remarks: `Admin Settlement ${settlement.settlementRef}`,
  };

  // Create payout record (pending)
  const payoutRecord = await Payout.create({
    settlementId: settlement._id,
    adminId: adminUser._id,
    isAdminPayout: true,
    payoutRef,
    beneficiaryId,
    amount: settlement.netAmount,
    transferMode: 'IMPS',
    accountNumber: bankAccount.accountNumber,
    ifsc: bankAccount.ifscCode,
    accountHolder: bankAccount.accountHolderName,
    status: 'processing',
    initiatedAt: new Date(),
    cashfreeRequest: transferPayload,
  });

  let cfResponse;
  try {
    const res = await payoutClient.post('/payout/v1/requestTransfer', transferPayload);
    cfResponse = res.data;
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    await Payout.findByIdAndUpdate(payoutRecord._id, {
      status: 'FAILED',
      failureReason: msg,
      cashfreeResponse: err.response?.data,
    });
    await Settlement.findByIdAndUpdate(settlement._id, {
      status: 'failed',
      failureReason: msg,
    });
    throw new Error(msg);
  }

  // Update payout record with Cashfree response
  const cfStatus = cfResponse?.status === 'SUCCESS' ? 'processing' : 'FAILED';
  await Payout.findByIdAndUpdate(payoutRecord._id, {
    transferId: cfResponse?.data?.referenceId || payoutRef,
    cashfreeStatus: cfResponse?.status,
    cashfreeResponse: cfResponse,
    status: cfStatus,
  });

  // Update settlement with transfer info
  await Settlement.findByIdAndUpdate(settlement._id, {
    payoutTransferId: cfResponse?.data?.referenceId || payoutRef,
    payoutMode: 'IMPS',
    status: cfStatus === 'processing' ? 'processing' : 'failed',
    payoutResponse: cfResponse,
  });

  logger.info(`Payout ${payoutRef} submitted to Cashfree for admin settlement ${settlement.settlementRef}`);
  return payoutRecord;
};

/**
 * Get aggregated admin commission balance details
 */
const getAdminCommissionBalance = async () => {
  // 1. Get sum of commissionAmount in successful Transaction records
  const transactionResult = await Transaction.aggregate([
    { $match: { status: 'success' } },
    { $group: { _id: null, totalCommission: { $sum: '$commissionAmount' } } }
  ]);
  const totalCommission = transactionResult[0]?.totalCommission || 0;

  // 2. Get sum of netAmount in successful admin Settlement records
  const settlementResult = await Settlement.aggregate([
    { $match: { isAdminSettlement: true, status: 'success' } },
    { $group: { _id: null, totalSettled: { $sum: '$netAmount' } } }
  ]);
  const totalSettled = settlementResult[0]?.totalSettled || 0;

  // 3. Get sum of netAmount in processing admin Settlement records
  const processingResult = await Settlement.aggregate([
    { $match: { isAdminSettlement: true, status: 'processing' } },
    { $group: { _id: null, totalProcessing: { $sum: '$netAmount' } } }
  ]);
  const totalProcessing = processingResult[0]?.totalProcessing || 0;

  const withdrawableBalance = Math.max(0, parseFloat((totalCommission - totalSettled - totalProcessing).toFixed(2)));

  return {
    totalCommission: parseFloat(totalCommission.toFixed(2)),
    totalSettled: parseFloat(totalSettled.toFixed(2)),
    totalProcessing: parseFloat(totalProcessing.toFixed(2)),
    withdrawableBalance,
  };
};

/**
 * Trigger manual settlement for platform commission to a registered admin bank account.
 */
const settleAdminCommissions = async (adminId, bankAccountId) => {
  const adminUser = await User.findById(adminId);
  if (!adminUser || adminUser.role !== 'admin') {
    throw new Error('Admin user not found');
  }

  const bankAccount = adminUser.bankAccounts.id(bankAccountId);
  if (!bankAccount) {
    throw new Error('Bank account not found');
  }

  // Calculate withdrawable balance
  const balanceInfo = await getAdminCommissionBalance();
  const amountToSettle = balanceInfo.withdrawableBalance;

  const minSettlement = parseFloat(process.env.MIN_SETTLEMENT_AMOUNT || '100');
  if (amountToSettle < minSettlement) {
    throw new Error(`Withdrawable balance ₹${amountToSettle} is less than minimum settlement amount ₹${minSettlement}`);
  }

  const settlementRef = generatePayoutRef('SET');

  // Create settlement record (pending)
  const settlement = await Settlement.create({
    settlementRef,
    isAdminSettlement: true,
    adminId,
    grossAmount: amountToSettle,
    totalCommission: 0,
    netAmount: amountToSettle,
    transactions: [],
    transactionCount: 0,
    bankAccountNumber: bankAccount.accountNumber,
    bankIfsc: bankAccount.ifscCode,
    bankName: bankAccount.bankName,
    accountHolderName: bankAccount.accountHolderName,
    status: 'processing',
    type: 'manual',
    initiatedAt: new Date(),
    initiatedBy: adminId,
  });

  // Execute payout via Cashfree
  try {
    await executeAdminPayout(adminUser, settlement, bankAccount);
  } catch (payoutErr) {
    logger.error(`Admin payout execution failed for settlement ${settlementRef}: ${payoutErr.message}`);
    await Settlement.findByIdAndUpdate(settlement._id, {
      status: 'failed',
      failureReason: payoutErr.message,
    });
    throw payoutErr;
  }

  logger.info(
    `Admin Settlement ${settlementRef} initiated: ₹${amountToSettle} to bank account ${bankAccount.accountNumber}`
  );

  return settlement;
};

module.exports = {
  ensureBeneficiary,
  triggerInstantSettlement,
  executePayout,
  processPayoutWebhook,
  manualSettle,
  manualMerchantSettlement,
  getMerchantSettlements,
  getSettlementDetail,
  getAdminCommissionBalance,
  settleAdminCommissions,
};
