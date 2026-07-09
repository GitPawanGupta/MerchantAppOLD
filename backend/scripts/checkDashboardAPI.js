#!/usr/bin/env node

/**
 * Check Dashboard API with Live Credentials
 * Tests the hasPendingSettlement flag
 */

const axios = require('axios');

const BASE_URL = 'https://app.pasuai.online/api';
const TEST_MERCHANT = {
  email: 'erpawan459@gmail.com',
  password: 'Pawan@006',
};

async function main() {
  console.log('========================================');
  console.log('  DASHBOARD API TEST');
  console.log(`  Target: ${BASE_URL}`);
  console.log('========================================\n');

  let token;

  try {
    // Step 1: Login
    console.log('[1] LOGIN');
    const loginRes = await axios.post(`${BASE_URL}/auth/login`, TEST_MERCHANT);
    token = loginRes.data.data.accessToken;
    const merchant = loginRes.data.data.merchant;
    console.log(`    Status: ✅ OK`);
    console.log(`    Merchant: ${merchant.businessName} (${merchant.merchantId})`);
    console.log(`    KYC: ${merchant.kycStatus} | Active: ${merchant.status}\n`);

    // Step 2: Get Dashboard
    console.log('[2] DASHBOARD API');
    const dashRes = await axios.get(`${BASE_URL}/merchant/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = dashRes.data.data;
    const summary = data.summary;

    console.log(`    Status: ✅ OK`);
    console.log(`    Total Collected: ₹${summary.totalCollected}`);
    console.log(`    Total Settled: ₹${summary.totalSettled}`);
    console.log(`    Pending Settlement: ₹${summary.pendingSettlement}`);
    console.log(`    hasPendingSettlement: ${summary.hasPendingSettlement ? '✅ TRUE' : '❌ FALSE'}\n`);

    // Step 3: Check Pending Settlements
    console.log('[3] PENDING SETTLEMENTS');
    const settlementRes = await axios.get(`${BASE_URL}/settlement?status=pending`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const settlements = settlementRes.data.data; // data is the array directly
    console.log(`    Count: ${settlements.length}`);
    
    if (settlements.length > 0) {
      settlements.forEach((s) => {
        console.log(`    - ${s.settlementRef} | ₹${s.netAmount} | ${s.status} | ${s.transactionCount} txns`);
      });
    } else {
      console.log(`    No pending settlements`);
    }
    console.log();

    // Step 4: Try to request settlement (will be blocked if already pending)
    console.log('[4] TEST SETTLEMENT REQUEST');
    const bankRes = await axios.get(`${BASE_URL}/merchant/bank-accounts`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const accounts = bankRes.data.data;
    
    if (accounts.length === 0) {
      console.log(`    ⚠️ No bank accounts found`);
    } else {
      const primaryAccount = accounts.find(a => a.isPrimary) || accounts[0];
      console.log(`    Bank Account: ${primaryAccount.bankName} - ${primaryAccount.accountNumber}`);
      
      try {
        const settleReq = await axios.post(
          `${BASE_URL}/settlement/request`,
          { bankAccountId: primaryAccount._id },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        console.log(`    Result: ✅ Settlement created`);
        console.log(`    Settlement Ref: ${settleReq.data.data.settlementRef}`);
        console.log(`    Amount: ₹${settleReq.data.data.netAmount}`);
      } catch (err) {
        if (err.response) {
          console.log(`    Result: ⚠️ ${err.response.data.message}`);
        } else {
          console.log(`    Result: ❌ ${err.message}`);
        }
      }
    }
    console.log();

    console.log('========================================');
    console.log('  ✅ TEST COMPLETE');
    console.log('========================================');

  } catch (error) {
    console.error('\n❌ ERROR:', error.response?.data || error.message);
    process.exit(1);
  }
}

main();
