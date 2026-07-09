require('dotenv').config();
const axios = require('axios');

async function testFullFlow() {
  try {
    // Login
    const login = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'admin@issmerchant.com',
      password: 'Admin@123456'
    });
    
    const token = login.data.data.accessToken;
    console.log('✓ Logged in as admin\n');
    
    // Get initial balance
    console.log('📊 Step 1: Check Initial Balance\n');
    let balanceRes = await axios.get('http://localhost:5000/api/admin/commission/balance', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    const initialBalance = balanceRes.data.data.availableBalance;
    console.log(`   Available Balance: ₹${initialBalance.toFixed(2)}\n`);
    
    // Get a pending transaction
    console.log('📋 Step 2: Find Pending Transaction\n');
    const txList = await axios.get('http://localhost:5000/api/admin/transactions?status=pending&limit=1', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (txList.data.data.length === 0) {
      console.log('⚠️  No pending transactions found for testing');
      return;
    }
    
    const tx = txList.data.data[0];
    console.log(`   Order ID: ${tx.orderId}`);
    console.log(`   Amount: ₹${tx.amount}`);
    console.log(`   Commission: ₹${tx.commissionAmount}\n`);
    
    // Mark as success
    console.log('🔄 Step 3: Mark Transaction as SUCCESS\n');
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
    
    console.log(`   ✓ Status updated to: ${updateRes.data.data.status}\n`);
    
    // Wait a moment for DB writes
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Check updated balance
    console.log('💰 Step 4: Check Updated Balance\n');
    balanceRes = await axios.get('http://localhost:5000/api/admin/commission/balance', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    const finalBalance = balanceRes.data.data.availableBalance;
    const increase = finalBalance - initialBalance;
    
    console.log(`   Initial Balance: ₹${initialBalance.toFixed(2)}`);
    console.log(`   Final Balance:   ₹${finalBalance.toFixed(2)}`);
    console.log(`   Increase:        ₹${increase.toFixed(2)}`);
    console.log(`   Expected:        ₹${tx.commissionAmount.toFixed(2)}\n`);
    
    if (Math.abs(increase - tx.commissionAmount) < 0.01) {
      console.log('✅ SUCCESS! Commission balance updated correctly!');
      console.log('   Admin dashboard will now show the updated balance.');
    } else {
      console.log('⚠️  Balance increase does not match expected commission');
      console.log(`   Difference: ₹${Math.abs(increase - tx.commissionAmount).toFixed(2)}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testFullFlow();
