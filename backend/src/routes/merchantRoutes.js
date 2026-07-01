const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const merchantController = require('../controllers/merchantController');
const { authenticate, attachMerchant } = require('../middleware/auth');
const validate = require('../middleware/validate');

// ─── File upload config for KYC docs ────────────────────────────────────────
// Use memoryStorage — Render's filesystem is ephemeral, files won't persist.
// Files are stored as base64 strings in MongoDB instead.
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed = ['.jpg', '.jpeg', '.png', '.pdf'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) cb(null, true);
  else cb(new Error('Only JPG, PNG, and PDF files are allowed'), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

// All routes require authentication + merchant profile
router.use(authenticate, attachMerchant);

// Profile
router.get('/profile', merchantController.getProfile);
router.put(
  '/profile',
  merchantController.updateProfileValidation,
  validate,
  merchantController.updateProfile
);

// Dashboard
router.get('/dashboard', merchantController.getDashboard);

// KYC
router.get('/kyc', merchantController.getKYCStatus);
router.post(
  '/kyc',
  upload.fields([
    { name: 'panDoc', maxCount: 1 },
    { name: 'aadharDoc', maxCount: 1 },
    { name: 'gstDoc', maxCount: 1 },
  ]),
  merchantController.kycValidation,
  validate,
  merchantController.submitKYC
);

// Bank details
router.get('/bank-details', merchantController.getBankDetails);
router.get('/verify-ifsc', merchantController.verifyIFSC);
router.post(
  '/bank-details',
  merchantController.bankValidation,
  validate,
  merchantController.updateBankDetails
);

// Bank accounts list, add, delete, set primary
router.get('/bank-accounts', merchantController.getBankAccounts);
router.post(
  '/bank-accounts',
  merchantController.bankValidation,
  validate,
  merchantController.addBankAccount
);
router.post('/bank-accounts/:id/primary', merchantController.setPrimaryBankAccount);
router.delete('/bank-accounts/:id', merchantController.deleteBankAccount);

// Settlement preference
router.get('/settlement-preference', merchantController.getSettlementPreference);
router.post('/settlement-preference', merchantController.updateSettlementPreference);

module.exports = router;
