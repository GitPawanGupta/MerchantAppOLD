require('dotenv').config();
const axios = require('axios');

async function testCommissionBalance() {
  try {
    console.log('🔐 Logging in as admin...\n');
    
    // Login as admin
    const login = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'admin@issmerchant.com',
      password: 'Admin@123456'
    });
    
    const token = login.data.data.accessToken;
    console.log('✓ Logged in successfully\n');
    
    // Get commission balance
    console.log('💰 Fetching Admin Commission Balance...\n');
    
    const balanceRes = await axios.get('http://localhost:5000/api/admin/commission/balance', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    const balance = balanceRes.data.data;
    
    console.log('📊 Commission Balance Details:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Total Collected:     ₹${balance.totalCollected.toFixed(2)}`);
    console.log(`Total Paid Out:      ₹${balance.totalPaidOut.toFixed(2)}`);
    console.log(`Available Balance:   ₹${balance.availableBalance.toFixed(2)}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Total Transactions:  ${balance.totalTransactions}`);
    console.log(`Total Volume:        ₹${balance.totalVolume.toFixed(2)}`);
    console.log(`Payout Count:        ${balance.payoutCount}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    if (balance.availableBalance > 0) {
      console.log('✅ Commission balance is now properly tracking!');
      console.log(`   Admin can withdraw: ₹${balance.availableBalance.toFixed(2)}`);
    } else {
      console.log('⚠️  No commission available for withdrawal yet');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testCommissionBalance();
