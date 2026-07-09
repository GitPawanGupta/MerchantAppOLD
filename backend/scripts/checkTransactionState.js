#!/usr/bin/env node

/**
 * Check Transaction State - See if transactions are marked as settled
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

async function main() {
  console.log('========================================');
  console.log('  CHECK TRANSACTION STATE');
  console.log('========================================\n');

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const User = require('../src/models/User');
    const Merchant = require('../src/models/Merchant');
    const Transaction = require('../src/models/Transaction');
    const Settlement = require('../src/models/Settlement');
    
    // Find merchant
    const user = await User.findOne({ email: 'erpawan459@gmail.com' });
    const merchant = await Merchant.findOne({ userId: user._id });

    console.log(`[MERCHANT: ${merchant.businessName} (${merchant.merchantId})]`);
    console.log(`  Total Collected: ₹${merchant.totalCollected}`);
    console.log(`  Total Settled: ₹${merchant.totalSettled}`);
    console.log(`  Pending Settlement: ₹${merchant.pendingSettlement}`);
    console.log();

    // Check all transactions
    const allTx = await Transaction.find({ 
      merchantId: merchant._id,
      status: 'success'
    }).sort({ createdAt: -1 });

    console.log(`[ALL SUCCESS TRANSACTIONS: ${allTx.length}]`);
    
    const settled = allTx.filter(t => t.isSettled);
    const unsettled = allTx.filter(t => !t.isSettled);
    
    console.log(`  Settled: ${settled.length}`);
    console.log(`  Unsettled: ${unsettled.length}`);
    console.log();

    if (unsettled.length > 0) {
      console.log('[UNSETTLED TRANSACTIONS]');
      let totalUnsettled = 0;
      unsettled.forEach(t => {
        console.log(`  ${t.orderId}`);
        console.log(`    Amount: ₹${t.amount} (Settlement: ₹${t.settlementAmount})`);
        console.log(`    isSettled: ${t.isSettled}`);
        console.log(`    settlementId: ${t.settlementId || 'null'}`);
        console.log();
        totalUnsettled += t.settlementAmount;
      });
      console.log(`  Total Unsettled Amount: ₹${totalUnsettled}`);
    } else {
      console.log('ℹ️  No unsettled transactions');
    }
    console.log();

    // Check settlements
    const allSettlements = await Settlement.find({ 
      merchantId: merchant._id 
    }).sort({ createdAt: -1 });

    console.log(`[ALL SETTLEMENTS: ${allSettlements.length}]`);
    allSettlements.forEach(s => {
      console.log(`  ${s.settlementRef}`);
      console.log(`    Status: ${s.status}`);
      console.log(`    Amount: ₹${s.netAmount}`);
      console.log(`    Transactions: ${s.transactionCount}`);
      console.log(`    Created: ${s.initiatedAt.toLocaleString('en-IN')}`);
      if (s.completedAt) {
        console.log(`    Completed: ${s.completedAt.toLocaleString('en-IN')}`);
      }
      console.log();
    });

    console.log('========================================');
    console.log('  ✅ CHECK COMPLETE');
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
