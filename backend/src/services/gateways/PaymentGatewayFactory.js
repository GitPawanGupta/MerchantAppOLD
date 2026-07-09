/**
 * Payment Gateway Factory
 * Selects and returns the appropriate gateway adapter based on configuration
 */

const RazorpayAdapter = require('./RazorpayAdapter');
const CashfreeAdapter = require('./CashfreeAdapter');
const logger = require('../../utils/logger');

class PaymentGatewayFactory {
  constructor() {
    this.gateways = {
      razorpay: new RazorpayAdapter(),
      cashfree: new CashfreeAdapter(),
    };
    this.activeGateway = null;
    this.settings = null;
  }

  /**
   * Initialize factory with settings from database
   * @param {Object} settings - Gateway settings from Settings collection
   */
  async initialize(settings) {
    this.settings = settings || { activeGateway: 'razorpay', failoverEnabled: false };
    this.activeGateway = this.settings.activeGateway || 'razorpay';
    logger.info(`Payment Gateway Factory initialized: ${this.activeGateway} (failover: ${this.settings.failoverEnabled})`);
  }

  /**
   * Get current active gateway adapter
   * @returns {IGatewayAdapter} Active gateway instance
   */
  getGateway() {
    const gateway = this.gateways[this.activeGateway];
    if (!gateway) {
      logger.error(`Invalid gateway: ${this.activeGateway}, falling back to razorpay`);
      return this.gateways.razorpay;
    }
    return gateway;
  }

  /**
   * Get gateway by name (for admin testing or manual selection)
   * @param {String} gatewayName - razorpay or cashfree
   * @returns {IGatewayAdapter} Gateway instance
   */
  getGatewayByName(gatewayName) {
    const gateway = this.gateways[gatewayName];
    if (!gateway) {
      throw new Error(`Unknown gateway: ${gatewayName}`);
    }
    return gateway;
  }

  /**
   * Switch active gateway (admin action)
   * @param {String} gatewayName - razorpay or cashfree
   */
  async switchGateway(gatewayName) {
    if (!this.gateways[gatewayName]) {
      throw new Error(`Cannot switch to unknown gateway: ${gatewayName}`);
    }
    
    const previousGateway = this.activeGateway;
    this.activeGateway = gatewayName;
    
    logger.info(`Gateway switched: ${previousGateway} → ${gatewayName}`);
    
    // Update settings in database
    const Settings = require('../../models/Settings');
    await Settings.findOneAndUpdate(
      { key: 'payment_gateway' },
      {
        key: 'payment_gateway',
        value: {
          activeGateway: gatewayName,
          failoverEnabled: this.settings.failoverEnabled || false,
          lastSwitched: new Date(),
          previousGateway,
        },
      },
      { upsert: true, new: true }
    );
  }

  /**
   * Attempt failover to backup gateway
   * @returns {Boolean} True if failover successful
   */
  async attemptFailover() {
    if (!this.settings?.failoverEnabled) {
      logger.warn('Failover attempted but not enabled');
      return false;
    }

    const backupGateway = this.activeGateway === 'razorpay' ? 'cashfree' : 'razorpay';
    
    logger.warn(`Primary gateway ${this.activeGateway} failed, attempting failover to ${backupGateway}`);
    
    try {
      await this.switchGateway(backupGateway);
      
      // TODO: Send alert to admin (email, SMS, webhook)
      logger.error(`ALERT: Gateway auto-switched from ${this.activeGateway} to ${backupGateway} due to failures`);
      
      return true;
    } catch (err) {
      logger.error(`Failover failed: ${err.message}`);
      return false;
    }
  }

  /**
   * Get all available gateways with status
   * @returns {Array} Gateway list with connection status
   */
  async getAllGateways() {
    const statuses = [];
    
    for (const [name, adapter] of Object.entries(this.gateways)) {
      statuses.push({
        name,
        displayName: name.charAt(0).toUpperCase() + name.slice(1),
        isActive: name === this.activeGateway,
        isAvailable: true, // Can add health check here
      });
    }
    
    return statuses;
  }

  /**
   * Test gateway connection
   * @param {String} gatewayName - Gateway to test
   * @returns {Promise<Object>} Test result
   */
  async testGateway(gatewayName) {
    const gateway = this.getGatewayByName(gatewayName);
    
    try {
      // Try creating a minimal test order (amount: ₹1)
      const testOrder = await gateway.createOrder({
        amount: 1,
        orderId: `TEST_${Date.now()}`,
        customerPhone: '9999999999',
        customerEmail: 'test@example.com',
        customerName: 'Test User',
      });
      
      return {
        success: true,
        gateway: gatewayName,
        message: `${gateway.getName()} connection successful`,
        orderId: testOrder.gatewayOrderId,
      };
    } catch (err) {
      return {
        success: false,
        gateway: gatewayName,
        message: `${gateway.getName()} connection failed: ${err.message}`,
        error: err.message,
      };
    }
  }
}

// Singleton instance
const factory = new PaymentGatewayFactory();

module.exports = factory;
