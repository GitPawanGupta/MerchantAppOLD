const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticate, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');

// ─── Seed (one-time, no auth) ─────────────────────────────────────────────────
// Only works when zero admin users exist — disable in production after first use
router.post('/seed', adminController.seedAdmin);

// ─── All routes below require admin role ──────────────────────────────────────
router.use(authenticate, authorize('admin'));

// Dashboard
router.get('/dashboard', adminController.getDashboard);

// ── Merchant Management ───────────────────────────────────────────────────────
router.get('/merchants', adminController.listMerchants);
router.get('/merchants/:merchantId', adminController.getMerchantDetail);
router.patch(
  '/merchants/:merchantId/status',
  adminController.merchantStatusValidation,
  validate,
  adminController.updateMerchantStatus
);
router.patch(
  '/merchants/:merchantId/kyc',
  adminController.kycActionValidation,
  validate,
  adminController.updateKYCStatus
);
router.post('/merchants/:merchantId/settle', adminController.manualSettle);

// ── Transaction Management ────────────────────────────────────────────────────
router.get('/transactions', adminController.listAllTransactions);
router.get('/transactions/:orderId', adminController.getTransactionDetail);

// ── Settlement Management ─────────────────────────────────────────────────────
router.get('/settlements', adminController.listAllSettlements);
router.get('/settlements/:settlementRef', adminController.getSettlementDetail);

// ── Commission Config ─────────────────────────────────────────────────────────
router.get('/commission/configs', adminController.listCommissionConfigs);
router.post(
  '/commission/global',
  adminController.globalCommissionValidation,
  validate,
  adminController.setGlobalCommission
);
router.get('/commission/merchant/:merchantId', adminController.getMerchantCommission);
router.post(
  '/commission/merchant/:merchantId',
  adminController.merchantCommissionValidation,
  validate,
  adminController.setMerchantCommission
);
router.delete('/commission/merchant/:merchantId', adminController.removeMerchantCommission);

// ── Reports ───────────────────────────────────────────────────────────────────
router.get('/reports/transactions', adminController.transactionReport);
router.get('/reports/commissions', adminController.commissionReport);
router.get('/reports/settlements', adminController.settlementReport);

// ── Bank Accounts ─────────────────────────────────────────────────────────────
router.get('/verify-ifsc', adminController.verifyIFSC);
router.get('/bank-accounts', adminController.getBankAccounts);
router.post(
  '/bank-accounts',
  adminController.bankValidation,
  validate,
  adminController.addBankAccount
);
router.post('/bank-accounts/:id/primary', adminController.setPrimaryBankAccount);
router.delete('/bank-accounts/:id', adminController.deleteBankAccount);

// ── Commission Settlement ─────────────────────────────────────────────────────
router.get('/commission/balance', adminController.getCommissionBalance);
router.post('/commission/settle', adminController.settleCommission);

// ── User Management ───────────────────────────────────────────────────────────
router.get('/users', adminController.listUsers);

module.exports = router;
