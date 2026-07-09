/**
 * Razorpay Payment Gateway Adapter
 * Implements IGatewayAdapter interface for Razorpay
 */

const IGatewayAdapter = require('./IGatewayAdapter');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const logger = require('../../utils/logger');

class RazorpayAdapter extends IGatewayAdapter {
  constructor() {
    super();
    this.client = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
    this.keyId = process.env.RAZORPAY_KEY_ID;
    this.keySecret = process.env.RAZORPAY_KEY_SECRET;
    this.webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  }

  getName() {
    return 'razorpay';
  }

  /**
   * Create Razorpay order
   */
  async createOrder({ amount, orderId, customerPhone, customerEmail, customerName }) {
    try {
      const rzpOrder = await this.client.orders.create({
        amount: amount * 100, // Convert to paise
        currency: 'INR',
        receipt: orderId,
        notes: {
          orderId,
          customerPhone,
          customerEmail,
          customerName,
        },
      });

      logger.info(`Razorpay order created: ${rzpOrder.id} for ${orderId}`);

      return {
        gateway: 'razorpay',
        gatewayOrderId: rzpOrder.id,
        amount: rzpOrder.amount / 100, // Convert back to rupees
        currency: rzpOrder.currency,
        status: rzpOrder.status,
        rawResponse: rzpOrder,
      };
    } catch (error) {
      logger.error(`Razorpay order creation failed: ${error.message}`);
      throw new Error(`Razorpay order creation failed: ${error.message}`);
    }
  }

  /**
   * Verify Razorpay payment signature
   */
  async verifyPayment({ orderId, paymentId, signature }) {
    try {
      const generated = crypto
        .createHmac('sha256', this.keySecret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      const isValid = generated === signature;

      if (!isValid) {
        logger.warn(`Razorpay signature verification failed for ${paymentId}`);
        return {
          gateway: 'razorpay',
          isValid: false,
          paymentId,
          error: 'Invalid signature',
        };
      }

      // Fetch payment details
      const payment = await this.client.payments.fetch(paymentId);

      logger.info(`Razorpay payment verified: ${paymentId}`);

      // Map Razorpay status to internal status
      let internalStatus = 'pending';
      if (payment.status === 'captured' || payment.status === 'authorized') {
        internalStatus = 'success';
      } else if (payment.status === 'failed') {
        internalStatus = 'failed';
      } else if (payment.status === 'refunded') {
        internalStatus = 'refunded';
      }

      return {
        gateway: 'razorpay',
        isValid: true,
        paymentId: payment.id,
        orderId: payment.order_id,
        amount: payment.amount / 100,
        status: internalStatus, // Use mapped internal status
        method: payment.method,
        bankTransactionId: payment.acquirer_data?.bank_transaction_id || payment.bank_transaction_id,
        vpa: payment.vpa,
        capturedAt: payment.captured_at ? new Date(payment.captured_at * 1000) : null,
        rawResponse: payment,
      };
    } catch (error) {
      logger.error(`Razorpay payment verification failed: ${error.message}`);
      throw new Error(`Razorpay verification failed: ${error.message}`);
    }
  }

  /**
   * Fetch Razorpay payment details
   */
  async fetchPayment(paymentId) {
    try {
      const payment = await this.client.payments.fetch(paymentId);

      return {
        gateway: 'razorpay',
        paymentId: payment.id,
        orderId: payment.order_id,
        amount: payment.amount / 100,
        status: payment.status,
        method: payment.method,
        bankTransactionId: payment.acquirer_data?.bank_transaction_id || payment.bank_transaction_id,
        vpa: payment.vpa,
        email: payment.email,
        contact: payment.contact,
        capturedAt: payment.captured_at ? new Date(payment.captured_at * 1000) : null,
        createdAt: payment.created_at ? new Date(payment.created_at * 1000) : null,
        errorDescription: payment.error_description,
        rawResponse: payment,
      };
    } catch (error) {
      logger.error(`Razorpay fetch payment failed: ${error.message}`);
      throw new Error(`Razorpay fetch failed: ${error.message}`);
    }
  }

  /**
   * Process Razorpay webhook
   */
  async processWebhook(rawBody, headers, payload) {
    try {
      // Verify webhook signature
      const signature = headers['x-razorpay-signature'];
      
      if (this.webhookSecret) {
        const generated = crypto
          .createHmac('sha256', this.webhookSecret)
          .update(rawBody)
          .digest('hex');

        if (generated !== signature) {
          logger.warn(`Razorpay webhook signature verification failed`);
          logger.warn(`Expected: ${generated}`);
          logger.warn(`Received: ${signature}`);
          logger.warn(`RawBody type: ${typeof rawBody}, length: ${rawBody?.length || 0}`);
          return {
            gateway: 'razorpay',
            isValid: false,
            error: 'Invalid webhook signature',
          };
        }
        logger.info('Razorpay webhook signature verified successfully');
      } else {
        logger.warn('Razorpay webhook secret not configured - skipping signature verification');
      }

      const event = payload.event;
      const payment = payload.payload?.payment?.entity || payload.payload?.order?.entity;
      const rzpOrderId = payment?.order_id || payload.payload?.order?.entity?.id;

      if (!rzpOrderId) {
        logger.warn('Razorpay webhook: no order_id found');
        return {
          gateway: 'razorpay',
          isValid: false,
          error: 'No order_id in webhook',
        };
      }

      // Map Razorpay status to internal status
      let internalStatus = 'pending';
      const rzpStatus = payment?.status;
      
      if (rzpStatus === 'captured') internalStatus = 'success';
      else if (rzpStatus === 'failed') internalStatus = 'failed';
      else if (rzpStatus === 'refunded') internalStatus = 'failed';

      logger.info(`Razorpay webhook processed: ${event} for order ${rzpOrderId}`);

      return {
        gateway: 'razorpay',
        isValid: true,
        event,
        orderId: rzpOrderId,
        paymentId: payment?.id,
        status: internalStatus,
        amount: payment?.amount ? payment.amount / 100 : null,
        method: payment?.method,
        bankTransactionId: payment?.acquirer_data?.bank_transaction_id || payment?.bank_transaction_id,
        vpa: payment?.vpa,
        errorDescription: payment?.error_description || payment?.description,
        capturedAt: payment?.captured_at ? new Date(payment.captured_at * 1000) : null,
        rawPayload: payload,
      };
    } catch (error) {
      logger.error(`Razorpay webhook processing failed: ${error.message}`);
      throw new Error(`Razorpay webhook failed: ${error.message}`);
    }
  }

  /**
   * Generate Razorpay checkout options for frontend
   */
  getCheckoutOptions(order, params) {
    const { customerName, customerEmail, customerPhone, callbackUrl, qrId } = params;

    return {
      gateway: 'razorpay',
      key: this.keyId,
      order_id: order.gatewayOrderId,
      amount: order.amount * 100,
      currency: 'INR',
      name: 'ISS Merchant',
      description: `Payment for Order ${params.orderId}`,
      image: 'https://app.pasuai.online/logo.png',
      prefill: {
        name: customerName,
        email: customerEmail,
        contact: customerPhone,
      },
      notes: {
        qrId,
        orderId: params.orderId,
      },
      theme: {
        color: '#3b82f6',
      },
      callback_url: callbackUrl,
      redirect: true,
      modal: {
        ondismiss: function() {
          console.log('Razorpay checkout dismissed');
        },
      },
    };
  }
}

module.exports = RazorpayAdapter;
