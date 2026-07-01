/**
 * Full Payment Flow Test
 * Tests: Order create → Simulate webhook → Verify transaction status → Settlement check
 */
const https = require('https');
const crypto = require('crypto');

const BASE = 'https://merchantappold-production.up.railway.app/api';
const WEBHOOK_SECRET = 'b6d9fb9499cd9a09d3ec80d75872c500e6f71cde62fa5a5a173e6df34090db87';

function request(method, path, body = null, token = null, rawBody = false) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const bodyStr = body ? JSON.stringify(body) : null;
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function sendWebhook(path, body, secret) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const signature = crypto.createHmac('sha256', secret).update(bodyStr).digest('hex');
    const url = new URL(BASE + path);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': signature,
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

async function run() {
  console.log('\n========================================');
  console.log('  PAYMENT FLOW — FULL END-TO-END TEST');
  console.log('========================================\n');

  // 1. Login
  const login = await request('POST', '/auth/login', {
    email: 'erpawan459@gmail.com', password: 'Pawan@006',
  });
  const token = login.body.data?.accessToken;
  const merchantDbId = login.body.data?.merchant?.id;
  console.log(`[1] LOGIN: ✅ ${login.body.data?.merchant?.businessName}`);

  // 2. Get existing QR
  const qrList = await request('GET', '/qr', null, token);
  const qr = qrList.body.data?.[0];
  console.log(`[2] QR: ✅ ${qr?.qrId}`);

  // 3. Create Razorpay Order
  const orderRes = await request('POST', '/payment/create-order', {
    qrId: qr.qrId, amount: 1, customerPhone: '9795635252',
    customerName: 'Test Customer', customerEmail: 'test@test.com',
  });
  const { orderId, rzpOrderId, amount } = orderRes.body.data;
  console.log(`[3] ORDER CREATED: ✅`);
  console.log(`    Internal: ${orderId}`);
  console.log(`    Razorpay: ${rzpOrderId}`);
  console.log(`    Amount: ₹${amount}`);

  // 4. Check transaction status (should be pending)
  const txBefore = await request('GET', `/payment/verify?order_id=${orderId}`);
  console.log(`\n[4] TRANSACTION STATUS (before payment): ${txBefore.body.data?.status}`);

  // 5. Simulate Razorpay payment.captured webhook
  const fakePaymentId = `pay_test_${Date.now()}`;
  const fakeWebhook = {
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: fakePaymentId,
          order_id: rzpOrderId,
          status: 'captured',
          method: 'upi',
          vpa: 'test@upi',
          amount: amount * 100,
          currency: 'INR',
          captured_at: Math.floor(Date.now() / 1000),
          acquirer_data: { bank_transaction_id: `BANK_REF_${Date.now()}` },
        },
      },
    },
  };

  console.log(`\n[5] SENDING WEBHOOK (payment.captured)...`);
  const webhook = await sendWebhook('/payment/webhook', fakeWebhook, WEBHOOK_SECRET);
  console.log(`    Webhook response: ${webhook.status} | ${JSON.stringify(webhook.body)}`);

  // 6. Verify transaction updated
  await new Promise(r => setTimeout(r, 1500)); // wait for async processing
  const txAfter = await request('GET', `/payment/verify?order_id=${orderId}`);
  const txStatus = txAfter.body.data?.status;
  console.log(`\n[6] TRANSACTION STATUS (after webhook):`);
  console.log(`    Status: ${txStatus === 'success' ? '✅ success' : `⚠️  ${txStatus}`}`);
  console.log(`    Payment ID: ${txAfter.body.data?.rzpPaymentId || 'N/A'}`);
  console.log(`    Method: ${txAfter.body.data?.paymentMethod || 'N/A'}`);

  // 7. Check merchant dashboard updated
  const dashboard = await request('GET', '/merchant/dashboard', null, token);
  console.log(`\n[7] MERCHANT DASHBOARD:`);
  console.log(`    Total Collected: ₹${dashboard.body.data?.totalCollected ?? 'N/A'}`);
  console.log(`    Pending Settlement: ₹${dashboard.body.data?.pendingSettlement ?? 'N/A'}`);
  console.log(`    Total Commission: ₹${dashboard.body.data?.totalCommission ?? 'N/A'}`);

  // 8. Check transactions list
  const txList = await request('GET', '/payment/transactions?limit=3', null, token);
  console.log(`\n[8] RECENT TRANSACTIONS:`);
  (txList.body.data || []).slice(0, 3).forEach(tx => {
    const icon = tx.status === 'success' ? '✅' : tx.status === 'pending' ? '⏳' : '❌';
    console.log(`    ${icon} ${tx.orderId} | ₹${tx.amount} | ${tx.status} | ${tx.paymentMethod || 'N/A'}`);
  });

  console.log('\n========================================');
  const passed = txStatus === 'success';
  console.log(passed
    ? '  ✅ PAYMENT FLOW TEST PASSED!'
    : '  ⚠️  FLOW PARTIALLY WORKING — CHECK ABOVE');
  console.log('========================================\n');
}

run().catch(console.error);
