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

  // ─── Razorpay QR Code API ─────────────────────────────────────────────────

  /**
   * Create a Razorpay UPI QR Code
   * Returns a UPI QR that opens directly in UPI apps (no browser/redirect warning)
   *
   * @param {Object} params
   * @param {String} params.name         - Display name on QR (merchant name)
   * @param {String} params.description  - QR label / description
   * @param {String} params.usage        - 'single_use' | 'multiple_use'
   * @param {Number|null} params.amount  - Fixed amount in rupees (null = open amount)
   * @param {String} params.internalQrId - Our internal QR ID stored in notes
   * @param {Number|null} params.closeBy - Unix timestamp for expiry (null = no expiry)
   */
  async createRazorpayQR({ name, description, usage = 'multiple_use', amount = null, internalQrId, closeBy = null }) {
    try {
      const payload = {
        type: 'upi_qr',
        name,
        usage,
        fixed_amount: amount ? 1 : 0,
        payment_amount: amount ? Math.round(amount * 100) : undefined, // paise
        description,
        customer_id: undefined, // optional
        close_by: closeBy || undefined,
        notes: {
          internal_qr_id: internalQrId,
        },
      };

      // Remove undefined fields
      Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

      const qr = await this.client.qrCode.create(payload);

      logger.info(`Razorpay QR created: ${qr.id} for internal QR ${internalQrId}`);

      return {
        razorpayQrId: qr.id,
        imageUrl: qr.image_url,       // Hosted PNG URL — use directly
        upiLink: qr.payment_url,       // upi://pay?... deep link
        status: qr.status,
        closeBy: qr.close_by ? new Date(qr.close_by * 1000) : null,
        rawResponse: qr,
      };
    } catch (error) {
      logger.error(`Razorpay QR creation failed: ${error.message}`);
      throw new Error(`Razorpay QR creation failed: ${error.message}`);
    }
  }

  /**
   * Close/deactivate a Razorpay QR Code
   * @param {String} razorpayQrId - Razorpay QR ID (e.g., qr_xxx)
   */
  async closeRazorpayQR(razorpayQrId) {
    try {
      const qr = await this.client.qrCode.close(razorpayQrId);
      logger.info(`Razorpay QR closed: ${razorpayQrId}`);
      return { success: true, status: qr.status };
    } catch (error) {
      logger.error(`Razorpay QR close failed for ${razorpayQrId}: ${error.message}`);
      throw new Error(`Razorpay QR close failed: ${error.message}`);
    }
  }

  /**
   * Fetch all payments received on a Razorpay QR Code
   * @param {String} razorpayQrId
   */
  async fetchQRPayments(razorpayQrId) {
    try {
      const payments = await this.client.qrCode.fetchAllPayments(razorpayQrId);
      return payments;
    } catch (error) {
      logger.error(`Razorpay QR fetch payments failed: ${error.message}`);
      throw new Error(`Razorpay QR fetch payments failed: ${error.message}`);
    }
  }
}

module.exports = RazorpayAdapter;
