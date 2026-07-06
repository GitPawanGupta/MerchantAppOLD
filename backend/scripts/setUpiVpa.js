/**
 * Set UPI VPA on merchant and regenerate all QR codes with UPI deep links
 * Run: node scripts/setUpiVpa.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const QRCodeLib = require('qrcode');

const connectDB = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ MongoDB connected');
};

const qrSchema = new mongoose.Schema({}, { strict: false });
const QRModel = mongoose.model('QRCode', qrSchema, 'qrcodes');

const merchantSchema = new mongoose.Schema({}, { strict: false });
const MerchantModel = mongoose.model('Merchant', merchantSchema, 'merchants');

const generateQRImage = async (data) => {
  return QRCodeLib.toDataURL(data, {
    errorCorrectionLevel: 'H',
    type: 'image/png',
    width: 400,
    margin: 2,
    color: { dark: '#000000', light: '#FFFFFF' },
  });
};

const buildUpiDeepLink = (upiVpa, merchantName, amount = null) => {
  const params = new URLSearchParams({
    pa: upiVpa,
    pn: merchantName || 'Merchant',
    cu: 'INR',
    tn: 'Payment via ISS',
  });
  if (amount) params.append('am', amount.toString());
  return `upi://pay?${params.toString()}`;
};

const run = async () => {
  await connectDB();

  // MER000001 — Pasu AI
  const UPI_VPA = 'mer000001.387349@ybl';
  const MERCHANT_ID = 'MER000001';
  const MERCHANT_NAME = 'Pasu AI';

  // 1. Update merchant bankDetails with upiVpa
  await MerchantModel.updateOne(
    { merchantId: MERCHANT_ID },
    { $set: { 'bankDetails.upiVpa': UPI_VPA } }
  );
  console.log(`✅ Merchant ${MERCHANT_ID} — upiVpa set to: ${UPI_VPA}`);

  // 2. Find all QRs for this merchant and update with UPI deep link
  const merchant = await MerchantModel.findOne({ merchantId: MERCHANT_ID });
  const qrs = await QRModel.find({ merchantId: merchant._id });
  console.log(`\n📋 Found ${qrs.length} QR codes to update`);

  let updated = 0, skipped = 0;

  for (const qr of qrs) {
    const amount = qr.fixedAmount || null;
    const newUrl = buildUpiDeepLink(UPI_VPA, MERCHANT_NAME, amount);

    // Skip if already a UPI deep link
    if (qr.paymentUrl && qr.paymentUrl.startsWith('upi://')) {
      console.log(`⏭️  Skipped (already UPI): ${qr.qrId}`);
      skipped++;
      continue;
    }

    console.log(`🔄 Updating: ${qr.qrId}`);
    console.log(`   Old: ${qr.paymentUrl}`);
    console.log(`   New: ${newUrl}`);

    // Regenerate QR image with UPI deep link
    const newImage = await generateQRImage(newUrl);

    await QRModel.updateOne(
      { _id: qr._id },
      {
        $set: {
          paymentUrl: newUrl,
          upiVpa: UPI_VPA,
          qrImageBase64: newImage,
        },
      }
    );
    console.log(`   ✅ Done`);
    updated++;
  }

  console.log('\n─────────────────────────────────');
  console.log(`✅ Updated : ${updated}`);
  console.log(`⏭️  Skipped : ${skipped}`);
  console.log('─────────────────────────────────');
  console.log('\n🎉 All QR codes now use UPI deep links!');
  console.log('   Scanning these QRs will directly open payment apps.');

  await mongoose.disconnect();
  console.log('🔌 Done!');
};

run().catch(console.error);
