require('dotenv').config();
const axios = require('axios');

async function test() {
  try {
    // Login
    const login = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'admin@issmerchant.com',
      password: 'Admin@123456'
    });
    
    const token = login.data.data.accessToken;
    console.log('✓ Logged in as admin');
    
    // Get pending transactions
    const txList = await axios.get('http://localhost:5000/api/admin/transactions?status=pending&limit=1', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (txList.data.data.length === 0) {
      console.log('⚠️  No pending transactions found');
      return;
    }
    
    const orderId = txList.data.data[0].orderId;
    console.log(`\n🔄 Testing FAILED status for: ${orderId}`);
    
    // Update to failed
    const result = await axios.patch(
      `http://localhost:5000/api/admin/transactions/${orderId}/status`,
      {
        status: 'failed',
        failureReason: 'Test failure - payment declined by bank'
      },
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    
    console.log('\n✅ Status updated to FAILED successfully!');
    console.log(JSON.stringify(result.data, null, 2));
    
  } catch (e) {
    console.error('❌ Error:', e.response?.data || e.message);
  }
}

test();
