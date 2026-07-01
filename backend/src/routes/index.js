const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const merchantRoutes = require('./merchantRoutes');
const qrRoutes = require('./qrRoutes');
const paymentRoutes = require('./paymentRoutes');
const settlementRoutes = require('./settlementRoutes');
const reportingRoutes = require('./reportingRoutes');
const adminRoutes = require('./adminRoutes');

// Health check — no auth
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'ISS Merchant API is running',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// API routes
router.use('/auth', authRoutes);
router.use('/merchant', merchantRoutes);
router.use('/qr', qrRoutes);
router.use('/payment', paymentRoutes);
router.use('/settlement', settlementRoutes);
router.use('/reports', reportingRoutes);
router.use('/admin', adminRoutes);

module.exports = router;
