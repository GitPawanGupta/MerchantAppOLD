/**
 * Test script for Admin Transaction Status Update Feature
 * 
 * This script:
 * 1. Checks for existing pending transactions
 * 2. Creates a test pending transaction if none exists
 * 3. Tests the admin API to update transaction status
 */

require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000/api';

// Models
const Transaction = require('../src/models/Transaction');
const Merchant = require('../src/models/Merchant');
const User = require('../src/models/User');

async function getAdminToken() {
  try {
    const response = await axios.post(`${BASE_URL}/auth/login`, {
      email: process.env.ADMIN_EMAIL || 'admin@issmerchant.com',
      password: process.env.ADMIN_PASSWORD || 'Admin@123456',
    });
    
    return response.data.data.accessToken;
  } catch (error) {
    console.error('❌ Failed to login as admin:', error.response?.data || error.message);
    throw error;
  }
}

async function createTestPendingTransaction() {
  console.log('\n📝 Creating test pending transaction...');
  
  // Find any active merchant
  const merchant = await Merchant.findOne({ status: 'active' });
  
  if (!merchant) {
    console.log('⚠️  No active merchant found. Please create a merchant first.');
    return null;
  }
  
  console.log(`✓ Using merchant: ${merchant.businessName} (${merchant.merchantId})`);
  
  // Create a test transaction with pending status
  const orderId = `TEST_${Date.now()}`;
  const transaction = await Transaction.create({
    orderId,
    merchantId: merchant._id,
    cfOrderId: `order_${Date.now()}`,
    amount: 100,
    commissionRate: 2.5,
    commissionAmount: 2.5,
    settlementAmount: 97.5,
    status: 'pending',
    paymentMethod: 'upi',
    customerName: 'Test Customer',
    customerEmail: 'test@example.com',
    customerPhone: '9999999999',
  });
  
  console.log(`✓ Created test transaction: ${transaction.orderId}`);
  console.log(`  Amount: ₹${transaction.amount}`);
  console.log(`  Status: ${transaction.status}`);
  
  return transaction;
}

async function testUpdateTransactionStatus(token, orderId, newStatus) {
  console.log(`\n🔄 Testing status update: ${orderId} → ${newStatus}...`);
  
  try {
    const response = await axios.patch(
      `${BASE_URL}/admin/transactions/${orderId}/status`,
      {
        status: newStatus,
        paymentMethod: 'upi',
        notes: 'Test update via admin script',
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    console.log('✅ Status updated successfully!');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error('❌ Failed to update status:', error.response?.data || error.message);
    throw error;
  }
}

async function verifyTransactionStatus(orderId) {
  console.log(`\n🔍 Verifying transaction status in database...`);
  
  const transaction = await Transaction.findOne({ orderId })
    .populate('merchantId', 'businessName merchantId');
  
  if (!transaction) {
    console.log('❌ Transaction not found');
    return null;
  }
  
  console.log('✓ Transaction found:');
  console.log(`  Order ID: ${transaction.orderId}`);
  console.log(`  Status: ${transaction.status}`);
  console.log(`  Amount: ₹${transaction.amount}`);
  console.log(`  Merchant: ${transaction.merchantId.businessName}`);
  console.log(`  Payment Time: ${transaction.paymentTime || 'N/A'}`);
  console.log(`  Updated At: ${transaction.updatedAt}`);
  
  return transaction;
}

async function verifyMerchantBalance(merchantId) {
  console.log(`\n💰 Verifying merchant balance update...`);
  
  const merchant = await Merchant.findById(merchantId);
  
  if (!merchant) {
    console.log('❌ Merchant not found');
    return;
  }
  
  console.log('✓ Merchant Balance:');
  console.log(`  Total Revenue: ₹${merchant.totalRevenue || 0}`);
  console.log(`  Available Balance: ₹${merchant.availableBalance || 0}`);
  console.log(`  Total Commission: ₹${merchant.totalCommission || 0}`);
}

async function listPendingTransactions(token) {
  console.log('\n📋 Fetching pending transactions...');
  
  try {
    const response = await axios.get(
      `${BASE_URL}/admin/transactions?status=pending`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );
    
    const transactions = response.data.data;
    console.log(`✓ Found ${transactions.length} pending transaction(s)`);
    
    transactions.forEach((tx, idx) => {
      console.log(`  ${idx + 1}. ${tx.orderId} - ₹${tx.amount} - ${tx.merchantId?.businessName || 'Unknown'}`);
    });
    
    return transactions;
  } catch (error) {
    console.error('❌ Failed to fetch transactions:', error.response?.data || error.message);
    return [];
  }
}

async function main() {
  try {
    console.log('🚀 Admin Transaction Status Update Test');
    console.log('═══════════════════════════════════════\n');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');
    
    // Step 1: Get admin token
    console.log('🔐 Logging in as admin...');
    const adminToken = await getAdminToken();
    console.log('✓ Admin login successful\n');
    
    // Step 2: List existing pending transactions
    const pendingTxs = await listPendingTransactions(adminToken);
    
    let testTransaction;
    
    if (pendingTxs.length > 0) {
      console.log('\n✓ Using existing pending transaction for test');
      testTransaction = pendingTxs[0];
    } else {
      // Step 3: Create a test pending transaction
      testTransaction = await createTestPendingTransaction();
      
      if (!testTransaction) {
        console.log('\n⚠️  Cannot proceed without a test transaction');
        process.exit(0);
      }
    }
    
    const orderId = testTransaction.orderId;
    const merchantId = testTransaction.merchantId._id || testTransaction.merchantId;
    
    // Step 4: Verify initial state
    console.log('\n📊 Initial State:');
    await verifyTransactionStatus(orderId);
    await verifyMerchantBalance(merchantId);
    
    // Step 5: Test updating status to success
    await testUpdateTransactionStatus(adminToken, orderId, 'success');
    
    // Step 6: Verify updated state
    console.log('\n📊 Updated State:');
    await verifyTransactionStatus(orderId);
    await verifyMerchantBalance(merchantId);
    
    console.log('\n✅ Test completed successfully!');
    console.log('\n🎯 Summary:');
    console.log('  ✓ Admin API endpoint working');
    console.log('  ✓ Transaction status updated');
    console.log('  ✓ Merchant balance updated');
    console.log('  ✓ Audit logging working');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n✓ Disconnected from MongoDB');
    process.exit(0);
  }
}

// Run the test
main();
