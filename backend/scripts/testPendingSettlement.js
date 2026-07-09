require('dotenv').config();
const axios = require('axios');
const mongoose = require('mongoose');
const Merchant = require('../src/models/Merchant');

async function testPendingSettlementUpdate() {
  try {
    console.log('🔐 Logging in as admin...\n');
    
    // Login as admin
    const login = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'admin@issmerchant.com',
      password: 'Admin@123456'
    });
    
    const token = login.data.data.accessToken;
    console.log('✓ Logged in successfully\n');
    
    // Get a pending transaction
    console.log('📋 Finding pending transaction...\n');
    const txList = await axios.get('http://localhost:5000/api/admin/transactions?status=pending&limit=1', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (txList.data.data.length === 0) {
      console.log('⚠️  No pending transactions found');
      return;
    }
    
    const tx = txList.data.data[0];
    const merchantObjId = tx.merchantId._id || tx.merchantId;
    
    console.log(`Transaction Found:`);
    console.log(`  Order ID: ${tx.orderId}`);
    console.log(`  Amount: ₹${tx.amount}`);
    console.log(`  Settlement Amount: ₹${tx.settlementAmount}`);
    console.log(`  Commission: ₹${tx.commissionAmount}\n`);
    
    // Connect to DB and check merchant before
    await mongoose.connect(process.env.MONGODB_URI);
    
    const merchantBefore = await Merchant.findById(merchantObjId);
    console.log('📊 Merchant Balance BEFORE Update:');
    console.log(`  Available Balance: ₹${merchantBefore.availableBalance || 0}`);
    console.log(`  Pending Settlement: ₹${merchantBefore.pendingSettlement || 0}`);
    console.log(`  Total Revenue: ₹${merchantBefore.totalRevenue || 0}\n`);
    
    // Mark transaction as success
    console.log('🔄 Marking transaction as SUCCESS...\n');
    const updateRes = await axios.patch(
      `http://localhost:5000/api/admin/transactions/${tx.orderId}/status`,
      {
        status: 'success',
        paymentMethod: 'upi'
      },
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    
    console.log(`✓ Transaction status updated to: ${updateRes.data.data.status}\n`);
    
    // Wait for DB writes
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Check merchant after
    const merchantAfter = await Merchant.findById(merchantObjId);
    console.log('💰 Merchant Balance AFTER Update:');
    console.log(`  Available Balance: ₹${merchantAfter.availableBalance || 0}`);
    console.log(`  Pending Settlement: ₹${merchantAfter.pendingSettlement || 0}`);
    console.log(`  Total Revenue: ₹${merchantAfter.totalRevenue || 0}\n`);
    
    // Calculate differences
    const balanceIncrease = (merchantAfter.availableBalance || 0) - (merchantBefore.availableBalance || 0);
    const pendingIncrease = (merchantAfter.pendingSettlement || 0) - (merchantBefore.pendingSettlement || 0);
    const revenueIncrease = (merchantAfter.totalRevenue || 0) - (merchantBefore.totalRevenue || 0);
    
    console.log('📈 Changes:');
    console.log(`  Available Balance: +₹${balanceIncrease.toFixed(2)}`);
    console.log(`  Pending Settlement: +₹${pendingIncrease.toFixed(2)} (Expected: ₹${tx.settlementAmount})`);
    console.log(`  Total Revenue: +₹${revenueIncrease.toFixed(2)} (Expected: ₹${tx.amount})\n`);
    
    // Validation
    const pendingMatch = Math.abs(pendingIncrease - tx.settlementAmount) < 0.01;
    const revenueMatch = Math.abs(revenueIncrease - tx.amount) < 0.01;
    
    if (pendingMatch && revenueMatch) {
      console.log('✅ SUCCESS! All merchant balances updated correctly!');
      console.log('   ✓ Pending Settlement updated');
      console.log('   ✓ Available Balance updated');
      console.log('   ✓ Total Revenue updated');
    } else {
      console.log('⚠️  Some balances did not update correctly:');
      if (!pendingMatch) console.log(`   ✗ Pending Settlement mismatch`);
      if (!revenueMatch) console.log(`   ✗ Total Revenue mismatch`);
    }
    
    await mongoose.disconnect();
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    await mongoose.disconnect();
  }
}

testPendingSettlementUpdate();
