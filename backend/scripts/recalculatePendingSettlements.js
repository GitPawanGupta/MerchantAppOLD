/**
 * Recalculate Pending Settlements Script
 * 
 * Updates grossAmount, totalCommission, and netAmount for pending settlements
 * based on their linked transactions
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

const Settlement = require('../src/models/Settlement');
const Transaction = require('../src/models/Transaction');

async function recalculatePendingSettlements() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const pendingSettlements = await Settlement.find({ status: 'pending' });
    console.log(`📊 Found ${pendingSettlements.length} pending settlements\n`);

    for (const settlement of pendingSettlements) {
      console.log(`\n🔄 Processing: ${settlement.settlementRef}`);
      console.log('─'.repeat(60));

      // Get all transactions for this settlement
      const transactions = await Transaction.find({
        _id: { $in: settlement.transactions },
      });

      // Recalculate amounts
      const grossAmount = transactions.reduce((sum, t) => sum + t.amount, 0);
      const totalCommission = transactions.reduce((sum, t) => sum + (t.commissionAmount || 0), 0);
      const netAmount = transactions.reduce((sum, t) => sum + (t.settlementAmount || 0), 0);

      console.log('📈 Current Values:');
      console.log(`   Gross: ₹${settlement.grossAmount}`);
      console.log(`   Commission: ₹${settlement.totalCommission}`);
      console.log(`   Net: ₹${settlement.netAmount}`);

      console.log('\n📊 Calculated Values:');
      console.log(`   Gross: ₹${grossAmount}`);
      console.log(`   Commission: ₹${totalCommission}`);
      console.log(`   Net: ₹${netAmount}`);

      const needsUpdate = 
        Math.abs(settlement.grossAmount - grossAmount) > 0.01 ||
        Math.abs(settlement.totalCommission - totalCommission) > 0.01 ||
        Math.abs(settlement.netAmount - netAmount) > 0.01;

      if (needsUpdate) {
        await Settlement.findByIdAndUpdate(settlement._id, {
          grossAmount,
          totalCommission,
          netAmount,
        });
        console.log('\n✅ Settlement updated');
      } else {
        console.log('\n✓ Settlement already correct');
      }
    }

    console.log('\n\n✨ Recalculation completed!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

recalculatePendingSettlements();
