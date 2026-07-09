const app = require('./app');
const logger = require('./utils/logger');
const Settings = require('./models/Settings');
const paymentGatewayFactory = require('./services/gateways/PaymentGatewayFactory');

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, async () => {
  logger.info(`ISS Merchant API running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
  logger.info(`Health check: http://localhost:${PORT}/api/health`);
  
  // Initialize default settings
  try {
    await Settings.initializeDefaults();
    logger.info('Default settings initialized');
    
    // Initialize payment gateway factory
    const gatewaySettings = await Settings.getValue('payment_gateway', { 
      activeGateway: 'razorpay', 
      failoverEnabled: false 
    });
    await paymentGatewayFactory.initialize(gatewaySettings);
    logger.info(`Payment gateway factory initialized with: ${gatewaySettings.activeGateway}`);
  } catch (err) {
    logger.error(`Settings initialization failed: ${err.message}`);
  }
});

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
const shutdown = (signal) => {
  logger.info(`${signal} received. Shutting down gracefully...`);
  server.close(() => {
    logger.info('HTTP server closed');
    const mongoose = require('mongoose');
    mongoose.connection.close(false, () => {
      logger.info('MongoDB connection closed');
      process.exit(0);
    });
  });

  // Force shutdown if graceful close takes too long
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ─── Unhandled Rejection / Exception Guards ───────────────────────────────────
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

module.exports = server;
