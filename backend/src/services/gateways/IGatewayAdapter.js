/**
 * Payment Gateway Interface
 * All gateway adapters must implement these methods
 */

class IGatewayAdapter {
  /**
   * Create a payment order
   * @param {Object} params - { amount, orderId, customerPhone, customerEmail, customerName }
   * @returns {Promise<Object>} Normalized order response
   */
  async createOrder(params) {
    throw new Error('createOrder() must be implemented by gateway adapter');
  }

  /**
   * Verify payment signature/status
   * @param {Object} params - Gateway-specific verification params
   * @returns {Promise<Object>} Normalized verification response
   */
  async verifyPayment(params) {
    throw new Error('verifyPayment() must be implemented by gateway adapter');
  }

  /**
   * Fetch payment details from gateway
   * @param {String} paymentId - Gateway payment ID
   * @returns {Promise<Object>} Normalized payment details
   */
  async fetchPayment(paymentId) {
    throw new Error('fetchPayment() must be implemented by gateway adapter');
  }

  /**
   * Process webhook payload
   * @param {String} rawBody - Raw webhook body
   * @param {Object} headers - Request headers
   * @param {Object} payload - Parsed JSON payload
   * @returns {Promise<Object>} Normalized webhook response
   */
  async processWebhook(rawBody, headers, payload) {
    throw new Error('processWebhook() must be implemented by gateway adapter');
  }

  /**
   * Get gateway name
   * @returns {String} Gateway identifier (razorpay, cashfree)
   */
  getName() {
    throw new Error('getName() must be implemented by gateway adapter');
  }

  /**
   * Generate checkout options for frontend
   * @param {Object} order - Order object from createOrder
   * @param {Object} params - Additional params (customer details, etc)
   * @returns {Object} Checkout configuration
   */
  getCheckoutOptions(order, params) {
    throw new Error('getCheckoutOptions() must be implemented by gateway adapter');
  }
}

module.exports = IGatewayAdapter;
