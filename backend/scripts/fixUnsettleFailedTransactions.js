/**
 * Fix Script: Unsettle transactions from failed settlements
 * 
 * This script finds all failed settlements and marks their transactions
 * as unsettled so merchants can request new settlements.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

const Settlement = require('../src/models/Settlement');
const Transaction = require('../src/models/Transaction');
const Merchant = require('../src/models/Merchant');

async function fixUnsettleFailedTransactions() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find all failed settlements
    const failedSettlements = await Settlement.find({ status: 'failed' });
    console.log(`\n📊 Found ${failedSettlements.length} failed settlements\n`);

    let totalTransactionsFixed = 0;
    let merchantBalanceUpdates = {};

    for (const settlement of failedSettlements) {
      console.log(`\n🔄 Processing settlement: ${settlement.settlementRef}`);
      console.log(`   Status: ${settlement.status}`);
      console.log(`   Amount: ₹${settlement.netAmount}`);
      console.log(`   Merchant: ${settlement.merchantId}`);

      // Find transactions linked to this settlement
      const transactions = await Transaction.find({
        _id: { $in: settlement.transactions },
        isSettled: true, // Only unsettle if currently marked as settled
      });

      console.log(`   Transactions to unsettle: ${transactions.length}`);

      if (transactions.length > 0) {
        // Unsettle transactions
        const result = await Transaction.updateMany(
          { _id: { $in: transactions.map(t => t._id) } },
          { 
            isSettled: false, 
            settledAt: null, 
            settlementId: null 
          }
        );

        console.log(`   ✅ Unsettled ${result.modifiedCount} transactions`);
        totalTransactionsFixed += result.modifiedCount;

        // Track merchant balance adjustments needed
        const merchantId = settlement.merchantId.toString();
        if (!merchantBalanceUpdates[merchantId]) {
          merchantBalanceUpdates[merchantId] = {
            totalSettled: 0,
            pendingSettlement: 0,
          };
        }
        merchantBalanceUpdates[merchantId].totalSettled -= settlement.netAmount;
        merchantBalanceUpdates[merchantId].pendingSettlement += settlement.netAmount;
      }
    }

    console.log(`\n\n📊 SUMMARY:`);
    console.log(`   Total transactions unsettled: ${totalTransactionsFixed}`);
    console.log(`   Merchants affected: ${Object.keys(merchantBalanceUpdates).length}`);

    // Update merchant balances
    console.log(`\n💰 Updating merchant balances...\n`);
    for (const [merchantId, adjustments] of Object.entries(merchantBalanceUpdates)) {
      const merchant = await Merchant.findById(merchantId);
      if (merchant) {
        await Merchant.findByIdAndUpdate(merchantId, {
          $inc: {
            totalSettled: adjustments.totalSettled,
            pendingSettlement: adjustments.pendingSettlement,
          },
        });
        console.log(`   ✅ ${merchant.merchantId} (${merchant.businessName})`);
        console.log(`      Total Settled: ${adjustments.totalSettled < 0 ? '' : '+'}₹${adjustments.totalSettled}`);
        console.log(`      Pending Settlement: +₹${adjustments.pendingSettlement}`);
      }
    }

    console.log(`\n✨ Fix completed successfully!\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

fixUnsettleFailedTransactions();
