const express = require('express');
const router = express.Router();
const reportingController = require('../controllers/reportingController');
const { authenticate, attachMerchant } = require('../middleware/auth');

// Merchant reports — require merchant profile
router.use(authenticate, attachMerchant);
router.get('/transactions', reportingController.merchantTransactionReport);
router.get('/settlements', reportingController.merchantSettlementReport);

module.exports = router;
