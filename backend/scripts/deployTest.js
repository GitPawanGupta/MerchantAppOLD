/**
 * Test Railway deployment — check what code is actually running
 */
const https = require('https');

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const u = new URL('https://app.pasuai.online' + path);
    const b = body ? JSON.stringify(body) : null;
    const r = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(b ? { 'Content-Length': Buffer.byteLength(b) } : {}),
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve({ s: res.statusCode, b: JSON.parse(d) }); } catch { resolve({ s: res.statusCode, b: d }); } });
    });
    r.on('error', reject);
    if (b) r.write(b);
    r.end();
  });
}

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    https.get({ hostname: u.hostname, path: u.pathname + u.search }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ s: res.statusCode, html: d }));
    }).on('error', reject);
  });
}

async function main() {
  console.log('=== Railway Deploy Test ===\n');

  // 1. Login
  const login = await req('POST', '/api/auth/login', { email: 'erpawan459@gmail.com', password: 'Pawan@006' });
  const token = login.b.data?.accessToken;
  console.log('[1] Login:', token ? '✅' : '❌');

  // 2. Create QR — will use upiVpa if set
  const qr = await req('POST', '/api/qr/static', { label: 'Deploy Test' }, token);
  const url = qr.b.data?.paymentUrl;
  const qrId = qr.b.data?.qrId;
  console.log('[2] QR URL:', url);

  if (url && url.startsWith('upi://')) {
    console.log('\n✅ QR uses UPI deep link — correct!');
    console.log('   PhonePe scan will open payment directly.');
    console.log('\n   NOTE: The web page is only shown if URL is https://...');
    console.log('   Since this QR has upi:// URL, no web page is shown at all.');
    console.log('\n   The screenshot problem is from an OLD QR that had the old URL.');
    console.log('   App pe old QR delete karke naya QR use karo.\n');
    process.exit(0);
  }

  // 3. Fetch the payment page
  console.log('[3] Fetching payment page...');
  const page = await fetchPage(url);
  console.log('    HTTP:', page.s);

  const html = page.html;
  if (html.includes('Your Name') || html.includes('cust-name')) {
    console.log('❌ OLD CODE DETECTED — "Your Name" field present');
    console.log('   Railway has NOT deployed the new code yet!');
  } else if (html.includes('id="amt"') || html.includes("id='amt'")) {
    console.log('✅ NEW payPageBuilder — amount field only (no Name/Email)');
  } else if (html.includes('async function go') || html.includes('function pay(')) {
    console.log('✅ NEW payPageBuilder — new JS functions present');
  } else {
    console.log('? Unknown — preview:');
    console.log(html.substring(0, 300));
  }

  // 4. Check current commit on Railway via a custom header trick
  console.log('\n[4] Checking Railway env...');
  const health = await req('GET', '/api/health');
  console.log('    Env:', health.b.environment);
  console.log('    Time:', health.b.timestamp);
}

main().catch(console.error);
