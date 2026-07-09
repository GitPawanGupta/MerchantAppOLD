const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

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
    isPrimary:  { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    verifiedAt: { type: Date },
  }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
    },
    phone: {
      type: String,
      required: [true, 'Phone is required'],
      unique: true,
      trim: true,
      match: [/^[6-9]\d{9}$/, 'Invalid Indian phone number'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 8,
      select: false, // Never returned in queries by default
    },
    role: {
      type: String,
      enum: ['admin', 'merchant'],
      default: 'merchant',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    isPhoneVerified: {
      type: Boolean,
      default: false,
    },
    lastLogin: {
      type: Date,
    },
    passwordChangedAt: {
      type: Date,
    },
    refreshToken: {
      type: String,
      select: false,
    },
    passwordResetToken: {
      type: String,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
      select: false,
    },
    bankAccounts: [bankAccountSchema],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Indexes ─────────────────────────────────────────────────────────────────
// email and phone are already indexed via unique:true in the schema definition
userSchema.index({ role: 1 });

// ─── Hash password before saving ─────────────────────────────────────────────
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  if (!this.isNew) this.passwordChangedAt = new Date();
  next();
});

// ─── Instance Methods ─────────────────────────────────────────────────────────
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.changedPasswordAfter = function (jwtIssuedAt) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
    return jwtIssuedAt < changedTimestamp;
  }
  return false;
};

// ─── Virtual: Merchant profile ────────────────────────────────────────────────
userSchema.virtual('merchantProfile', {
  ref: 'Merchant',
  localField: '_id',
  foreignField: 'userId',
  justOne: true,
});

const User = mongoose.model('User', userSchema);
module.exports = User;
