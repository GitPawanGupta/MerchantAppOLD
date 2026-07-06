/**
 * Live API Test Script
 * Run: node scripts/liveTest.js
 */
const https = require('https');

// Production API base — uses custom domain
const BASE = 'https://app.pasuai.online/api';

// Correct QR URL domain
const CORRECT_DOMAIN = 'app.pasuai.online';

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
    const options = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 ISS-Test' },
    };
    const req = https.request(options, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchPage(res.headers.location).then(resolve).catch(reject);
      }
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
  console.log(`  Target: ${BASE}`);
  console.log('========================================\n');

  // 1. Health
  const health = await request('GET', '/health');
  console.log(`[1] HEALTH CHECK`);
  console.log(`    Status: ${health.status === 200 ? '✅ OK' : '❌ FAIL'}`);
  console.log(`    Env: ${health.body.environment}`);
  console.log(`    DB: ${health.body.database || 'connected (not exposed)'}\n`);

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

  // 3. QR List — check for correct domain
  const qrList = await request('GET', '/qr', null, token);
  console.log(`[3] QR LIST`);
  console.log(`    Count: ${qrList.body.data?.length}`);
  (qrList.body.data || []).forEach(qr => {
    const urlOk = qr.paymentUrl?.includes(CORRECT_DOMAIN);
    console.log(`    ${urlOk ? '✅' : '❌'} ${qr.qrId} | ${qr.type} | ${qr.paymentUrl}`);
  });
  console.log();

  // 4. Create New Static QR
  const newQr = await request('POST', '/qr/static', { label: 'Live Test QR' }, token);
  const qrId = newQr.body.data?.qrId;
  const paymentUrl = newQr.body.data?.paymentUrl;
  const urlOk = paymentUrl?.includes(CORRECT_DOMAIN);
  console.log(`[4] CREATE STATIC QR`);
  console.log(`    Status: ${newQr.status === 201 ? '✅ Created' : `❌ ${newQr.status}`}`);
  console.log(`    QR ID: ${qrId}`);
  console.log(`    URL: ${urlOk ? '✅' : '❌'} ${paymentUrl}\n`);
  if (!qrId) { console.log('❌ No QR ID, skipping payment tests'); return; }

  // 5. Payment Page — check new payPageBuilder HTML signatures
  const page = await fetchPage(paymentUrl);
  const hasRzp      = page.html.includes('checkout.razorpay.com');
  const hasMerchant = page.html.includes('Pasu AI');
  // New payPageBuilder uses: go() for dynamic, pay() for static, id="ph" for phone
  const hasPayFn    = page.html.includes('function go(') || page.html.includes('async function go') ||
                      page.html.includes('function pay(') || page.html.includes('async function pay');
  const hasPhone    = page.html.includes('id="ph"') || page.html.includes("id='ph'") || page.html.includes('id=\\"ph\\"');
  const isNewUI     = page.html.includes('payPageBuilder') === false &&
                      (page.html.includes('user-scalable=no') || page.html.includes('Inter'));

  console.log(`[5] PAYMENT PAGE`);
  console.log(`    HTTP: ${page.status === 200 ? '✅ 200 OK' : `❌ ${page.status}`}`);
  console.log(`    Razorpay SDK: ${hasRzp ? '✅ Loaded' : '❌ Missing'}`);
  console.log(`    Merchant Name: ${hasMerchant ? '✅ Pasu AI' : '❌ Missing'}`);
  console.log(`    Payment function: ${hasPayFn ? '✅ Present' : '❌ Missing'}`);
  console.log(`    Phone field: ${hasPhone ? '✅ Present' : '❌ Missing'}`);
  console.log(`    New UI (Inter font): ${isNewUI ? '✅ Yes' : '⚠️  Check manually'}\n`);

  // 6. Create Razorpay Order (real live call)
  console.log(`[6] CREATE RAZORPAY ORDER (Live API call)`);
  const order = await request('POST', '/payment/create-order', {
    qrId,
    amount: 1,
    customerPhone: '9795635252',
    customerName: 'Test User',
  });
  const rzpOrderId = order.body.data?.rzpOrderId;
  const orderId    = order.body.data?.orderId;
  const orderOk    = order.status === 201 && !!rzpOrderId;
  console.log(`    Status: ${orderOk ? '✅ Created' : `❌ ${order.status}: ${order.body.message}`}`);
  if (rzpOrderId) {
    console.log(`    Razorpay Order ID: ${rzpOrderId}`);
    console.log(`    Internal Order ID: ${orderId}`);
    console.log(`    Amount: ₹${order.body.data?.amount}`);
    console.log(`    Merchant: ${order.body.data?.merchant?.businessName}`);
  }

  // 7. Verify transaction exists and is pending
  console.log();
  if (orderId) {
    const txn = await request('GET', `/payment/verify?order_id=${orderId}`);
    console.log(`[7] TRANSACTION VERIFY`);
    console.log(`    Status: ${txn.body.data?.status === 'pending' ? '✅ pending (awaiting customer payment)' : txn.body.data?.status}`);
    console.log(`    Order ID: ${txn.body.data?.orderId}`);
    console.log(`    Amount: ₹${txn.body.data?.amount}`);
  }

  // 8. Recent transactions
  console.log();
  const txList = await request('GET', '/payment/transactions?limit=5', null, token);
  console.log(`[8] RECENT TRANSACTIONS (last 5)`);
  (txList.body.data || []).slice(0, 5).forEach(tx => {
    const icon = tx.status === 'success' ? '✅' : tx.status === 'pending' ? '⏳' : '❌';
    const method = tx.paymentMethod && tx.paymentMethod !== 'unknown' ? tx.paymentMethod.toUpperCase() : '-';
    console.log(`    ${icon} ${tx.orderId} | ₹${tx.amount} | ${tx.status.toUpperCase()} | ${method}`);
  });

  // Summary
  const allOk = health.status === 200 && token && urlOk && hasRzp && hasMerchant && orderOk;
  console.log('\n========================================');
  if (allOk) {
    console.log('  ✅ ALL TESTS PASSED — SYSTEM IS LIVE');
    console.log(`  🔗 Payment page: ${paymentUrl}`);
    console.log(`  📦 Razorpay Order: ${rzpOrderId}`);
  } else {
    console.log('  ⚠️  SOME CHECKS NEED ATTENTION — SEE ABOVE');
  }
  console.log('========================================\n');
}

run().catch(console.error);
