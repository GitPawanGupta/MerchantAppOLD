const mongoose = require('mongoose');

const bankDetailsSchema = new mongoose.Schema(
  {
    accountHolderName: { type: String, required: true, trim: true },
    accountNumber: { type: String, required: true, trim: true },
    ifscCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      match: [/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC code'],
    },
    bankName: { type: String, required: true, trim: true },
    accountType: {
      type: String,
      enum: ['savings', 'current'],
      default: 'current',
    },
    isVerified: { type: Boolean, default: false },
    verifiedAt: { type: Date },
    upiVpa: { type: String, trim: true, default: null },
  },
);

const bankAccountSchema = new mongoose.Schema(
  {
    accountHolderName: { type: String, required: true, trim: true },
    accountNumber: { type: String, required: true, trim: true },
    ifscCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      match: [/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC code'],
    },
    bankName: { type: String, required: true, trim: true },
    accountType: {
      type: String,
      enum: ['savings', 'current'],
      default: 'current',
    },
    isPrimary: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    verifiedAt: { type: Date },
  }
);


const kycSchema = new mongoose.Schema(
  {
    panNumber: {
      type: String,
      trim: true,
      uppercase: true,
      match: [/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN number'],
    },
    gstNumber: {
      type: String,
      trim: true,
      uppercase: true,
    },
    aadharNumber: {
      type: String,
      trim: true,
    },
    businessType: {
      type: String,
      enum: ['individual', 'proprietorship', 'partnership', 'pvt_ltd', 'ltd', 'llp', 'other'],
    },
    panDoc: { type: String }, // file path or URL
    aadharDoc: { type: String },
    gstDoc: { type: String },
    status: {
      type: String,
      enum: ['pending', 'submitted', 'under_review', 'approved', 'rejected'],
      default: 'pending',
    },
    rejectionReason: { type: String },
    verifiedAt: { type: Date },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
);

const merchantSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    merchantId: {
      type: String,
      unique: true,
      // Auto-generated: MER_XXXXX
    },
    businessName: {
      type: String,
      required: [true, 'Business name is required'],
      trim: true,
      maxlength: 200,
    },
    businessCategory: {
      type: String,
      trim: true,
      enum: [
        'retail',
        'restaurant',
        'grocery',
        'healthcare',
        'education',
        'services',
        'ecommerce',
        'travel',
        'entertainment',
        'utility',
        'other',
      ],
      default: 'other',
    },
    businessAddress: {
      street: String,
      city: String,
      state: String,
      pincode: String,
      country: { type: String, default: 'India' },
    },
    logo: { type: String }, // URL
    website: { type: String },
    kyc: { type: kycSchema, default: {} },
    bankDetails: { type: bankDetailsSchema },
    bankAccounts: [bankAccountSchema],

    // Commission config (can override default)
    commissionRate: {
      type: Number,
      default: null, // null = use global default
      min: 0,
      max: 100,
    },

    // Status
    status: {
      type: String,
      enum: ['pending', 'active', 'suspended', 'closed'],
      default: 'pending',
    },

    // ─── Razorpay Partner Technology ─────────────────────────────────────────
    // Set when merchant completes OAuth flow to connect their Razorpay account
    razorpayLinkedAccountId: {
      type: String,
      default: null,  // e.g. "acc_XXXXXXXXXX" — merchant's Razorpay account
    },
    razorpayAccessToken: {
      type: String,
      default: null,  // OAuth access token for API calls on behalf of merchant
    },
    razorpayRefreshToken: {
      type: String,
      default: null,
    },
    // Access token expiry (short-lived, ~2 hours)
    razorpayTokenExpiresAt: {
      type: Date,
      default: null,
    },
    // Refresh token expiry (180 days per Razorpay docs)
    razorpayRefreshTokenExpiresAt: {
      type: Date,
      default: null,
    },
    // Temporary CSRF nonce stored during OAuth initiation, cleared after callback
    razorpayOAuthState: {
      type: String,
      default: null,
    },
    // true when refresh token has expired — merchant must re-do OAuth
    requiresReAuth: {
      type: Boolean,
      default: false,
    },
    // ─── Linked Account (Option C — API-based onboarding) ─────────────────────
    // Stakeholder ID created via POST /v2/accounts/:id/stakeholders
    razorpayStakeholderId: {
      type: String,
      default: null,
    },
    // Razorpay account lifecycle status: created → under_review → activated/suspended
    razorpayAccountStatus: {
      type: String,
      enum: ['created', 'under_review', 'activated', 'suspended', null],
      default: null,
    },
    isRazorpayLinked: {
      type: Boolean,
      default: false, // true once merchant completes OAuth connect
    },
    razorpayLinkedAt: {
      type: Date,
      default: null,
    },

    // ─── Push Notifications (FCM) ────────────────────────────────────────────
    // Device token registered by the Flutter app on login / app open.
    // Updated automatically when the app refreshes its FCM token.
    fcmToken: {
      type: String,
      default: null,
    },
    fcmTokenUpdatedAt: {
      type: Date,
      default: null,
    },

    // Wallet / balance tracking
    totalCollected: { type: Number, default: 0 },   // Total payments received
    totalSettled: { type: Number, default: 0 },      // Total amount settled
    totalCommission: { type: Number, default: 0 },   // Total commission deducted
    pendingSettlement: { type: Number, default: 0 },  // Amount yet to be settled

    // Metadata
    notes: { type: String },
    onboardedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Indexes ─────────────────────────────────────────────────────────────────
// userId and merchantId already indexed via unique:true in schema definition
merchantSchema.index({ status: 1 });
merchantSchema.index({ 'kyc.status': 1 });

// ─── Auto-generate merchantId and sync bankDetails ────────────────────────────
merchantSchema.pre('save', async function (next) {
  if (this.isNew && !this.merchantId) {
    const count = await mongoose.model('Merchant').countDocuments();
    this.merchantId = `MER${String(count + 1).padStart(6, '0')}`;
  }

  // Sync bankDetails with primary account
  if (this.bankAccounts && this.bankAccounts.length > 0) {
    const primary = this.bankAccounts.find(acc => acc.isPrimary) || this.bankAccounts[0];
    this.bankDetails = {
      accountHolderName: primary.accountHolderName,
      accountNumber: primary.accountNumber,
      ifscCode: primary.ifscCode,
      bankName: primary.bankName,
      accountType: primary.accountType,
      isVerified: primary.isVerified,
      verifiedAt: primary.verifiedAt
    };
  }
  next();
});

// ─── Virtuals ─────────────────────────────────────────────────────────────────
merchantSchema.virtual('qrCodes', {
  ref: 'QRCode',
  localField: '_id',
  foreignField: 'merchantId',
});

const Merchant = mongoose.model('Merchant', merchantSchema);
module.exports = Merchant;
