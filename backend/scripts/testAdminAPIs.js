#!/usr/bin/env node

/**
 * Test All Admin APIs
 * Comprehensive test for all admin panel endpoints
 */

const axios = require('axios');

const BASE_URL = 'https://app.pasuai.online/api';
const ADMIN_CREDS = {
  email: 'admin@issmerchant.com',
  password: 'Admin@123456',
};

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║         COMPLETE ADMIN API TEST                            ║');
  console.log('║         Live Environment: app.pasuai.online                ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  let token;

  try {
    // ─────────────────────────────────────────────────────────────
    console.log('┌─ STEP 1: ADMIN LOGIN ──────────────────────────────────┐');
    const loginRes = await axios.post(`${BASE_URL}/auth/login`, ADMIN_CREDS);
    token = loginRes.data.data.accessToken;
    const user = loginRes.data.data.user;
    
    console.log('│ ✅ Login successful');
    console.log(`│ User: ${user.name}`);
    console.log(`│ Role: ${user.role}`);
    console.log('└────────────────────────────────────────────────────────┘\n');

    const headers = { Authorization: `Bearer ${token}` };

    // ─────────────────────────────────────────────────────────────
    console.log('┌─ STEP 2: ADMIN DASHBOARD ──────────────────────────────┐');
    const dashRes = await axios.get(`${BASE_URL}/admin/dashboard`, { headers });
    const dashData = dashRes.data.data;

    console.log('│ Dashboard API Response:');
    console.log(`│   Merchants: ${dashData.merchants.total} total, ${dashData.merchants.active} active`);
    console.log(`│   Today: ${dashData.today.count} payments, ₹${dashData.today.volume}`);
    console.log(`│   Month: ${dashData.month.count} payments, ₹${dashData.month.volume}`);
    console.log(`│   Pending Settlements: ${dashData.pendingSettlements.count} (₹${dashData.pendingSettlements.amount})`);
    console.log(`│   Top Merchants: ${dashData.topMerchants.length}`);
    console.log(`│   Recent Transactions: ${dashData.recentTransactions.length}`);
    console.log('└────────────────────────────────────────────────────────┘\n');

    // ─────────────────────────────────────────────────────────────
    console.log('┌─ STEP 3: COMMISSION BALANCE ───────────────────────────┐');
    const commRes = await axios.get(`${BASE_URL}/admin/commission/balance`, { headers });
    const commData = commRes.data.data;

    console.log('│ Commission Balance API Response:');
    console.log(`│   totalCollected: ₹${commData.totalCollected.toFixed(2)}`);
    console.log(`│   totalPaidOut: ₹${commData.totalPaidOut.toFixed(2)}`);
    console.log(`│   availableBalance: ₹${commData.availableBalance.toFixed(2)}`);
    console.log(`│   totalTransactions: ${commData.totalTransactions}`);
    console.log(`│   totalVolume: ₹${commData.totalVolume.toFixed(2)}`);
    console.log('└────────────────────────────────────────────────────────┘\n');

    // ─────────────────────────────────────────────────────────────
    console.log('┌─ STEP 4: REPORTS - TRANSACTIONS ───────────────────────┐');
    const txReportRes = await axios.get(`${BASE_URL}/admin/reports/transactions?period=month`, { headers });
    const txReport = txReportRes.data.data;

    console.log('│ Transaction Report API Response:');
    if (txReport.summary) {
      console.log(`│   count: ${txReport.summary.count}`);
      console.log(`│   totalVolume: ₹${txReport.summary.totalVolume || 0}`);
      console.log(`│   totalSettled: ₹${txReport.summary.totalSettled || 0}`);
    } else {
      console.log('│   ⚠️  No summary field');
      console.log(`│   Available fields: ${Object.keys(txReport).join(', ')}`);
    }
    console.log('└────────────────────────────────────────────────────────┘\n');

    // ─────────────────────────────────────────────────────────────
    console.log('┌─ STEP 5: REPORTS - COMMISSIONS ────────────────────────┐');
    const commReportRes = await axios.get(`${BASE_URL}/admin/reports/commissions?period=month`, { headers });
    const commReport = commReportRes.data.data;

    console.log('│ Commission Report API Response:');
    if (commReport.summary) {
      console.log(`│   totalCommission: ₹${commReport.summary.totalCommission || 0}`);
      console.log(`│   totalVolume: ₹${commReport.summary.totalVolume || 0}`);
    }
    if (commReport.byMerchant) {
      console.log(`│   Top Merchants: ${commReport.byMerchant.length}`);
    }
    console.log('└────────────────────────────────────────────────────────┘\n');

    // ─────────────────────────────────────────────────────────────
    console.log('┌─ STEP 6: REPORTS - SETTLEMENTS ────────────────────────┐');
    const setlReportRes = await axios.get(`${BASE_URL}/admin/reports/settlements?period=month`, { headers });
    const setlReport = setlReportRes.data.data;

    console.log('│ Settlement Report API Response:');
    if (setlReport.summary) {
      console.log(`│   count: ${setlReport.summary.count || 0}`);
      console.log(`│   totalGross: ₹${setlReport.summary.totalGross || 0}`);
      console.log(`│   totalCommission: ₹${setlReport.summary.totalCommission || 0}`);
      console.log(`│   totalNet: ₹${setlReport.summary.totalNet || 0}`);
    }
    console.log('└────────────────────────────────────────────────────────┘\n');

    // ─────────────────────────────────────────────────────────────
    console.log('┌─ STEP 7: MERCHANTS LIST ───────────────────────────────┐');
    const merchantsRes = await axios.get(`${BASE_URL}/admin/merchants?page=1&limit=5`, { headers });
    const merchantsData = merchantsRes.data.data;

    console.log(`│ Merchants: ${merchantsData.length}`);
    if (merchantsData.length > 0) {
      const m = merchantsData[0];
      console.log(`│ Sample Merchant Fields: ${Object.keys(m).join(', ')}`);
    }
    console.log('└────────────────────────────────────────────────────────┘\n');

    // ─────────────────────────────────────────────────────────────
    console.log('┌─ STEP 8: TRANSACTIONS LIST ────────────────────────────┐');
    const txListRes = await axios.get(`${BASE_URL}/admin/transactions?page=1&limit=5`, { headers });
    const txListData = txListRes.data.data;

    console.log(`│ Transactions: ${txListData.length}`);
    if (txListData.length > 0) {
      const tx = txListData[0];
      console.log(`│ Sample Transaction Fields: ${Object.keys(tx).slice(0, 10).join(', ')}`);
    }
    console.log('└────────────────────────────────────────────────────────┘\n');

    // ─────────────────────────────────────────────────────────────
    console.log('┌─ STEP 9: SETTLEMENTS LIST ─────────────────────────────┐');
    const setlListRes = await axios.get(`${BASE_URL}/admin/settlements?page=1&limit=5`, { headers });
    const setlListData = setlListRes.data.data;

    console.log(`│ Settlements: ${setlListData.length}`);
    if (setlListData.length > 0) {
      const s = setlListData[0];
      console.log(`│ Sample Settlement Fields: ${Object.keys(s).slice(0, 10).join(', ')}`);
    }
    console.log('└────────────────────────────────────────────────────────┘\n');

    // ─────────────────────────────────────────────────────────────
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                     TEST SUMMARY                           ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log('║ ✅ All Admin APIs Working                                  ║');
    console.log('║                                                            ║');
    console.log('║ Key Metrics:                                               ║');
    console.log(`║ - Commission Available: ₹${commData.availableBalance.toFixed(2).padEnd(29)} ║`);
    console.log(`║ - Total Merchants: ${dashData.merchants.total.toString().padEnd(35)} ║`);
    console.log(`║ - Pending Settlements: ${dashData.pendingSettlements.count.toString().padEnd(31)} ║`);
    console.log('╚════════════════════════════════════════════════════════════╝\n');

  } catch (error) {
    console.log('\n❌ ERROR:', error.response?.data?.message || error.message);
    if (error.response?.data) {
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

main();
