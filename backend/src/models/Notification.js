const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    // Who receives this notification
    merchantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Merchant',
      required: false, // null = admin notification
    },
    // For admin-specific notifications
    isAdminNotification: {
      type: Boolean,
      default: false,
    },

    // Notification type
    type: {
      type: String,
      enum: [
        'payment_received',   // QR payment received
        'settlement_update',  // Settlement status changed
        'kyc_update',         // KYC approved/rejected
        'system',             // Generic system message
      ],
      required: true,
    },

    // Display content
    title: { type: String, required: true },
    body:  { type: String, required: true },

    // Optional reference data for deep-linking
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Read state
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: { type: Date },
  },
  { timestamps: true }
);

notificationSchema.index({ merchantId: 1, createdAt: -1 });
notificationSchema.index({ isAdminNotification: 1, createdAt: -1 });
notificationSchema.index({ merchantId: 1, isRead: 1 });

const Notification = mongoose.model('Notification', notificationSchema);
module.exports = Notification;
