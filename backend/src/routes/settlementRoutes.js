const express = require('express');
const router = express.Router();
const settlementController = require('../controllers/settlementController');
const { authenticate, attachMerchant } = require('../middleware/auth');
const { webhookLimiter } = require('../middleware/rateLimiter');

// Public — Cashfree Payout webhook
router.post('/payout-webhook', webhookLimiter, settlementController.payoutWebhook);

// Protected — merchant views own settlements
router.use(authenticate, attachMerchant);
router.get('/', settlementController.listSettlements);
router.post('/request', settlementController.requestSettlement);
router.get('/:settlementRef', settlementController.getSettlementDetail);

module.exports = router;
