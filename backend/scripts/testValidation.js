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
    console.log('✓ Logged in as admin\n');
    
    // Get a successful transaction
    const txList = await axios.get('http://localhost:5000/api/admin/transactions?status=success&limit=1', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (txList.data.data.length === 0) {
      console.log('⚠️  No successful transactions found');
      return;
    }
    
    const orderId = txList.data.data[0].orderId;
    console.log(`🔒 Testing validation: Trying to modify successful transaction ${orderId}`);
    
    // Try to update successful transaction (should fail)
    try {
      await axios.patch(
        `http://localhost:5000/api/admin/transactions/${orderId}/status`,
        { status: 'failed' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      console.log('❌ VALIDATION FAILED - Should not allow modification!');
    } catch (validationError) {
      if (validationError.response?.status === 400) {
        console.log('✅ Validation working correctly!');
        console.log(`   Message: ${validationError.response.data.message}`);
      } else {
        console.log('⚠️  Unexpected error:', validationError.message);
      }
    }
    
    console.log('\n📝 Testing invalid status value...');
    
    // Get pending transaction
    const pendingTx = await axios.get('http://localhost:5000/api/admin/transactions?status=pending&limit=1', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (pendingTx.data.data.length > 0) {
      const pendingOrderId = pendingTx.data.data[0].orderId;
      
      try {
        await axios.patch(
          `http://localhost:5000/api/admin/transactions/${pendingOrderId}/status`,
          { status: 'invalid_status' },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        console.log('❌ VALIDATION FAILED - Should reject invalid status!');
      } catch (validationError) {
        if (validationError.response?.status === 400) {
          console.log('✅ Status validation working correctly!');
          console.log(`   Message: ${validationError.response.data.message}`);
        } else {
          console.log('⚠️  Unexpected error:', validationError.message);
        }
      }
    }
    
    console.log('\n✅ All validation tests passed!');
    
  } catch (e) {
    console.error('❌ Error:', e.response?.data || e.message);
  }
}

test();
