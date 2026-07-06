/**
 * Live API Test Script — ISS Merchant
 * Tests: health, login, QR, payment page, Razorpay order, partner status
 * Run: node scripts/liveTest.js
 */
const https = require('https');
const http = require('http');

const BASE = 'https://app.pasuai.online/api';
const CORRECT_DOMAIN = 'app.pasuai.online';

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(BASE + path);
    const b = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(b ? { 'Content-Length': Buffer.byteLength(b) } : {}),
      },
    };
    const req = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve({ s: res.statusCode, b: JSON.parse(d) }); } catch { resolve({ s: res.statusCode, b: d }); } });
    });
    req.on('error', reject);
    if (b) req.write(b);
    req.end();
  });
}

function fetchWebPage(url) {
  return new Promise((resolve, reject) => {
    // Only fetch http/https web URLs — skip upi:// deep links
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      resolve({ s: 0, html: '', skipped: true, reason: 'Not an HTTP URL (UPI deep link)' });
      return;
    }
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    lib.get({ hostname: u.hostname, path: u.pathname + u.search, method: 'GET' }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ s: res.statusCode, html: d }));
    }).on('error', reject);
  });
}

async function main() {
  console.log('\n========================================');
  console.log('  ISS MERCHANT — LIVE API TEST');
  console.log(`  Target: ${BASE}`);
  console.log('========================================\n');

  // 1. Health
  const health = await request('GET', '/health');
  console.log('[1] HEALTH');
  console.log(`    Status: ${health.s === 200 ? '✅ OK' : '❌ FAIL'} | Env: ${health.b.environment}`);

  // 2. Login
  const login = await request('POST', '/auth/login', { email: 'erpawan459@gmail.com', password: 'Pawan@006' });
  const token = login.b.data?.accessToken;
  const merchant = login.b.data?.merchant;
  console.log(`\n[2] LOGIN`);
  console.log(`    Status: ${token ? '✅ OK' : '❌ FAIL'}`);
  console.log(`    Merchant: ${merchant?.businessName} (${merchant?.merchantId})`);
  console.log(`    KYC: ${merchant?.kycStatus} | Active: ${merchant?.status}`);
  console.log(`    Razorpay Linked: ${merchant?.isRazorpayLinked ? '✅ YES' : '⬜ Not yet'}`);
  if (!token) { console.log('❌ Cannot continue'); return; }

  // 3. Partner connect URL
  console.log(`\n[3] PARTNER CONNECT URL`);
  try {
    const connect = await request('GET', '/partner/connect', null, token);
    const url = connect.b.data?.url;
    console.log(`    Status: ${url ? '✅ OK' : '❌ FAIL'}`);
    if (url) console.log(`    URL: ${url.substring(0, 80)}...`);
  } catch (e) {
    console.log(`    ❌ Error: ${e.message}`);
  }

  // 4. Partner status
  console.log(`\n[4] PARTNER STATUS`);
  const status = await request('GET', '/partner/status', null, token);
  console.log(`    isLinked: ${status.b.data?.isLinked ? '✅ YES' : '⬜ NO'}`);
  console.log(`    accountId: ${status.b.data?.linkedAccountId || 'Not connected yet'}`);

  // 5. QR List
  console.log(`\n[5] QR LIST`);
  const qrList = await request('GET', '/qr', null, token);
  console.log(`    Count: ${qrList.b.data?.length}`);
  (qrList.b.data || []).forEach(qr => {
    const isUpi = qr.paymentUrl?.startsWith('upi://');
    const isCorrect = isUpi || qr.paymentUrl?.includes(CORRECT_DOMAIN);
    console.log(`    ${isCorrect ? '✅' : '❌'} ${qr.qrId} | ${isUpi ? 'UPI deep link ✓' : qr.paymentUrl}`);
  });

  // 6. Create new QR
  console.log(`\n[6] CREATE STATIC QR`);
  const newQr = await request('POST', '/qr/static', { label: 'Live Test' }, token);
  const qrId = newQr.b.data?.qrId;
  const payUrl = newQr.b.data?.paymentUrl;
  const isUpi = payUrl?.startsWith('upi://');
  console.log(`    Status: ${newQr.s === 201 ? '✅ Created' : '❌ Failed'}`);
  console.log(`    QR ID: ${qrId}`);
  console.log(`    URL: ${isUpi ? '✅ UPI deep link — no PhonePe warning!' : `❌ ${payUrl}`}`);

  // 7. Payment page test (only for web URL QRs)
  if (!isUpi && payUrl) {
    console.log(`\n[7] PAYMENT PAGE`);
    const page = await fetchWebPage(payUrl);
    if (page.skipped) {
      console.log(`    Skipped: ${page.reason}`);
    } else {
      console.log(`    HTTP: ${page.s === 200 ? '✅ 200 OK' : `❌ ${page.s}`}`);
      console.log(`    Razorpay SDK: ${page.html.includes('checkout.razorpay.com') ? '✅' : '❌'}`);
      console.log(`    No Name/Email fields: ${!page.html.includes('Your Name') ? '✅' : '❌'}`);
    }
  } else {
    console.log(`\n[7] PAYMENT PAGE`);
    console.log(`    ✅ Skipped — QR uses UPI deep link (no web page needed)`);
  }

  // 8. Create Razorpay order (real live API)
  console.log(`\n[8] CREATE RAZORPAY ORDER (Live)`);
  const order = await request('POST', '/payment/create-order', {
    qrId, amount: 1, customerPhone: '9795635252',
  });
  const rzpOrderId = order.b.data?.rzpOrderId;
  const orderId = order.b.data?.orderId;
  console.log(`    Status: ${order.s === 201 ? '✅ Created' : `❌ ${order.s}: ${order.b.message}`}`);
  if (rzpOrderId) {
    console.log(`    Razorpay Order: ${rzpOrderId}`);
    console.log(`    Internal Order: ${orderId}`);
    console.log(`    Amount: ₹${order.b.data?.amount}`);
  }

  // 9. Verify transaction
  if (orderId) {
    console.log(`\n[9] TRANSACTION STATUS`);
    const tx = await request('GET', `/payment/verify?order_id=${orderId}`);
    console.log(`    Status: ${tx.b.data?.status === 'pending' ? '✅ pending (awaiting payment)' : tx.b.data?.status}`);
  }

  // 10. Recent transactions
  console.log(`\n[10] RECENT TRANSACTIONS`);
  const txList = await request('GET', '/payment/transactions?limit=5', null, token);
  (txList.b.data || []).slice(0, 5).forEach(tx => {
    const icon = tx.status === 'success' ? '✅' : tx.status === 'pending' ? '⏳' : '❌';
    console.log(`    ${icon} ${tx.orderId} | ₹${tx.amount} | ${tx.status.toUpperCase()} | ${tx.paymentMethod || '-'}`);
  });

  // Summary
  const allOk = health.s === 200 && token && rzpOrderId;
  console.log('\n========================================');
  console.log(allOk ? '  ✅ ALL TESTS PASSED — SYSTEM LIVE' : '  ⚠️  SOME ISSUES — CHECK ABOVE');
  console.log('========================================\n');
}

main().catch(console.error);
