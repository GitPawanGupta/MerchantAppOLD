/**
 * Live API Test Script
 * Run: node scripts/liveTest.js
 */
const https = require('https');

const BASE = 'https://merchantappold-production.up.railway.app/api';

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options = { hostname: u.hostname, path: u.pathname + u.search, method: 'GET' };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, html: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  console.log('\n========================================');
  console.log('  ISS MERCHANT — LIVE API TEST');
  console.log('========================================\n');

  // 1. Health
  const health = await request('GET', '/health');
  console.log(`[1] HEALTH CHECK`);
  console.log(`    Status: ${health.status === 200 ? '✅ OK' : '❌ FAIL'}`);
  console.log(`    Env: ${health.body.environment}`);
  console.log(`    DB: ${health.body.database || 'N/A'}\n`);

  // 2. Login
  const login = await request('POST', '/auth/login', {
    email: 'erpawan459@gmail.com',
    password: 'Pawan@006',
  });
  const token = login.body.data?.accessToken;
  const merchant = login.body.data?.merchant;
  console.log(`[2] LOGIN`);
  console.log(`    Status: ${token ? '✅ OK' : '❌ FAIL'}`);
  console.log(`    Merchant: ${merchant?.businessName} (${merchant?.merchantId})`);
  console.log(`    KYC: ${merchant?.kycStatus} | Active: ${merchant?.status}\n`);
  if (!token) { console.log('❌ Cannot continue without token'); return; }

  // 3. QR List
  const qrList = await request('GET', '/qr', null, token);
  console.log(`[3] QR LIST`);
  console.log(`    Count: ${qrList.body.data?.length}`);
  (qrList.body.data || []).forEach(qr => {
    const urlOk = qr.paymentUrl?.includes('merchantappold-production');
    console.log(`    ${urlOk ? '✅' : '❌'} ${qr.qrId} | ${qr.type} | ${qr.paymentUrl}`);
  });
  console.log();

  // 4. Create New Static QR
  const newQr = await request('POST', '/qr/static', { label: 'Live Test QR' }, token);
  const qrId = newQr.body.data?.qrId;
  const paymentUrl = newQr.body.data?.paymentUrl;
  const urlOk = paymentUrl?.includes('merchantappold-production');
  console.log(`[4] CREATE STATIC QR`);
  console.log(`    Status: ${newQr.status === 201 ? '✅ Created' : '❌ Failed'}`);
  console.log(`    QR ID: ${qrId}`);
  console.log(`    URL: ${urlOk ? '✅' : '❌'} ${paymentUrl}\n`);

  if (!qrId) { console.log('❌ No QR ID, skipping payment tests'); return; }

  // 5. Payment Page
  const page = await fetchPage(paymentUrl);
  const hasRzp = page.html.includes('checkout.razorpay.com');
  const hasMerchant = page.html.includes('Pasu AI');
  const hasAutoOpen = page.html.includes('setTimeout') && page.html.includes('initiatePayment');
  const hasPhone = page.html.includes('cust-phone');
  console.log(`[5] PAYMENT PAGE`);
  console.log(`    HTTP: ${page.status === 200 ? '✅ 200 OK' : `❌ ${page.status}`}`);
  console.log(`    Razorpay SDK: ${hasRzp ? '✅ Loaded' : '❌ Missing'}`);
  console.log(`    Merchant Name: ${hasMerchant ? '✅ Pasu AI' : '❌ Missing'}`);
  console.log(`    Auto-open checkout: ${hasAutoOpen ? '✅ Yes' : '❌ No'}`);
  console.log(`    Phone field: ${hasPhone ? '✅ Present' : '❌ Missing'}\n`);

  // 6. Create Razorpay Order
  const order = await request('POST', '/payment/create-order', {
    qrId,
    amount: 1,
    customerPhone: '9999999999',
  });
  const rzpOrderId = order.body.data?.rzpOrderId;
  const orderId = order.body.data?.orderId;
  console.log(`[6] CREATE RAZORPAY ORDER`);
  console.log(`    Status: ${order.status === 201 ? '✅ Created' : `❌ ${order.status}: ${order.body.message}`}`);
  if (rzpOrderId) {
    console.log(`    Razorpay Order ID: ${rzpOrderId}`);
    console.log(`    Internal Order ID: ${orderId}`);
    console.log(`    Amount: ₹${order.body.data?.amount}`);
    console.log(`    Merchant: ${order.body.data?.merchant?.businessName}`);
  }

  console.log('\n========================================');
  const allOk = token && urlOk && hasRzp && hasMerchant && rzpOrderId;
  console.log(allOk
    ? '  ✅ ALL TESTS PASSED — FLOW IS WORKING'
    : '  ⚠️  SOME TESTS FAILED — CHECK ABOVE');
  console.log('========================================\n');
}

run().catch(console.error);
