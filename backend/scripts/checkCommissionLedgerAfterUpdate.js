require('dotenv').config();
const mongoose = require('mongoose');
const { CommissionLedger } = require('../src/models/Commission');
const Transaction = require('../src/models/Transaction');

async function checkCommissionLedger() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');

    // Find the transaction we just updated
    const tx = await Transaction.findOne({ orderId: 'ORD_MR9O3E9G_0A15FC85' });
    
    if (!tx) {
      console.log('Transaction not found');
      return;
    }

    console.log(`📝 Transaction: ${tx.orderId}`);
    console.log(`   Status: ${tx.status}`);
    console.log(`   Commission Amount: ₹${tx.commissionAmount}\n`);

    // Check if commission ledger entry exists
    const ledgerEntry = await CommissionLedger.findOne({ transactionId: tx._id })
      .populate('merchantId', 'merchantId businessName');

    if (ledgerEntry) {
      console.log('✅ Commission Ledger Entry Found:');
      console.log(`   ID: ${ledgerEntry._id}`);
      console.log(`   Transaction Amount: ₹${ledgerEntry.transactionAmount}`);
      console.log(`   Commission Rate: ${ledgerEntry.commissionRate}%`);
      console.log(`   Commission Amount: ₹${ledgerEntry.commissionAmount}`);
      console.log(`   Net Settlement: ₹${ledgerEntry.netSettlementAmount}`);
      console.log(`   Status: ${ledgerEntry.status}`);
      console.log(`   Merchant: ${ledgerEntry.merchantId.businessName} (${ledgerEntry.merchantId.merchantId})`);
      console.log(`   Created: ${ledgerEntry.createdAt}`);
    } else {
      console.log('❌ No commission ledger entry found for this transaction');
    }

    // Check total admin commission
    console.log('\n💰 Total Admin Commission:');
    const stats = await CommissionLedger.aggregate([
      { $match: { status: 'pending' } },
      {
        $group: {
          _id: null,
          totalCommission: { $sum: '$commissionAmount' },
          count: { $sum: 1 }
        }
      }
    ]);

    if (stats.length > 0) {
      console.log(`   Total Pending: ₹${stats[0].totalCommission}`);
      console.log(`   Transaction Count: ${stats[0].count}`);
    } else {
      console.log('   No pending commission entries');
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

checkCommissionLedger();
