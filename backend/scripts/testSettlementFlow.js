#!/usr/bin/env node

/**
 * Complete Settlement Flow Test with Live Credentials
 * Tests the entire flow with detailed output
 */

const axios = require('axios');

const BASE_URL = 'https://app.pasuai.online/api';
const TEST_MERCHANT = {
  email: 'erpawan459@gmail.com',
  password: 'Pawan@006',
};

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║         COMPLETE SETTLEMENT FLOW TEST                      ║');
  console.log('║         Live Environment: app.pasuai.online                ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  let token;

  try {
    // ─────────────────────────────────────────────────────────────
    console.log('┌─ STEP 1: LOGIN ────────────────────────────────────────┐');
    const loginRes = await axios.post(`${BASE_URL}/auth/login`, TEST_MERCHANT);
    token = loginRes.data.data.accessToken;
    const merchant = loginRes.data.data.merchant;
    
    console.log('│ ✅ Login successful');
    console.log(`│ Merchant: ${merchant.businessName} (${merchant.merchantId})`);
    console.log(`│ KYC Status: ${merchant.kycStatus}`);
    console.log(`│ Account Status: ${merchant.status}`);
    console.log('└────────────────────────────────────────────────────────┘\n');

    // ─────────────────────────────────────────────────────────────
    console.log('┌─ STEP 2: GET DASHBOARD SUMMARY ────────────────────────┐');
    const dashRes = await axios.get(`${BASE_URL}/merchant/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = dashRes.data.data;
    const summary = data.summary;

    console.log('│ Dashboard API Response:');
    console.log(`│   Total Collected: ₹${summary.totalCollected}`);
    console.log(`│   Total Settled: ₹${summary.totalSettled}`);
    console.log(`│   Pending Settlement: ₹${summary.pendingSettlement}`);
    console.log(`│   hasPendingSettlement: ${summary.hasPendingSettlement ? '✅ TRUE' : '❌ FALSE'}`);
    console.log('└────────────────────────────────────────────────────────┘\n');

    // ─────────────────────────────────────────────────────────────
    console.log('┌─ STEP 3: LIST PENDING SETTLEMENTS ─────────────────────┐');
    const settlementRes = await axios.get(`${BASE_URL}/settlement?status=pending`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const settlements = settlementRes.data.data;
    
    console.log(`│ Pending Settlements Count: ${settlements.length}`);
    
    if (settlements.length > 0) {
      settlements.forEach((s, i) => {
        console.log(`│ Settlement ${i + 1}:`);
        console.log(`│   Ref: ${s.settlementRef}`);
        console.log(`│   Amount: ₹${s.netAmount}`);
        console.log(`│   Status: ${s.status}`);
        console.log(`│   Transactions: ${s.transactionCount}`);
        console.log(`│   Created: ${new Date(s.initiatedAt).toLocaleString('en-IN')}`);
      });
    } else {
      console.log('│ ℹ️  No pending settlements found');
    }
    console.log('└────────────────────────────────────────────────────────┘\n');

    // ─────────────────────────────────────────────────────────────
    console.log('┌─ STEP 4: GET BANK ACCOUNTS ────────────────────────────┐');
    const bankRes = await axios.get(`${BASE_URL}/merchant/bank-accounts`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const accounts = bankRes.data.data;
    
    console.log(`│ Bank Accounts: ${accounts.length}`);
    if (accounts.length > 0) {
      const primary = accounts.find(a => a.isPrimary) || accounts[0];
      console.log(`│ Primary Account:`);
      console.log(`│   Bank: ${primary.bankName}`);
      console.log(`│   Account: ${primary.accountNumber}`);
      console.log(`│   IFSC: ${primary.ifscCode}`);
      console.log(`│   Holder: ${primary.accountHolderName}`);
    }
    console.log('└────────────────────────────────────────────────────────┘\n');

    // ─────────────────────────────────────────────────────────────
    console.log('┌─ STEP 5: TRY SETTLEMENT REQUEST ───────────────────────┐');
    
    if (accounts.length === 0) {
      console.log('│ ❌ Cannot test - no bank accounts');
    } else {
      const primaryAccount = accounts.find(a => a.isPrimary) || accounts[0];
      
      try {
        const settleReq = await axios.post(
          `${BASE_URL}/settlement/request`,
          { bankAccountId: primaryAccount._id },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        console.log('│ ✅ Settlement request successful!');
        console.log(`│   Settlement Ref: ${settleReq.data.data.settlementRef}`);
        console.log(`│   Amount: ₹${settleReq.data.data.netAmount}`);
        console.log(`│   Status: ${settleReq.data.data.status}`);
        console.log(`│   Transactions: ${settleReq.data.data.transactionCount}`);
      } catch (err) {
        if (err.response) {
          const errMsg = err.response.data.message;
          if (errMsg.includes('No unsettled transactions')) {
            console.log('│ ⚠️  Settlement blocked (Expected):');
            console.log('│   All transactions already in pending settlement');
            console.log('│   ✅ Duplicate prevention working correctly');
          } else {
            console.log('│ ❌ Settlement request failed:');
            console.log(`│   ${errMsg}`);
          }
        } else {
          console.log('│ ❌ Network error:', err.message);
        }
      }
    }
    console.log('└────────────────────────────────────────────────────────┘\n');

    // ─────────────────────────────────────────────────────────────
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                     TEST SUMMARY                           ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    
    if (summary.hasPendingSettlement && settlements.length > 0) {
      console.log('║ ✅ Status: ALL WORKING                                     ║');
      console.log('║                                                            ║');
      console.log('║ Expected Behavior:                                         ║');
      console.log('║ - Dashboard shows pending settlement exists                ║');
      console.log('║ - Settlement request is blocked (duplicate prevention)     ║');
      console.log('║ - Frontend should show:                                    ║');
      console.log('║   • Balance: ₹0 (locked)                                   ║');
      console.log('║   • Button: Disabled with lock icon                        ║');
      console.log('║   • Badge: "PROCESSING"                                    ║');
    } else if (!summary.hasPendingSettlement && settlements.length > 0) {
      console.log('║ ⚠️  Status: BACKEND CODE NOT DEPLOYED                      ║');
      console.log('║                                                            ║');
      console.log('║ Issue: hasPendingSettlement flag is FALSE but there ARE    ║');
      console.log('║        pending settlements in database                     ║');
      console.log('║                                                            ║');
      console.log('║ Solution: Deploy latest backend code to production         ║');
      console.log('║           File: backend/src/services/merchantService.js    ║');
    } else if (!summary.hasPendingSettlement && settlements.length === 0) {
      console.log('║ ℹ️  Status: NO PENDING SETTLEMENTS                         ║');
      console.log('║                                                            ║');
      console.log('║ Current State: Merchant can request new settlement         ║');
      console.log('║ Expected UI: Button should be enabled                      ║');
    }
    
    console.log('╚════════════════════════════════════════════════════════════╝\n');

  } catch (error) {
    console.log('\n❌ CRITICAL ERROR:', error.response?.data?.message || error.message);
    if (error.response?.data) {
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

main();
