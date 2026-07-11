const admin = require('firebase-admin');
const path  = require('path');
const logger = require('../utils/logger');

// ─── Firebase Admin Initialization (singleton) ───────────────────────────────
let _initialized = false;

const _initFirebase = () => {
  if (_initialized) return;
  try {
    let credential;

    // Production: load from FIREBASE_SERVICE_ACCOUNT env variable (JSON string)
    // Development: load from local file
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      credential = admin.credential.cert(serviceAccount);
      logger.info('Firebase Admin SDK initializing from FIREBASE_SERVICE_ACCOUNT env var...');
    } else {
      const serviceAccountPath = path.join(
        __dirname,
        '../config/firebase-service-account.json'
      );
      // If file doesn't exist either, log clearly and bail
      const fs = require('fs');
      if (!fs.existsSync(serviceAccountPath)) {
        logger.error(
          'Firebase Admin SDK NOT initialized — FIREBASE_SERVICE_ACCOUNT env var is missing ' +
          'and firebase-service-account.json file not found. Push notifications will be disabled.'
        );
        return;
      }
      credential = admin.credential.cert(serviceAccountPath);
      logger.info('Firebase Admin SDK initializing from local service account file...');
    }

    admin.initializeApp({ credential });
    _initialized = true;
    logger.info('Firebase Admin SDK initialized successfully');
  } catch (err) {
    logger.error(`Firebase Admin init failed: ${err.message}`);
  }
};

// Initialize on module load
_initFirebase();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Format amount as Indian Rupees string — e.g. 1500 → "₹1,500.00"
 */
const formatAmount = (amount) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(amount);

/**
 * Format current date/time in IST — e.g. "10 Jul 2026, 03:45 PM"
 */
const formatDateTime = () =>
  new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day:    '2-digit',
    month:  'short',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
    hour12: true,
  });

// ─── Core send function ───────────────────────────────────────────────────────

/**
 * Send a single FCM notification to a device token.
 * Non-blocking — errors are logged, never thrown.
 *
 * @param {string} fcmToken  - Device FCM registration token
 * @param {object} payload   - { title, body, data }
 */
const sendToDevice = async (fcmToken, { title, body, data = {} }) => {
  if (!fcmToken) {
    logger.warn('notificationService.sendToDevice: no FCM token provided, skipping');
    return;
  }
  if (!_initialized) {
    logger.warn('notificationService.sendToDevice: Firebase not initialized, skipping');
    return;
  }

  try {
    const message = {
      token: fcmToken,

      // Android — high priority so it wakes the screen
      android: {
        priority: 'high',
        notification: {
          title,
          body,
          icon:  'ic_notification',   // drawable resource in the Android project
          color: '#1976D2',            // ISS brand blue
          sound: 'payment_received',   // custom sound (falls back to default)
          channelId: 'payment_alerts', // channel registered in Flutter
          clickAction: 'FLUTTER_NOTIFICATION_CLICK',
        },
      },

      // APNs (iOS)
      apns: {
        payload: {
          aps: {
            alert: { title, body },
            sound: 'payment_received.aiff',
            badge: 1,
            'content-available': 1,
          },
        },
        headers: {
          'apns-priority': '10',
        },
      },

      // Data payload — always delivered, even in background
      data: {
        ...Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, String(v)])
        ),
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
    };

    const response = await admin.messaging().send(message);
    logger.info(`FCM sent successfully — messageId: ${response} token: ${fcmToken.slice(0, 20)}...`);
  } catch (err) {
    // Log but never crash the payment flow
    logger.error(`FCM send failed: ${err.message} (token: ${fcmToken?.slice(0, 20)}...)`);
  }
};

// ─── Domain-specific notification builders ───────────────────────────────────

/**
 * Payment received via QR scan — primary notification.
 *
 * @param {string} fcmToken
 * @param {object} opts
 * @param {number} opts.amount          - Payment amount in INR
 * @param {string} opts.orderId         - Internal order ID
 * @param {string} opts.paymentMethod   - 'upi' | 'card' | etc.
 * @param {string} [opts.vpa]           - Customer UPI ID (optional)
 * @param {string} [opts.businessName]  - Merchant business name
 * @param {string} [opts.qrLabel]       - QR code label (optional)
 */
const sendPaymentReceivedNotification = async (fcmToken, opts) => {
  const {
    amount,
    orderId,
    paymentMethod = 'upi',
    vpa,
    businessName = 'Your Store',
    qrLabel,
  } = opts;

  const formattedAmount = formatAmount(amount);
  const timeStr         = formatDateTime();
  const methodLabel     = paymentMethod.toUpperCase();

  // Title — prominent, shows amount immediately
  const title = `💰 Payment Received — ${formattedAmount}`;

  // Body — relevant context in one line
  let bodyParts = [];
  if (vpa)      bodyParts.push(`From: ${vpa}`);
  if (qrLabel)  bodyParts.push(`QR: ${qrLabel}`);
  bodyParts.push(`via ${methodLabel}`);
  bodyParts.push(timeStr);

  const body = bodyParts.join('  •  ');

  await sendToDevice(fcmToken, {
    title,
    body,
    data: {
      type:          'payment_received',
      orderId,
      amount:        String(amount),
      paymentMethod,
      vpa:           vpa           || '',
      qrLabel:       qrLabel       || '',
      businessName,
      receivedAt:    new Date().toISOString(),
    },
  });
};

/**
 * Settlement status update notification.
 *
 * @param {string} fcmToken
 * @param {object} opts
 * @param {string} opts.status         - 'success' | 'failed' | 'processing'
 * @param {number} opts.amount         - Settlement amount in INR
 * @param {string} opts.settlementRef  - Settlement reference
 */
const sendSettlementNotification = async (fcmToken, opts) => {
  const { status, amount, settlementRef } = opts;

  const formattedAmount = formatAmount(amount);

  const config = {
    success:    { emoji: '✅', label: 'Credited',    msg: `${formattedAmount} has been credited to your bank account.` },
    failed:     { emoji: '❌', label: 'Failed',      msg: `Settlement of ${formattedAmount} could not be processed. Please contact support.` },
    processing: { emoji: '🔄', label: 'Processing',  msg: `Your settlement of ${formattedAmount} is being processed.` },
  };

  const { emoji, label, msg } = config[status] || config.processing;

  await sendToDevice(fcmToken, {
    title: `${emoji} Settlement ${label}`,
    body:  `${msg}  •  Ref: ${settlementRef}`,
    data: {
      type:          'settlement_update',
      status,
      amount:        String(amount),
      settlementRef,
    },
  });
};

module.exports = {
  sendPaymentReceivedNotification,
  sendSettlementNotification,
};
