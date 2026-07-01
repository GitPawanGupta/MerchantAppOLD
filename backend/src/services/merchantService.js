const Merchant = require('../models/Merchant');
const User = require('../models/User');
const { maskString } = require('../utils/helpers');
const axios = require('axios');

/**
 * Get merchant profile (with masked bank details)
 */
const getProfile = async (merchantId) => {
  const merchant = await Merchant.findById(merchantId)
    .populate('userId', 'name email phone isEmailVerified isPhoneVerified lastLogin');

  if (!merchant) {
    const err = new Error('Merchant not found');
    err.statusCode = 404;
    throw err;
  }

  const data = merchant.toObject();

  // Remove commission rate — not visible to merchant
  delete data.commissionRate;
  delete data.totalCommission;

  // Mask sensitive bank account number
  if (data.bankDetails?.accountNumber) {
    data.bankDetails.accountNumber = maskString(data.bankDetails.accountNumber, 4);
  }

  return data;
};

/**
 * Update business profile
 */
const updateProfile = async (merchantId, updates) => {
  const allowed = [
    'businessName',
    'businessCategory',
    'businessAddress',
    'logo',
    'website',
    'notes',
  ];

  const filtered = {};
  allowed.forEach((key) => {
    if (updates[key] !== undefined) filtered[key] = updates[key];
  });

  const merchant = await Merchant.findByIdAndUpdate(
    merchantId,
    { $set: filtered },
    { new: true, runValidators: true }
  ).populate('userId', 'name email phone');

  if (!merchant) {
    const err = new Error('Merchant not found');
    err.statusCode = 404;
    throw err;
  }

  return merchant;
};

/**
 * Submit / update KYC details
 */
const submitKYC = async (merchantId, kycData, files = {}) => {
  const merchant = await Merchant.findById(merchantId);
  if (!merchant) {
    const err = new Error('Merchant not found');
    err.statusCode = 404;
    throw err;
  }

  if (['approved'].includes(merchant.kyc?.status)) {
    const err = new Error('KYC is already approved and cannot be re-submitted');
    err.statusCode = 400;
    throw err;
  }

  const kycUpdate = {
    ...merchant.kyc?.toObject?.() || {},
    ...kycData,
    status: 'submitted',
  };

  // Attach uploaded file paths if provided
  if (files.panDoc) kycUpdate.panDoc = files.panDoc;
  if (files.aadharDoc) kycUpdate.aadharDoc = files.aadharDoc;
  if (files.gstDoc) kycUpdate.gstDoc = files.gstDoc;

  merchant.kyc = kycUpdate;
  await merchant.save();

  return merchant;
};

/**
 * Verify IFSC code using Razorpay API
 */
const verifyIFSC = async (ifscCode) => {
  try {
    const ifscRes = await axios.get(`https://ifsc.razorpay.com/${ifscCode.toUpperCase()}`, { timeout: 5000 });
    if (ifscRes.status === 200 && ifscRes.data) {
      return {
        isValid: true,
        bankName: ifscRes.data.BANK,
        branch: ifscRes.data.BRANCH,
        city: ifscRes.data.CITY,
        state: ifscRes.data.STATE,
      };
    }
  } catch (err) {
    if (err.response && err.response.status === 404) {
      const error = new Error('Invalid IFSC code');
      error.statusCode = 404;
      throw error;
    }
    throw new Error('IFSC verification service unavailable');
  }
  return { isValid: false };
};

/**
 * Add / update bank details
 */
const updateBankDetails = async (merchantId, bankData) => {
  const merchant = await Merchant.findById(merchantId);
  if (!merchant) {
    const err = new Error('Merchant not found');
    err.statusCode = 404;
    throw err;
  }

  // Validate IFSC code via Razorpay API
  let verifiedBankName = bankData.bankName;
  try {
    const ifscRes = await axios.get(`https://ifsc.razorpay.com/${bankData.ifscCode.toUpperCase()}`, { timeout: 5000 });
    if (ifscRes.status === 200 && ifscRes.data) {
      // Store the verified bank name from Razorpay
      verifiedBankName = ifscRes.data.BANK || bankData.bankName;
    }
  } catch (err) {
    // If Razorpay returns 404, it means the IFSC code is invalid
    if (err.response && err.response.status === 404) {
      const error = new Error('Invalid IFSC code. Please check and try again.');
      error.statusCode = 400;
      throw error;
    }
    // For other errors (network down, timeout, 5xx), we log it and proceed with the user's input
    const logger = require('../utils/logger');
    logger.warn(`Razorpay IFSC lookup failed for ${bankData.ifscCode}: ${err.message}`);
  }

  merchant.bankAccounts = [{
    accountHolderName: bankData.accountHolderName,
    accountNumber: bankData.accountNumber,
    ifscCode: bankData.ifscCode.toUpperCase(),
    bankName: verifiedBankName,
    accountType: bankData.accountType || 'current',
    isPrimary: true,
    isVerified: false,
  }];

  merchant.bankDetails = {
    accountHolderName: bankData.accountHolderName,
    accountNumber: bankData.accountNumber,
    ifscCode: bankData.ifscCode.toUpperCase(),
    bankName: verifiedBankName,
    accountType: bankData.accountType || 'current',
    isVerified: false,
  };

  await merchant.save();

  // Also register/update beneficiary in Cashfree Payout (async)
  // This is handled separately in settlementService to avoid tight coupling

  const result = merchant.toObject();
  result.bankDetails.accountNumber = maskString(result.bankDetails.accountNumber, 4);
  return result;
};

/**
 * Get merchant dashboard summary
 */
const getDashboardSummary = async (merchantId) => {
  const Transaction = require('../models/Transaction');
  const Settlement = require('../models/Settlement');

  const merchant = await Merchant.findById(merchantId).select(
    'merchantId businessName status totalCollected totalSettled pendingSettlement kyc.status'
  );

  if (!merchant) {
    const err = new Error('Merchant not found');
    err.statusCode = 404;
    throw err;
  }

  // Today's stats
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Chart start (7 days ago)
  const chartStart = new Date();
  chartStart.setDate(chartStart.getDate() - 6);
  chartStart.setHours(0, 0, 0, 0);

  const [todayTx, recentTx, recentSettlements, chartTx] = await Promise.all([
    Transaction.aggregate([
      {
        $match: {
          merchantId: merchant._id,
          status: 'success',
          createdAt: { $gte: todayStart },
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          total: { $sum: '$amount' },
          commission: { $sum: '$commissionAmount' },
        },
      },
    ]),
    Transaction.find({ merchantId: merchant._id })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('orderId amount status paymentMethod createdAt customerName'),
    Settlement.find({ merchantId: merchant._id })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('settlementRef netAmount status createdAt completedAt'),
    Transaction.aggregate([
      {
        $match: {
          merchantId: merchant._id,
          status: 'success',
          createdAt: { $gte: chartStart },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%m-%d', date: '$createdAt' },
          },
          amount: { $sum: '$amount' },
        },
      },
    ]),
  ]);

  const last7Days = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    last7Days.push(`${mm}-${dd}`);
  }

  const chartDataMap = {};
  if (chartTx && chartTx.length > 0) {
    chartTx.forEach(item => {
      chartDataMap[item._id] = item.amount;
    });
  }

  const paymentsChart = last7Days.map(dateStr => ({
    date: dateStr,
    amount: chartDataMap[dateStr] || 0,
  }));

  return {
    merchant: {
      merchantId: merchant.merchantId,
      businessName: merchant.businessName,
      status: merchant.status,
      kycStatus: merchant.kyc?.status,
    },
    summary: {
      totalCollected:    merchant.totalCollected,
      totalSettled:      merchant.totalSettled,
      pendingSettlement: merchant.pendingSettlement,
    },
    today: todayTx[0]
      ? {
          count: todayTx[0].count,
          total: todayTx[0].total,
          commission: todayTx[0].commission || 0,
        }
      : { count: 0, total: 0, commission: 0 },
    recentTransactions: recentTx,
    recentSettlements,
    paymentsChart,
  };
};

const getBankAccounts = async (merchantId) => {
  const merchant = await Merchant.findById(merchantId);
  if (!merchant) throw new Error('Merchant not found');
  return merchant.bankAccounts || [];
};

const addBankAccount = async (merchantId, bankData) => {
  const merchant = await Merchant.findById(merchantId);
  if (!merchant) throw new Error('Merchant not found');

  const { maskString } = require('../utils/helpers');
  const axios = require('axios');

  let verifiedBankName = bankData.bankName;
  try {
    const ifscRes = await axios.get(`https://ifsc.razorpay.com/${bankData.ifscCode.toUpperCase()}`, { timeout: 5000 });
    if (ifscRes.status === 200 && ifscRes.data) {
      verifiedBankName = ifscRes.data.BANK || bankData.bankName;
    }
  } catch (err) {
    if (err.response && err.response.status === 404) {
      const error = new Error('Invalid IFSC code. Please check and try again.');
      error.statusCode = 400;
      throw error;
    }
    const logger = require('../utils/logger');
    logger.warn(`Razorpay IFSC lookup failed for ${bankData.ifscCode}: ${err.message}`);
  }

  const isPrimary = !merchant.bankAccounts || merchant.bankAccounts.length === 0;

  const newAccount = {
    accountHolderName: bankData.accountHolderName,
    accountNumber: bankData.accountNumber,
    ifscCode: bankData.ifscCode.toUpperCase(),
    bankName: verifiedBankName,
    accountType: bankData.accountType || 'current',
    isPrimary,
    isVerified: false,
  };

  merchant.bankAccounts.push(newAccount);
  await merchant.save();

  return merchant.bankAccounts;
};

const setPrimaryBankAccount = async (merchantId, bankAccountId) => {
  const merchant = await Merchant.findById(merchantId);
  if (!merchant) throw new Error('Merchant not found');

  let found = false;
  merchant.bankAccounts.forEach((acc) => {
    if (acc._id.toString() === bankAccountId.toString()) {
      acc.isPrimary = true;
      found = true;
    } else {
      acc.isPrimary = false;
    }
  });

  if (!found) {
    const error = new Error('Bank account not found');
    error.statusCode = 404;
    throw error;
  }

  await merchant.save();
  return merchant.bankAccounts;
};

const deleteBankAccount = async (merchantId, bankAccountId) => {
  const merchant = await Merchant.findById(merchantId);
  if (!merchant) throw new Error('Merchant not found');

  const acc = merchant.bankAccounts.id(bankAccountId);
  if (!acc) {
    const error = new Error('Bank account not found');
    error.statusCode = 404;
    throw error;
  }

  if (acc.isPrimary && merchant.bankAccounts.length > 1) {
    const error = new Error('Cannot delete primary bank account. Set another account as primary first.');
    error.statusCode = 400;
    throw error;
  }

  merchant.bankAccounts.pull(bankAccountId);
  await merchant.save();
  return merchant.bankAccounts;
};

const getSettlementPreference = async (merchantId) => {
  const merchant = await Merchant.findById(merchantId);
  if (!merchant) throw new Error('Merchant not found');
  return merchant.settlementPreference || 'instant';
};

const updateSettlementPreference = async (merchantId, preference) => {
  const merchant = await Merchant.findById(merchantId);
  if (!merchant) throw new Error('Merchant not found');

  if (!['instant', 'on_demand'].includes(preference)) {
    const error = new Error('Invalid settlement preference');
    error.statusCode = 400;
    throw error;
  }

  merchant.settlementPreference = preference;
  await merchant.save();
  return merchant.settlementPreference;
};

module.exports = {
  getProfile,
  updateProfile,
  submitKYC,
  updateBankDetails,
  getDashboardSummary,
  verifyIFSC,
  getBankAccounts,
  addBankAccount,
  setPrimaryBankAccount,
  deleteBankAccount,
  getSettlementPreference,
  updateSettlementPreference,
};
