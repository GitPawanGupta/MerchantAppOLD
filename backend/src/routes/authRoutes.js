const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');

// Public routes (rate-limited)
router.post('/register', authLimiter, authController.registerValidation, validate, authController.register);
router.post('/login', authLimiter, authController.loginValidation, validate, authController.login);
router.post('/refresh', authController.refreshToken);

// Protected routes
router.use(authenticate);
router.get('/me', authController.getMe);
router.post('/logout', authController.logout);
router.put('/change-password', authController.changePasswordValidation, validate, authController.changePassword);

module.exports = router;
