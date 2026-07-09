/**
 * Cleanup Script: Remove duplicate pending settlements
 * Keeps only the oldest pending settlement and deletes the rest
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

const Settlement = require('../src/models/Settlement');
const Transaction = require('../src/models/Transaction');

async function cleanupDuplicateSettlements() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find all pending settlements
    const pendingSettlements = await Settlement.find({ status: 'pending' })
      .sort({ createdAt: 1 }); // Oldest first

    console.log(`📊 Found ${pendingSettlements.length} pending settlements\n`);

    if (pendingSettlements.length <= 1) {
      console.log('✅ No duplicate settlements to clean up\n');
      return;
    }

    // Keep the oldest one, delete the rest
    const toKeep = pendingSettlements[0];
    const toDelete = pendingSettlements.slice(1);

    console.log(`✅ KEEPING: ${toKeep.settlementRef} (${toKeep.createdAt})`);
    console.log(`   Amount: ₹${toKeep.netAmount} | Transactions: ${toKeep.transactionCount}\n`);

    for (const settlement of toDelete) {
      console.log(`🗑️  DELETING: ${settlement.settlementRef} (${settlement.createdAt})`);
      console.log(`   Amount: ₹${settlement.netAmount} | Transactions: ${settlement.transactionCount}`);

      // Unlink transactions ONLY if they were linked to THIS settlement
      // (Don't unlink if they were re-linked to the kept settlement)
      await Transaction.updateMany(
        { 
          settlementId: settlement._id,
          // Only unlink if still pointing to this settlement being deleted
        },
        { settlementId: toKeep._id } // Re-link to the kept settlement instead
      );

      // Delete the settlement
      await Settlement.deleteOne({ _id: settlement._id });
      console.log(`   ✅ Deleted\n`);
    }

    console.log(`✨ Cleanup completed!`);
    console.log(`   Kept: 1 settlement`);
    console.log(`   Deleted: ${toDelete.length} duplicate(s)\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

cleanupDuplicateSettlements();
