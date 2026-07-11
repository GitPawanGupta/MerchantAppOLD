/**
 * Settings Model
 * Stores application-wide configuration including payment gateway settings
 */

const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    description: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      enum: ['payment', 'general', 'notification', 'security', 'other'],
      default: 'general',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
// Note: { key: 1 } index is already created by unique:true on the key field above
settingsSchema.index({ category: 1, isActive: 1 });

// ─── Static Methods ───────────────────────────────────────────────────────────

/**
 * Get setting value by key
 * @param {String} key - Setting key
 * @param {*} defaultValue - Default value if not found
 * @returns {Promise<*>} Setting value
 */
settingsSchema.statics.getValue = async function(key, defaultValue = null) {
  const setting = await this.findOne({ key, isActive: true });
  return setting ? setting.value : defaultValue;
};

/**
 * Set setting value
 * @param {String} key - Setting key
 * @param {*} value - Setting value
 * @param {Object} options - { description, category, updatedBy }
 * @returns {Promise<Object>} Updated setting
 */
settingsSchema.statics.setValue = async function(key, value, options = {}) {
  const { description, category, updatedBy } = options;
  
  return this.findOneAndUpdate(
    { key },
    {
      key,
      value,
      ...(description && { description }),
      ...(category && { category }),
      ...(updatedBy && { updatedBy }),
      isActive: true,
    },
    { upsert: true, new: true }
  );
};

/**
 * Initialize default settings
 */
settingsSchema.statics.initializeDefaults = async function() {
  const defaults = [
    {
      key: 'payment_gateway',
      value: {
        activeGateway: 'razorpay',
        failoverEnabled: false,
        autoSwitchOnFailure: false,
        lastSwitched: null,
        previousGateway: null,
      },
      description: 'Active payment gateway configuration',
      category: 'payment',
    },
    {
      key: 'commission_rate',
      value: {
        default: parseFloat(process.env.DEFAULT_COMMISSION_RATE || '2.0'),
        min: 0,
        max: 10,
      },
      description: 'Default commission rate for transactions',
      category: 'payment',
    },
    {
      key: 'settlement_threshold',
      value: {
        minimum: parseFloat(process.env.MIN_SETTLEMENT_AMOUNT || '100'),
        currency: 'INR',
      },
      description: 'Minimum settlement threshold',
      category: 'payment',
    },
  ];

  for (const setting of defaults) {
    await this.findOneAndUpdate(
      { key: setting.key },
      setting,
      { upsert: true, setDefaultsOnInsert: true }
    );
  }
};

const Settings = mongoose.model('Settings', settingsSchema);

module.exports = Settings;
