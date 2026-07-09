/**
 * Fix Settlement Amounts Script
 * 
 * Recalculates settlementAmount for all transactions where:
 * settlementAmount !== (amount - commissionAmount)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

const Transaction = require('../src/models/Transaction');

async function fixSettlementAmounts() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find all success transactions
    const transactions = await Transaction.find({ status: 'success' });
    console.log(`📊 Found ${transactions.length} successful transactions\n`);

    let fixedCount = 0;
    const issues = [];

    for (const tx of transactions) {
      const expectedSettlement = tx.amount - (tx.commissionAmount || 0);
      const actualSettlement = tx.settlementAmount || 0;

      // Check if there's a mismatch (with floating point tolerance)
      if (Math.abs(expectedSettlement - actualSettlement) > 0.01) {
        issues.push({
          orderId: tx.orderId,
          amount: tx.amount,
          commission: tx.commissionAmount,
          expectedSettlement,
          actualSettlement,
          difference: actualSettlement - expectedSettlement,
        });

        // Fix the settlement amount
        await Transaction.findByIdAndUpdate(tx._id, {
          settlementAmount: expectedSettlement,
        });
        fixedCount++;
      }
    }

    if (issues.length > 0) {
      console.log('🔧 Fixed Transactions:\n');
      console.log('─'.repeat(80));
      issues.forEach(issue => {
        console.log(`OrderID: ${issue.orderId}`);
        console.log(`  Amount: ₹${issue.amount}`);
        console.log(`  Commission: ₹${issue.commission}`);
        console.log(`  Expected Settlement: ₹${issue.expectedSettlement}`);
        console.log(`  Actual Settlement: ₹${issue.actualSettlement}`);
        console.log(`  Difference: ₹${issue.difference}`);
        console.log('─'.repeat(80));
      });
    }

    console.log(`\n✨ Fix completed!`);
    console.log(`   Total transactions checked: ${transactions.length}`);
    console.log(`   Fixed: ${fixedCount}`);
    console.log(`   Correct: ${transactions.length - fixedCount}\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

fixSettlementAmounts();
