const express = require('express');
const router = express.Router();
const qrController = require('../controllers/qrController');
const { authenticate, attachMerchant } = require('../middleware/auth');
const validate = require('../middleware/validate');

// Public — customer scans QR
router.get('/scan/:qrId', qrController.scanQR);

// Protected — merchant manages QR codes
router.use(authenticate, attachMerchant);

router.get('/', qrController.listQRCodes);
router.post('/static', qrController.staticQRValidation, validate, qrController.createStaticQR);
router.post('/dynamic', qrController.dynamicQRValidation, validate, qrController.createDynamicQR);
router.get('/:qrId/image', qrController.getQRImage);
router.patch('/:qrId/deactivate', qrController.deactivateQR);
router.delete('/:qrId', qrController.deleteQR);

module.exports = router;
