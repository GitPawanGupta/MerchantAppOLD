/**
 * Cashfree Payment Gateway Adapter
 * Implements IGatewayAdapter interface for Cashfree
 */

const IGatewayAdapter = require('./IGatewayAdapter');
const axios = require('axios');
const crypto = require('crypto');
const logger = require('../../utils/logger');

class CashfreeAdapter extends IGatewayAdapter {
  constructor() {
    super();
    this.appId = process.env.CASHFREE_APP_ID;
    this.secretKey = process.env.CASHFREE_SECRET_KEY;
    this.baseUrl = process.env.CASHFREE_BASE_URL || 'https://api.cashfree.com/pg';
    this.apiVersion = '2023-08-01'; // Cashfree API version
  }

  getName() {
    return 'cashfree';
  }

  /**
   * Get Cashfree API headers
   */
  getHeaders() {
    return {
      'x-client-id': this.appId,
      'x-client-secret': this.secretKey,
      'x-api-version': this.apiVersion,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Create Cashfree order
   */
  async createOrder({ amount, orderId, customerPhone, customerEmail, customerName }) {
    try {
      const orderData = {
        order_id: orderId,
        order_amount: amount,
        order_currency: 'INR',
        customer_details: {
          customer_id: customerPhone || `CUST_${Date.now()}`,
          customer_name: customerName || 'Customer',
          customer_email: customerEmail || 'customer@example.com',
          customer_phone: customerPhone || '9999999999',
        },
        order_meta: {
          return_url: `${process.env.APP_BASE_URL}/api/payment/return?orderId=${orderId}`,
          notify_url: `${process.env.APP_BASE_URL}/api/payment/webhook`,
        },
        order_note: `Payment for order ${orderId}`,
      };

      const response = await axios.post(
        `${this.baseUrl}/orders`,
        orderData,
        { headers: this.getHeaders() }
      );

      const cfOrder = response.data;

      logger.info(`Cashfree order created: ${cfOrder.order_id} (${cfOrder.cf_order_id})`);

      return {
        gateway: 'cashfree',
        gatewayOrderId: cfOrder.cf_order_id, // Cashfree internal order ID
        orderId: cfOrder.order_id, // Our order ID
        amount: cfOrder.order_amount,
        currency: cfOrder.order_currency,
        status: cfOrder.order_status,
        paymentSessionId: cfOrder.payment_session_id, // For checkout
        rawResponse: cfOrder,
      };
    } catch (error) {
      logger.error(`Cashfree order creation failed: ${error.response?.data?.message || error.message}`);
      throw new Error(`Cashfree order creation failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Verify Cashfree payment
   * Cashfree uses order ID to fetch payment details
   */
  async verifyPayment({ orderId }) {
    try {
      // Fetch order details from Cashfree
      const response = await axios.get(
        `${this.baseUrl}/orders/${orderId}`,
        { headers: this.getHeaders() }
      );

      const order = response.data;

      // Fetch payment details
      const paymentsResponse = await axios.get(
        `${this.baseUrl}/orders/${orderId}/payments`,
        { headers: this.getHeaders() }
      );

      const payments = paymentsResponse.data;
      const payment = payments && payments.length > 0 ? payments[0] : null;

      // Map Cashfree status to internal status
      let isValid = false;
      let status = 'pending';

      if (order.order_status === 'PAID') {
        isValid = true;
        status = 'success';
      } else if (order.order_status === 'ACTIVE') {
        status = 'pending';
      } else if (['EXPIRED', 'CANCELLED', 'TERMINATED'].includes(order.order_status)) {
        status = 'failed';
      }

      logger.info(`Cashfree payment verified: ${orderId} - ${order.order_status}`);

      return {
        gateway: 'cashfree',
        isValid,
        orderId: order.order_id,
        paymentId: payment?.cf_payment_id || null,
        amount: order.order_amount,
        status,
        method: payment?.payment_group || 'unknown',
        bankTransactionId: payment?.bank_reference || null,
        vpa: payment?.payment_method?.upi?.upi_id || null,
        capturedAt: payment?.payment_time ? new Date(payment.payment_time) : null,
        rawResponse: { order, payment },
      };
    } catch (error) {
      logger.error(`Cashfree payment verification failed: ${error.response?.data?.message || error.message}`);
      throw new Error(`Cashfree verification failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Fetch Cashfree payment details
   */
  async fetchPayment(paymentId) {
    try {
      // Cashfree doesn't have direct payment fetch by payment ID
      // We need order ID, so this is a placeholder
      // In real implementation, we'd need to store cf_payment_id → orderId mapping
      
      logger.warn('Cashfree fetchPayment requires orderId, not paymentId');
      
      throw new Error('Cashfree requires orderId for fetching payment details. Use verifyPayment with orderId instead.');
    } catch (error) {
      logger.error(`Cashfree fetch payment failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Process Cashfree webhook
   */
  async processWebhook(rawBody, headers, payload) {
    try {
      // Verify webhook signature
      const signature = headers['x-webhook-signature'];
      const timestamp = headers['x-webhook-timestamp'];

      if (signature && this.secretKey) {
        // Cashfree webhook signature verification
        const signatureData = `${timestamp}${rawBody}`;
        const generated = crypto
          .createHmac('sha256', this.secretKey)
          .update(signatureData)
          .digest('base64');

        if (generated !== signature) {
          logger.warn('Cashfree webhook signature verification failed');
          return {
            gateway: 'cashfree',
            isValid: false,
            error: 'Invalid webhook signature',
          };
        }
      }

      const event = payload.type;
      const data = payload.data;

      // Extract order and payment details
      const order = data.order;
      const payment = data.payment;

      // Map Cashfree status to internal status
      let internalStatus = 'pending';
      
      if (order?.order_status === 'PAID') {
        internalStatus = 'success';
      } else if (['EXPIRED', 'CANCELLED', 'TERMINATED'].includes(order?.order_status)) {
        internalStatus = 'failed';
      }

      logger.info(`Cashfree webhook processed: ${event} for order ${order?.order_id}`);

      return {
        gateway: 'cashfree',
        isValid: true,
        event,
        orderId: order?.order_id,
        paymentId: payment?.cf_payment_id,
        status: internalStatus,
        amount: order?.order_amount,
        method: payment?.payment_group || 'unknown',
        bankTransactionId: payment?.bank_reference,
        vpa: payment?.payment_method?.upi?.upi_id,
        errorDescription: payment?.payment_message,
        capturedAt: payment?.payment_time ? new Date(payment.payment_time) : null,
        rawPayload: payload,
      };
    } catch (error) {
      logger.error(`Cashfree webhook processing failed: ${error.message}`);
      throw new Error(`Cashfree webhook failed: ${error.message}`);
    }
  }

  /**
   * Generate Cashfree checkout options for frontend
   */
  getCheckoutOptions(order, params) {
    const { customerName, customerEmail, customerPhone, callbackUrl, qrId } = params;

    // Cashfree uses different checkout approach
    // Returns payment session ID which is used in Cashfree Drop-in checkout
    return {
      gateway: 'cashfree',
      paymentSessionId: order.paymentSessionId,
      orderId: order.orderId,
      amount: order.amount,
      currency: 'INR',
      environment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox',
      
      // Cashfree Drop checkout configuration
      components: [
        'order-details',
        'card',
        'netbanking',
        'upi',
        'app',
      ],
      
      style: {
        backgroundColor: '#ffffff',
        color: '#11385b',
        fontFamily: 'Lato',
        fontSize: '14px',
        errorColor: '#ff0000',
        theme: 'light',
      },
      
      // Customer details
      customerDetails: {
        customerId: customerPhone || `CUST_${Date.now()}`,
        customerName: customerName || 'Customer',
        customerEmail: customerEmail || 'customer@example.com',
        customerPhone: customerPhone || '9999999999',
      },
      
      // Return URL
      returnUrl: callbackUrl,
    };
  }
}

module.exports = CashfreeAdapter;
