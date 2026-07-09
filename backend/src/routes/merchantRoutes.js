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

// Allowed extensions AND their corresponding MIME types.
// Both must match — extension-only checks can be spoofed by renaming files.
const ALLOWED_KYC_FILES = {
  '.jpg':  ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png':  ['image/png'],
  '.pdf':  ['application/pdf'],
};

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedMimes = ALLOWED_KYC_FILES[ext];

  if (!allowedMimes) {
    return cb(new Error('Only JPG, PNG, and PDF files are allowed'), false);
  }

  if (!allowedMimes.includes(file.mimetype)) {
    return cb(
      new Error(`File "${file.originalname}" has an invalid content type. Expected ${allowedMimes.join(' or ')}.`),
      false
    );
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB per file
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

module.exports = router;
