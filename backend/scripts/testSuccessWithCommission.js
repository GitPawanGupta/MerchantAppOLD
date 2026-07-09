require('dotenv').config();
const axios = require('axios');
const mongoose = require('mongoose');
const { CommissionLedger } = require('../src/models/Commission');

async function test() {
  try {
    // Login
    const login = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'admin@issmerchant.com',
      password: 'Admin@123456'
    });
    
    const token = login.data.data.accessToken;
    console.log('✓ Logged in as admin\n');
    
    // Get pending transactions
    const txList = await axios.get('http://localhost:5000/api/admin/transactions?status=pending&limit=1', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (txList.data.data.length === 0) {
      console.log('⚠️  No pending transactions found');
      return;
    }
    
    const orderId = txList.data.data[0].orderId;
    console.log(`🔄 Marking transaction as SUCCESS: ${orderId}\n`);
    
    // Update to success
    const result = await axios.patch(
      `http://localhost:5000/api/admin/transactions/${orderId}/status`,
      {
        status: 'success',
        paymentMethod: 'upi',
        upiTransactionId: 'TEST' + Date.now()
      },
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    
    console.log('✅ Status updated to SUCCESS!');
    console.log(JSON.stringify(result.data, null, 2));
    
    // Now check commission ledger
    console.log('\n📊 Checking Commission Ledger...\n');
    
    await mongoose.connect(process.env.MONGODB_URI);
    
    // Wait a moment for DB write
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const Transaction = require('../src/models/Transaction');
    const Merchant = require('../src/models/Merchant'); // Add this import
    const tx = await Transaction.findOne({ orderId });
    
    const ledgerEntry = await CommissionLedger.findOne({ transactionId: tx._id })
      .populate('merchantId', 'merchantId businessName');
    
    if (ledgerEntry) {
      console.log('✅ Commission Ledger Entry Created Successfully!');
      console.log(`   Transaction Amount: ₹${ledgerEntry.transactionAmount}`);
      console.log(`   Commission Rate: ${ledgerEntry.commissionRate}%`);
      console.log(`   Commission Amount: ₹${ledgerEntry.commissionAmount}`);
      console.log(`   Net Settlement: ₹${ledgerEntry.netSettlementAmount}`);
      console.log(`   Status: ${ledgerEntry.status}`);
      console.log(`   Merchant: ${ledgerEntry.merchantId.businessName}`);
    } else {
      console.log('❌ No commission ledger entry found!');
    }
    
    // Check total admin commission
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
    
    console.log('\n💰 Total Admin Commission Balance:');
    if (stats.length > 0) {
      console.log(`   Pending: ₹${stats[0].totalCommission.toFixed(2)}`);
      console.log(`   Count: ${stats[0].count} transactions`);
    } else {
      console.log('   ₹0.00');
    }
    
    await mongoose.disconnect();
    
  } catch (e) {
    console.error('❌ Error:', e.response?.data || e.message);
    await mongoose.disconnect();
  }
}

test();
