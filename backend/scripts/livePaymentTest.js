/**
 * Live Payment Flow Test
 * Tests the complete payment flow on production
 */

const BASE_URL = 'https://app.pasuai.online';
const TEST_EMAIL = 'erpawan459@gmail.com';
const TEST_PASSWORD = 'Pawan@006';

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

async function testPaymentFlow() {
  try {
    log('\n🧪 Testing Live Payment Flow\n', 'blue');
    
    // Step 0: Login and get QR
    log('Step 0: Getting merchant QR code...', 'yellow');
    const loginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      }),
    });

    if (!loginResponse.ok) {
      log(`❌ Login failed: ${loginResponse.status}`, 'red');
      return;
    }

    const loginData = await loginResponse.json();
    const token = loginData.data?.accessToken;
    
    if (!token) {
      log('❌ No access token received', 'red');
      return;
    }

    // Get QR codes
    const qrResponse = await fetch(`${BASE_URL}/api/qr`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!qrResponse.ok) {
      log(`❌ Failed to fetch QR codes: ${qrResponse.status}`, 'red');
      return;
    }

    const qrData = await qrResponse.json();
    const qrCode = qrData.data?.[0];

    if (!qrCode) {
      log('❌ No QR codes found for this merchant', 'red');
      return;
    }

    const TEST_QR_ID = qrCode.qrId;
    log(`✅ Using QR: ${TEST_QR_ID}`, 'green');
    
    // Step 1: Test create order endpoint
    log('Step 1: Creating payment order...', 'yellow');
    const createResponse = await fetch(`${BASE_URL}/api/payment/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        qrId: TEST_QR_ID,
        amount: 1,
        customerPhone: '9795635252',
      }),
    });

    if (!createResponse.ok) {
      log(`❌ Create order failed: ${createResponse.status} ${createResponse.statusText}`, 'red');
      const errorText = await createResponse.text();
      log(errorText, 'red');
      return;
    }

    const createData = await createResponse.json();
    log('✅ Order created successfully!', 'green');
    console.log('Response:', JSON.stringify(createData, null, 2));

    // Validate response structure
    if (!createData.success || !createData.data) {
      log('❌ Invalid response structure', 'red');
      return;
    }

    const { orderId, rzpOrderId, amount } = createData.data;

    // Step 2: Validate critical fields
    log('\nStep 2: Validating response fields...', 'yellow');
    
    const validations = [
      { field: 'orderId', value: orderId, expected: 'ORD_' },
      { field: 'rzpOrderId', value: rzpOrderId, expected: 'order_' },
      { field: 'amount', value: amount, expected: 1 },
    ];

    let allValid = true;
    validations.forEach(({ field, value, expected }) => {
      if (typeof expected === 'string') {
        if (value && value.startsWith(expected)) {
          log(`  ✅ ${field}: ${value}`, 'green');
        } else {
          log(`  ❌ ${field}: ${value || 'undefined'} (expected to start with "${expected}")`, 'red');
          allValid = false;
        }
      } else {
        if (value === expected) {
          log(`  ✅ ${field}: ${value}`, 'green');
        } else {
          log(`  ❌ ${field}: ${value} (expected ${expected})`, 'red');
          allValid = false;
        }
      }
    });

    if (!allValid) {
      log('\n❌ Validation failed! Check the issues above.', 'red');
      return;
    }

    log('\n✅ All validations passed!', 'green');

    // Step 3: Instructions for manual testing
    log('\n📝 Next Steps - Manual Testing Required:', 'blue');
    log(`
1. Open this URL in your browser or mobile:
   ${BASE_URL}/api/payment/pay?qrId=${TEST_QR_ID}

2. Complete the payment using Razorpay

3. Check the following:
   ✓ Payment page shows the correct merchant name
   ✓ Razorpay checkout opens automatically
   ✓ After payment, you're redirected to success page
   ✓ Success page shows all payment details

4. Check Razorpay Dashboard:
   ✓ Payment should show Order ID: ${rzpOrderId}
   ✓ Payment status should be "Captured"

5. Check your backend logs for:
   ✓ No "signature verification failed" errors
   ✓ No "undefined" values in the return URL
   ✓ Transaction status updated to "success"

${colors.yellow}Payment URL:${colors.reset}
${colors.blue}${BASE_URL}/api/payment/pay?qrId=${TEST_QR_ID}${colors.reset}

${colors.yellow}Internal Order ID:${colors.reset} ${orderId}
${colors.yellow}Razorpay Order ID:${colors.reset} ${rzpOrderId}
    `);

    log('✅ Test completed! Follow the manual steps above to verify.', 'green');

  } catch (error) {
    log(`\n❌ Test failed with error:`, 'red');
    console.error(error);
  }
}

// Run the test
testPaymentFlow();
