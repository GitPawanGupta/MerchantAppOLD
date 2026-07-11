const Notification = require('../models/Notification');
const { successResponse } = require('../utils/apiResponse');

// ─── Merchant: list own notifications ────────────────────────────────────────
const getMerchantNotifications = async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const [notifications, unreadCount] = await Promise.all([
      Notification.find({ merchantId: req.merchant._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments({ merchantId: req.merchant._id, isRead: false }),
    ]);

    return successResponse(res, { notifications, unreadCount, page, limit });
  } catch (err) {
    next(err);
  }
};

// ─── Merchant: mark one or all as read ───────────────────────────────────────
const markMerchantNotificationsRead = async (req, res, next) => {
  try {
    const { id } = req.params; // optional — if missing, mark all

    if (id) {
      await Notification.findOneAndUpdate(
        { _id: id, merchantId: req.merchant._id },
        { isRead: true, readAt: new Date() }
      );
    } else {
      await Notification.updateMany(
        { merchantId: req.merchant._id, isRead: false },
        { isRead: true, readAt: new Date() }
      );
    }

    const unreadCount = await Notification.countDocuments({
      merchantId: req.merchant._id,
      isRead: false,
    });

    return successResponse(res, { unreadCount }, 'Marked as read');
  } catch (err) {
    next(err);
  }
};

// ─── Admin: list admin notifications ─────────────────────────────────────────
const getAdminNotifications = async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const [notifications, unreadCount] = await Promise.all([
      Notification.find({ isAdminNotification: true })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments({ isAdminNotification: true, isRead: false }),
    ]);

    return successResponse(res, { notifications, unreadCount, page, limit });
  } catch (err) {
    next(err);
  }
};

// ─── Admin: mark one or all as read ──────────────────────────────────────────
const markAdminNotificationsRead = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (id) {
      await Notification.findOneAndUpdate(
        { _id: id, isAdminNotification: true },
        { isRead: true, readAt: new Date() }
      );
    } else {
      await Notification.updateMany(
        { isAdminNotification: true, isRead: false },
        { isRead: true, readAt: new Date() }
      );
    }

    const unreadCount = await Notification.countDocuments({
      isAdminNotification: true,
      isRead: false,
    });

    return successResponse(res, { unreadCount }, 'Marked as read');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getMerchantNotifications,
  markMerchantNotificationsRead,
  getAdminNotifications,
  markAdminNotificationsRead,
};
