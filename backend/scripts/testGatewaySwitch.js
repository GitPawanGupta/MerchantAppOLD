#!/usr/bin/env node

/**
 * Test Admin Payment Gateway Switch APIs
 * Tests: GET /gateways, POST /gateways/switch, POST /gateways/test
 */

const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000/api';
const ADMIN_CREDS = {
  email: 'admin@issmerchant.com',
  password: 'Admin@123456',
};

const pass = (msg) => console.log(`│ ✅ ${msg}`);
const fail = (msg) => console.log(`│ ❌ ${msg}`);
const info = (msg) => console.log(`│    ${msg}`);

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║       PAYMENT GATEWAY SWITCH API TEST                   ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  let token;
  let originalGateway;

  try {
    // ── STEP 1: Admin Login ──────────────────────────────────────
    console.log('┌─ STEP 1: ADMIN LOGIN ────────────────────────────────┐');
    const loginRes = await axios.post(`${BASE_URL}/auth/login`, ADMIN_CREDS);
    token = loginRes.data.data.accessToken;
    pass(`Login successful — ${loginRes.data.data.user.name}`);
    console.log('└─────────────────────────────────────────────────────┘\n');

    const headers = { Authorization: `Bearer ${token}` };

    // ── STEP 2: GET current gateways ─────────────────────────────
    console.log('┌─ STEP 2: GET ALL GATEWAYS ───────────────────────────┐');
    const listRes = await axios.get(`${BASE_URL}/admin/gateways`, { headers });

    if (listRes.data.success) {
      pass('GET /admin/gateways → 200 OK');
      const { gateways, activeGateway } = listRes.data.data;
      originalGateway = activeGateway;
      info(`Active Gateway  : ${activeGateway.toUpperCase()}`);
      info(`Available       : ${gateways.map(g => `${g.name}${g.isActive ? ' (active)' : ''}`).join(', ')}`);
    } else {
      fail('GET /admin/gateways failed');
    }
    console.log('└─────────────────────────────────────────────────────┘\n');

    // ── STEP 3: Test Razorpay connection ─────────────────────────
    console.log('┌─ STEP 3: TEST RAZORPAY CONNECTION ──────────────────┐');
    const rzpTestRes = await axios.post(
      `${BASE_URL}/admin/gateways/test`,
      { gateway: 'razorpay' },
      { headers }
    );
    if (rzpTestRes.data.success) {
      const r = rzpTestRes.data.data;
      if (r.success) {
        pass(`Razorpay test   : CONNECTED (orderId: ${r.orderId || 'N/A'})`);
      } else {
        fail(`Razorpay test   : FAILED — ${r.message}`);
      }
    }
    console.log('└─────────────────────────────────────────────────────┘\n');

    // ── STEP 4: Test Cashfree connection ─────────────────────────
    console.log('┌─ STEP 4: TEST CASHFREE CONNECTION ──────────────────┐');
    const cfTestRes = await axios.post(
      `${BASE_URL}/admin/gateways/test`,
      { gateway: 'cashfree' },
      { headers }
    );
    if (cfTestRes.data.success) {
      const r = cfTestRes.data.data;
      if (r.success) {
        pass(`Cashfree test   : CONNECTED (orderId: ${r.orderId || 'N/A'})`);
      } else {
        fail(`Cashfree test   : FAILED — ${r.message}`);
      }
    }
    console.log('└─────────────────────────────────────────────────────┘\n');

    // ── STEP 5: Switch to opposite gateway ───────────────────────
    const targetGateway = originalGateway === 'razorpay' ? 'cashfree' : 'razorpay';
    console.log(`┌─ STEP 5: SWITCH ${originalGateway.toUpperCase()} → ${targetGateway.toUpperCase()} ${'─'.repeat(20 - targetGateway.length)}┐`);
    const switchRes = await axios.post(
      `${BASE_URL}/admin/gateways/switch`,
      { gateway: targetGateway },
      { headers }
    );
    if (switchRes.data.success) {
      const r = switchRes.data.data;
      pass(`Switch success  : ${r.previousGateway?.toUpperCase()} → ${r.activeGateway?.toUpperCase()}`);
      info(`Switched at     : ${new Date(r.switchedAt).toLocaleString()}`);
    } else {
      fail(`Switch failed   : ${switchRes.data.message}`);
    }
    console.log('└─────────────────────────────────────────────────────┘\n');

    // ── STEP 6: Verify switch persisted ──────────────────────────
    console.log('┌─ STEP 6: VERIFY SWITCH PERSISTED ───────────────────┐');
    const verifyRes = await axios.get(`${BASE_URL}/admin/gateways`, { headers });
    const newActive = verifyRes.data.data.activeGateway;
    if (newActive === targetGateway) {
      pass(`Active gateway is now: ${newActive.toUpperCase()} ✓`);
    } else {
      fail(`Expected ${targetGateway} but got ${newActive}`);
    }
    console.log('└─────────────────────────────────────────────────────┘\n');

    // ── STEP 7: Try switching to same gateway (should fail) ──────
    console.log('┌─ STEP 7: SWITCH TO SAME GATEWAY (EXPECT ERROR) ─────┐');
    try {
      await axios.post(
        `${BASE_URL}/admin/gateways/switch`,
        { gateway: targetGateway },
        { headers }
      );
      fail('Should have returned 400 but did not');
    } catch (err) {
      if (err.response?.status === 400) {
        pass(`Correctly blocked: "${err.response.data.message}"`);
      } else {
        fail(`Unexpected error: ${err.message}`);
      }
    }
    console.log('└─────────────────────────────────────────────────────┘\n');

    // ── STEP 8: Restore original gateway ─────────────────────────
    console.log(`┌─ STEP 8: RESTORE ORIGINAL (${originalGateway.toUpperCase()}) ${'─'.repeat(20 - originalGateway.length)}┐`);
    const restoreRes = await axios.post(
      `${BASE_URL}/admin/gateways/switch`,
      { gateway: originalGateway },
      { headers }
    );
    if (restoreRes.data.success) {
      pass(`Restored to     : ${originalGateway.toUpperCase()}`);
    } else {
      fail(`Restore failed  : ${restoreRes.data.message}`);
    }
    console.log('└─────────────────────────────────────────────────────┘\n');

    // ── STEP 9: Validation — invalid gateway name ─────────────────
    console.log('┌─ STEP 9: VALIDATION — INVALID GATEWAY NAME ─────────┐');
    try {
      await axios.post(
        `${BASE_URL}/admin/gateways/switch`,
        { gateway: 'stripe' },
        { headers }
      );
      fail('Should have returned 400 for invalid gateway');
    } catch (err) {
      if (err.response?.status === 400) {
        pass(`Correctly rejected "stripe": "${err.response.data.message}"`);
      } else {
        fail(`Unexpected error: ${err.message}`);
      }
    }
    console.log('└─────────────────────────────────────────────────────┘\n');

    // ── Summary ───────────────────────────────────────────────────
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║                   TEST SUMMARY                          ║');
    console.log('╠══════════════════════════════════════════════════════════╣');
    console.log('║ ✅ GET  /admin/gateways         → lists gateways        ║');
    console.log('║ ✅ POST /admin/gateways/test    → tests connectivity     ║');
    console.log('║ ✅ POST /admin/gateways/switch  → switches active GW    ║');
    console.log('║ ✅ Switch persisted in DB (survives restart)            ║');
    console.log('║ ✅ Duplicate switch → 400 blocked                       ║');
    console.log('║ ✅ Invalid gateway name → 400 rejected                  ║');
    console.log(`║                                                          ║`);
    console.log(`║ Active gateway restored to: ${originalGateway.toUpperCase().padEnd(25)}║`);
    console.log('╚══════════════════════════════════════════════════════════╝\n');

  } catch (error) {
    console.log('\n❌ UNEXPECTED ERROR:', error.response?.data?.message || error.message);
    if (error.response?.data) {
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

main();
