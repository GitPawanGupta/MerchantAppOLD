const express = require('express');
const router = express.Router();
const { authenticate, attachMerchant, requireAdmin } = require('../middleware/auth');
const notificationController = require('../controllers/notificationController');

// ── Merchant notifications ────────────────────────────────────────────────────
router.get(
  '/merchant',
  authenticate,
  attachMerchant,
  notificationController.getMerchantNotifications
);
router.patch(
  '/merchant/read-all',
  authenticate,
  attachMerchant,
  notificationController.markMerchantNotificationsRead
);
router.patch(
  '/merchant/:id/read',
  authenticate,
  attachMerchant,
  notificationController.markMerchantNotificationsRead
);

// ── Admin notifications ───────────────────────────────────────────────────────
router.get(
  '/admin',
  authenticate,
  requireAdmin,
  notificationController.getAdminNotifications
);
router.patch(
  '/admin/read-all',
  authenticate,
  requireAdmin,
  notificationController.markAdminNotificationsRead
);
router.patch(
  '/admin/:id/read',
  authenticate,
  requireAdmin,
  notificationController.markAdminNotificationsRead
);

module.exports = router;
