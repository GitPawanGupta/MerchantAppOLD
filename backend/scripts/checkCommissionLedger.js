#!/usr/bin/env node

/**
 * Check Commission Ledger from Database
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

async function main() {
  console.log('========================================');
  console.log('  COMMISSION LEDGER CHECK');
  console.log('========================================\n');

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const User = require('../src/models/User');
    const Merchant = require('../src/models/Merchant');
    const Transaction = require('../src/models/Transaction');
    const Settlement = require('../src/models/Settlement');
    const { CommissionLedger } = require('../src/models/Commission');
    
    // Find merchant
    const user = await User.findOne({ email: 'erpawan459@gmail.com' });
    const merchant = await Merchant.findOne({ userId: user._id });

    console.log(`[MERCHANT: ${merchant.businessName} (${merchant.merchantId})]`);
    console.log();

    // Check latest settlement
    const latestSettlement = await Settlement.findOne({ 
      merchantId: merchant._id,
      status: 'success'
    }).sort({ completedAt: -1 });

    if (latestSettlement) {
      console.log('[LATEST SUCCESSFUL SETTLEMENT]');
      console.log(`  Ref: ${latestSettlement.settlementRef}`);
      console.log(`  Amount: ₹${latestSettlement.netAmount}`);
      console.log(`  Commission: ₹${latestSettlement.totalCommission}`);
      console.log(`  Status: ${latestSettlement.status}`);
      console.log(`  Transactions: ${latestSettlement.transactionCount}`);
      console.log(`  Completed: ${latestSettlement.completedAt.toLocaleString('en-IN')}`);
      console.log();

      // Check commission ledger entries for this settlement
      const ledgerEntries = await CommissionLedger.find({
        settlementId: latestSettlement._id
      }).populate('transactionId', 'orderId amount commissionAmount');

      console.log(`[COMMISSION LEDGER ENTRIES FOR THIS SETTLEMENT]`);
      console.log(`  Count: ${ledgerEntries.length}`);
      
      if (ledgerEntries.length > 0) {
        let totalCommission = 0;
        ledgerEntries.forEach((entry, i) => {
          console.log(`  ${i + 1}. Transaction: ${entry.transactionId?.orderId}`);
          console.log(`     Commission: ₹${entry.commissionAmount}`);
          console.log(`     Status: ${entry.status}`);
          totalCommission += entry.commissionAmount;
        });
        console.log(`  Total Commission in Ledger: ₹${totalCommission.toFixed(2)}`);
      } else {
        console.log('  ⚠️  No commission ledger entries found!');
        console.log('  This means commission was NOT recorded for this settlement');
      }
      console.log();
    }

    // Get all commission ledger stats
    const allLedger = await CommissionLedger.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalCommission: { $sum: '$commissionAmount' }
        }
      }
    ]);

    console.log('[ALL COMMISSION LEDGER STATS]');
    let grandTotal = 0;
    allLedger.forEach(stat => {
      console.log(`  ${stat._id}: ${stat.count} entries, ₹${stat.totalCommission.toFixed(2)}`);
      if (stat._id === 'settled') {
        grandTotal = stat.totalCommission;
      }
    });
    console.log(`  Total Settled Commission: ₹${grandTotal.toFixed(2)}`);
    console.log();

    // Calculate expected commission from all settled transactions
    const allSettledTx = await Transaction.find({
      merchantId: merchant._id,
      status: 'success',
      isSettled: true
    });

    let expectedCommission = 0;
    allSettledTx.forEach(tx => {
      expectedCommission += tx.commissionAmount;
    });

    console.log('[EXPECTED VS ACTUAL COMMISSION]');
    console.log(`  Total Settled Transactions: ${allSettledTx.length}`);
    console.log(`  Expected Commission (from transactions): ₹${expectedCommission.toFixed(2)}`);
    console.log(`  Actual Commission (in ledger): ₹${grandTotal.toFixed(2)}`);
    
    if (Math.abs(expectedCommission - grandTotal) < 0.01) {
      console.log(`  ✅ Match! Commission is correct`);
    } else {
      console.log(`  ⚠️  Mismatch! Difference: ₹${(expectedCommission - grandTotal).toFixed(2)}`);
    }
    console.log();

    console.log('========================================');
    console.log('  ✅ CHECK COMPLETE');
    console.log('========================================');

    await mongoose.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error(error.stack);
    await mongoose.disconnect();
    process.exit(1);
  }
}

main();
