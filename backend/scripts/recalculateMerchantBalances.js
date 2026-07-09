/**
 * Recalculate Merchant Balances Script
 * 
 * Fixes merchant totalSettled and pendingSettlement based on actual transaction data
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

const Merchant = require('../src/models/Merchant');
const Transaction = require('../src/models/Transaction');
const Settlement = require('../src/models/Settlement');

async function recalculateMerchantBalances() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const merchants = await Merchant.find({ status: { $in: ['active', 'suspended'] } });
    console.log(`📊 Found ${merchants.length} merchants to process\n`);

    for (const merchant of merchants) {
      console.log(`\n🔄 Processing: ${merchant.merchantId} - ${merchant.businessName}`);
      console.log('─'.repeat(60));

      // Get all successful transactions
      const allTransactions = await Transaction.find({
        merchantId: merchant._id,
        status: 'success',
      });

      // Calculate totals
      const totalCollected = allTransactions.reduce((sum, t) => sum + t.amount, 0);
      const totalCommission = allTransactions.reduce((sum, t) => sum + (t.commissionAmount || 0), 0);

      // Get settled transactions (isSettled: true)
      const settledTransactions = allTransactions.filter(t => t.isSettled);
      const totalSettled = settledTransactions.reduce((sum, t) => sum + (t.settlementAmount || 0), 0);

      // Calculate pending settlement
      const pendingSettlement = totalCollected - totalCommission - totalSettled;

      console.log('📈 Current Values:');
      console.log(`   Total Collected:    ₹${merchant.totalCollected}`);
      console.log(`   Total Settled:      ₹${merchant.totalSettled}`);
      console.log(`   Pending Settlement: ₹${merchant.pendingSettlement}`);
      console.log(`   Total Commission:   ₹${merchant.totalCommission || 0}`);

      console.log('\n📊 Calculated Values:');
      console.log(`   Total Collected:    ₹${totalCollected}`);
      console.log(`   Total Commission:   ₹${totalCommission}`);
      console.log(`   Total Settled:      ₹${totalSettled}`);
      console.log(`   Pending Settlement: ₹${pendingSettlement}`);

      console.log('\n🔍 Transaction Breakdown:');
      console.log(`   Total Transactions: ${allTransactions.length}`);
      console.log(`   Settled: ${settledTransactions.length}`);
      console.log(`   Unsettled: ${allTransactions.length - settledTransactions.length}`);

      // Check for pending settlements
      const pendingSettlements = await Settlement.find({
        merchantId: merchant._id,
        status: 'pending',
      });
      if (pendingSettlements.length > 0) {
        console.log(`\n⏳ Pending Settlements: ${pendingSettlements.length}`);
        pendingSettlements.forEach(s => {
          console.log(`   - ${s.settlementRef}: ₹${s.netAmount} (${s.transactionCount} txns)`);
        });
      }

      // Update merchant
      const needsUpdate = 
        merchant.totalCollected !== totalCollected ||
        merchant.totalSettled !== totalSettled ||
        merchant.pendingSettlement !== pendingSettlement ||
        (merchant.totalCommission || 0) !== totalCommission;

      if (needsUpdate) {
        await Merchant.findByIdAndUpdate(merchant._id, {
          totalCollected,
          totalSettled,
          pendingSettlement,
          totalCommission,
        });
        console.log('\n✅ Balances updated');
      } else {
        console.log('\n✓ Balances already correct');
      }
    }

    console.log('\n\n✨ Recalculation completed!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

recalculateMerchantBalances();
