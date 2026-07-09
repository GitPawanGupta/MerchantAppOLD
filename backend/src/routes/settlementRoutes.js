const express = require('express');
const router = express.Router();
const settlementController = require('../controllers/settlementController');
const { authenticate, attachMerchant } = require('../middleware/auth');

// All settlement routes are merchant-protected
router.use(authenticate, attachMerchant);

router.get('/', settlementController.listSettlements);
router.post('/request', settlementController.requestSettlement);
router.get('/:settlementRef', settlementController.getSettlementDetail);

module.exports = router;
