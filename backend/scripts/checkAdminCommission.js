#!/usr/bin/env node

/**
 * Check Admin Commission Status
 */

const axios = require('axios');

const BASE_URL = 'https://app.pasuai.online/api';
const ADMIN_CREDS = {
  email: 'admin@issmerchant.com',
  password: 'Admin@123456',
};

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║         ADMIN COMMISSION CHECK                             ║');
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
    console.log(`│ Email: ${user.email}`);
    console.log(`│ Role: ${user.role}`);
    console.log('└────────────────────────────────────────────────────────┘\n');

    // ─────────────────────────────────────────────────────────────
    console.log('┌─ STEP 2: GET COMMISSION BALANCE ───────────────────────┐');
    const balanceRes = await axios.get(`${BASE_URL}/admin/commission/balance`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const balance = balanceRes.data.data;

    console.log('│ Commission Balance:');
    console.log(`│   Total Collected: ₹${balance.totalCollected.toFixed(2)}`);
    console.log(`│   Total Paid Out: ₹${balance.totalPaidOut.toFixed(2)}`);
    console.log(`│   Available Balance: ₹${balance.availableBalance.toFixed(2)}`);
    console.log(`│   Total Transactions: ${balance.totalTransactions}`);
    console.log(`│   Total Volume: ₹${balance.totalVolume.toFixed(2)}`);
    console.log(`│   Payout Count: ${balance.payoutCount}`);
    console.log('└────────────────────────────────────────────────────────┘\n');

    // ─────────────────────────────────────────────────────────────
    console.log('┌─ STEP 3: GET COMMISSION LEDGER (Last 10) ──────────────┐');
    const ledgerRes = await axios.get(`${BASE_URL}/admin/commission/ledger?limit=10`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const ledger = ledgerRes.data.data;

    console.log(`│ Recent Commission Entries: ${ledger.length}`);
    
    if (ledger.length > 0) {
      let totalInLedger = 0;
      ledger.forEach((entry, i) => {
        console.log(`│ ${i + 1}. Transaction: ${entry.transactionId?.orderId || 'N/A'}`);
        console.log(`│    Commission: ₹${entry.commissionAmount.toFixed(2)}`);
        console.log(`│    Status: ${entry.status}`);
        console.log(`│    Date: ${new Date(entry.createdAt).toLocaleString('en-IN')}`);
        totalInLedger += entry.commissionAmount;
      });
      console.log(`│ Total in Recent 10: ₹${totalInLedger.toFixed(2)}`);
    } else {
      console.log('│ ℹ️  No commission entries found');
    }
    console.log('└────────────────────────────────────────────────────────┘\n');

    // ─────────────────────────────────────────────────────────────
    console.log('┌─ STEP 4: GET ADMIN SETTLEMENTS ────────────────────────┐');
    try {
      const settlementsRes = await axios.get(`${BASE_URL}/admin/settlements?isAdminSettlement=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const settlements = settlementsRes.data.data;

      console.log(`│ Admin Settlements: ${settlements.length}`);
      
      if (settlements.length > 0) {
        settlements.forEach((s, i) => {
          console.log(`│ ${i + 1}. ${s.settlementRef}`);
          console.log(`│    Amount: ₹${s.netAmount}`);
          console.log(`│    Status: ${s.status}`);
          console.log(`│    Date: ${new Date(s.initiatedAt).toLocaleString('en-IN')}`);
        });
      } else {
        console.log('│ ℹ️  No admin settlements yet');
      }
    } catch (err) {
      console.log('│ ⚠️  Could not fetch admin settlements');
      console.log(`│    ${err.response?.data?.message || err.message}`);
    }
    console.log('└────────────────────────────────────────────────────────┘\n');

    // ─────────────────────────────────────────────────────────────
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                     SUMMARY                                ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    
    if (balance.availableBalance > 0) {
      console.log(`║ ✅ Commission Collected: ₹${balance.totalCollected.toFixed(2)}                   ║`);
      console.log(`║ ✅ Available to Withdraw: ₹${balance.availableBalance.toFixed(2)}                ║`);
      console.log('║                                                            ║');
      console.log('║ Admin can request settlement for this amount              ║');
    } else if (balance.totalCollected === 0) {
      console.log('║ ⚠️  No Commission Collected Yet                            ║');
      console.log('║                                                            ║');
      console.log('║ Issue: Commission not being recorded                       ║');
      console.log('║ Check: CommissionLedger entries and settlement flow        ║');
    } else {
      console.log('║ ℹ️  All Commission Already Paid Out                        ║');
    }
    
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
