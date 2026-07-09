#!/usr/bin/env node

/**
 * Debug Dashboard API - Check pending settlement count logic
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

async function main() {
  console.log('========================================');
  console.log('  DEBUG DASHBOARD API');
  console.log('========================================\n');

  try {
    // Connect to DB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const Merchant = require('../src/models/Merchant');
    const Settlement = require('../src/models/Settlement');
    
    // Find merchant by email
    const User = require('../src/models/User');
    const user = await User.findOne({ email: 'erpawan459@gmail.com' });
    if (!user) {
      console.log('❌ User not found');
      process.exit(1);
    }

    const merchant = await Merchant.findOne({ userId: user._id });
    if (!merchant) {
      console.log('❌ Merchant not found');
      process.exit(1);
    }

    console.log(`[MERCHANT INFO]`);
    console.log(`  Name: ${merchant.businessName}`);
    console.log(`  ID: ${merchant.merchantId}`);
    console.log(`  MongoDB _id: ${merchant._id}`);
    console.log();

    // Check pending settlements count (same query as in getDashboardSummary)
    const pendingSettlementCount = await Settlement.countDocuments({
      merchantId: merchant._id,
      status: 'pending',
    });

    console.log(`[SETTLEMENT COUNT QUERY]`);
    console.log(`  Query: { merchantId: ${merchant._id}, status: 'pending' }`);
    console.log(`  Result: ${pendingSettlementCount}`);
    console.log(`  Expected hasPendingSettlement: ${pendingSettlementCount > 0}`);
    console.log();

    // List all pending settlements
    const pendingSettlements = await Settlement.find({
      merchantId: merchant._id,
      status: 'pending',
    }).select('settlementRef netAmount status transactionCount createdAt');

    console.log(`[PENDING SETTLEMENTS]`);
    if (pendingSettlements.length === 0) {
      console.log(`  None found`);
    } else {
      pendingSettlements.forEach(s => {
        console.log(`  - ${s.settlementRef}`);
        console.log(`    Amount: ₹${s.netAmount}`);
        console.log(`    Transactions: ${s.transactionCount}`);
        console.log(`    Created: ${s.createdAt}`);
        console.log();
      });
    }

    console.log('========================================');
    console.log('  ✅ DEBUG COMPLETE');
    console.log('========================================');

    await mongoose.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('❌ ERROR:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

main();
