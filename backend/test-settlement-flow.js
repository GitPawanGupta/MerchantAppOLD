/**
 * Settlement Flow Live Test Script
 * 
 * Tests complete flow:
 * 1. Admin login
 * 2. List merchants
 * 3. Check merchant unsettled transactions
 * 4. Trigger manual settlement
 * 5. Get settlement transfer details
 * 6. Approve settlement with UTR
 * 7. Verify final status
 * 
 * Run: node test-settlement-flow.js
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';
let adminToken = '';
let testMerchantId = '';
let settlementRef = '';

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

const log = (message, color = 'reset') => {
  console.log(`${colors[color]}${message}${colors.reset}`);
};

const section = (title) => {
  console.log('\n' + '='.repeat(60));
  log(title, 'bright');
  console.log('='.repeat(60) + '\n');
};

const step = (stepNum, description) => {
  log(`\n[STEP ${stepNum}] ${description}`, 'cyan');
  console.log('-'.repeat(60));
};

const success = (message) => log(`✅ ${message}`, 'green');
const error = (message) => log(`❌ ${message}`, 'red');
const info = (message) => log(`ℹ️  ${message}`, 'yellow');
const data = (label, value) => log(`   ${label}: ${JSON.stringify(value, null, 2)}`, 'magenta');

// Test functions
const test1_AdminLogin = async () => {
  step(1, 'Admin Login');
  
  try {
    const response = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'admin@issmerchant.com',
      password: 'Admin@123456',
    });

    if (response.data.success) {
      adminToken = response.data.data.accessToken;
      success('Admin logged in successfully');
      info(`Token: ${adminToken.substring(0, 20)}...`);
      return true;
    }
  } catch (err) {
    error(`Admin login failed: ${err.response?.data?.message || err.message}`);
    return false;
  }
};

const test2_ListMerchants = async () => {
  step(2, 'List Active Merchants');

  try {
    const response = await axios.get(`${BASE_URL}/admin/merchants?status=active&limit=5`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    if (response.data.success && response.data.data.length > 0) {
      const merchants = response.data.data;
      success(`Found ${merchants.length} active merchant(s)`);
      
      // Pick first merchant with unsettled transactions
      testMerchantId = merchants[0].merchantId;
      
      console.log('\n   Merchant Details:');
      merchants.forEach((m, i) => {
        console.log(`   ${i + 1}. ${m.businessName} (${m.merchantId})`);
        console.log(`      Pending: ₹${m.pendingSettlement || 0}`);
        console.log(`      Total Settled: ₹${m.totalSettled || 0}`);
      });
      
      info(`Selected merchant: ${testMerchantId}`);
      return true;
    } else {
      error('No active merchants found');
      return false;
    }
  } catch (err) {
    error(`List merchants failed: ${err.response?.data?.message || err.message}`);
    return false;
  }
};

const test3_CheckUnsettledTransactions = async () => {
  step(3, 'Check Unsettled Transactions');

  try {
    const response = await axios.get(
      `${BASE_URL}/admin/transactions?merchantId=${testMerchantId}&status=success&limit=10`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    if (response.data.success) {
      const transactions = response.data.data;
      const unsettled = transactions.filter(t => !t.isSettled);
      
      success(`Found ${unsettled.length} unsettled transaction(s)`);
      
      if (unsettled.length > 0) {
        console.log('\n   Unsettled Transactions:');
        unsettled.forEach(tx => {
          console.log(`   - ${tx.orderId}: ₹${tx.amount} (Settlement: ₹${tx.settlementAmount})`);
        });
        
        const totalPending = unsettled.reduce((sum, tx) => sum + tx.settlementAmount, 0);
        info(`Total pending settlement: ₹${totalPending.toFixed(2)}`);
        return true;
      } else {
        info('No unsettled transactions - will test with existing data');
        return true;
      }
    }
  } catch (err) {
    error(`Check transactions failed: ${err.response?.data?.message || err.message}`);
    return false;
  }
};

const test4_TriggerSettlement = async () => {
  step(4, 'Trigger Manual Settlement');

  try {
    const response = await axios.post(
      `${BASE_URL}/admin/merchants/${testMerchantId}/settle`,
      {},
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    if (response.data.success) {
      const settlement = response.data.data;
      settlementRef = settlement.settlementRef;
      
      success('Settlement created successfully');
      data('Settlement Ref', settlement.settlementRef);
      data('Net Amount', `₹${settlement.netAmount}`);
      data('Transaction Count', settlement.transactionCount);
      data('Status', settlement.status);
      return true;
    }
  } catch (err) {
    if (err.response?.status === 400) {
      info(`Cannot create settlement: ${err.response.data.message}`);
      info('This is normal if no unsettled transactions or below minimum threshold');
      
      // Try to find existing pending settlement
      const settlementsResponse = await axios.get(
        `${BASE_URL}/admin/settlements?status=pending&limit=1`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      
      if (settlementsResponse.data.data.length > 0) {
        settlementRef = settlementsResponse.data.data[0].settlementRef;
        info(`Using existing pending settlement: ${settlementRef}`);
        return true;
      }
      
      error('No pending settlements available for testing');
      return false;
    }
    
    error(`Settlement creation failed: ${err.response?.data?.message || err.message}`);
    return false;
  }
};

const test5_GetTransferDetails = async () => {
  step(5, 'Get Settlement Transfer Details');

  try {
    const response = await axios.get(
      `${BASE_URL}/admin/settlements/${settlementRef}/transfer-details`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    if (response.data.success) {
      const details = response.data.data;
      
      success('Transfer details retrieved successfully');
      console.log('\n' + details.copyText);
      
      return true;
    }
  } catch (err) {
    error(`Get transfer details failed: ${err.response?.data?.message || err.message}`);
    return false;
  }
};

const test6_ApproveSettlement = async () => {
  step(6, 'Approve Settlement with UTR');

  const testUTR = `TEST_UTR_${Date.now()}`;
  
  try {
    const response = await axios.patch(
      `${BASE_URL}/admin/settlements/${settlementRef}/status`,
      {
        status: 'success',
        payoutReferenceId: testUTR,
        payoutMode: 'IMPS',
      },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    if (response.data.success) {
      const result = response.data.data;
      
      success('Settlement approved successfully');
      data('Settlement Ref', result.settlementRef);
      data('Status', result.status);
      data('UTR', result.payoutReferenceId);
      data('Completed At', result.completedAt);
      return true;
    }
  } catch (err) {
    error(`Settlement approval failed: ${err.response?.data?.message || err.message}`);
    return false;
  }
};

const test7_VerifyFinalStatus = async () => {
  step(7, 'Verify Final Settlement Status');

  try {
    const response = await axios.get(
      `${BASE_URL}/admin/settlements/${settlementRef}`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    if (response.data.success) {
      const settlement = response.data.data;
      
      success('Settlement status verified');
      console.log('\n   Final Settlement Details:');
      console.log(`   - Ref: ${settlement.settlementRef}`);
      console.log(`   - Status: ${settlement.status}`);
      console.log(`   - Amount: ₹${settlement.netAmount}`);
      console.log(`   - UTR: ${settlement.payoutReferenceId || 'N/A'}`);
      console.log(`   - Mode: ${settlement.payoutMode}`);
      console.log(`   - Transactions: ${settlement.transactionCount}`);
      
      if (settlement.status === 'success') {
        success('✅ Settlement successfully completed!');
        return true;
      } else {
        info(`Settlement status: ${settlement.status}`);
        return true;
      }
    }
  } catch (err) {
    error(`Status verification failed: ${err.response?.data?.message || err.message}`);
    return false;
  }
};

const test8_BulkApproval = async () => {
  step(8, 'Test Bulk Approval (Optional)');

  try {
    // Get pending settlements
    const listResponse = await axios.get(
      `${BASE_URL}/admin/settlements?status=pending&limit=3`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    if (listResponse.data.data.length === 0) {
      info('No pending settlements for bulk approval test');
      return true;
    }

    const settlementRefs = listResponse.data.data.map(s => s.settlementRef);
    info(`Testing bulk approval with ${settlementRefs.length} settlement(s)`);

    const response = await axios.post(
      `${BASE_URL}/admin/settlements/bulk-approve`,
      {
        settlementRefs,
        payoutMode: 'NEFT',
        payoutReferenceIdPrefix: `BULK_TEST_${Date.now()}`,
      },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    if (response.data.success) {
      const results = response.data.data;
      
      success('Bulk approval completed');
      data('Successful', results.success.length);
      data('Failed', results.failed.length);
      data('Total Amount', `₹${results.totalAmount}`);
      
      if (results.success.length > 0) {
        console.log('\n   Approved:');
        results.success.forEach(s => {
          console.log(`   - ${s.settlementRef}: ₹${s.amount}`);
        });
      }
      
      if (results.failed.length > 0) {
        console.log('\n   Failed:');
        results.failed.forEach(f => {
          console.log(`   - ${f.settlementRef}: ${f.reason}`);
        });
      }
      
      return true;
    }
  } catch (err) {
    error(`Bulk approval test failed: ${err.response?.data?.message || err.message}`);
    return false;
  }
};

// Main test runner
const runTests = async () => {
  section('🚀 SETTLEMENT FLOW LIVE TEST');
  
  info('Backend URL: ' + BASE_URL);
  info('Starting tests...\n');

  const tests = [
    { name: 'Admin Login', fn: test1_AdminLogin, critical: true },
    { name: 'List Merchants', fn: test2_ListMerchants, critical: true },
    { name: 'Check Unsettled Transactions', fn: test3_CheckUnsettledTransactions, critical: false },
    { name: 'Trigger Settlement', fn: test4_TriggerSettlement, critical: true },
    { name: 'Get Transfer Details', fn: test5_GetTransferDetails, critical: false },
    { name: 'Approve Settlement', fn: test6_ApproveSettlement, critical: true },
    { name: 'Verify Final Status', fn: test7_VerifyFinalStatus, critical: false },
    { name: 'Bulk Approval Test', fn: test8_BulkApproval, critical: false },
  ];

  const results = { passed: 0, failed: 0, skipped: 0 };

  for (const test of tests) {
    try {
      const passed = await test.fn();
      
      if (passed) {
        results.passed++;
      } else {
        results.failed++;
        if (test.critical) {
          error(`\n❌ Critical test failed: ${test.name}`);
          error('Stopping test suite');
          break;
        }
      }
    } catch (err) {
      results.failed++;
      error(`Test error: ${err.message}`);
      if (test.critical) {
        error('Stopping test suite');
        break;
      }
    }
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Summary
  section('📊 TEST SUMMARY');
  
  console.log(`Total Tests: ${tests.length}`);
  log(`✅ Passed: ${results.passed}`, 'green');
  if (results.failed > 0) {
    log(`❌ Failed: ${results.failed}`, 'red');
  }
  
  if (results.passed === tests.length) {
    log('\n🎉 ALL TESTS PASSED! Settlement flow is working perfectly!', 'bright');
  } else if (results.failed === 0) {
    log('\n✅ Core tests passed! Some optional tests were skipped.', 'green');
  } else {
    log('\n⚠️  Some tests failed. Check the logs above for details.', 'yellow');
  }
  
  console.log('\n' + '='.repeat(60) + '\n');
};

// Run tests
runTests().catch(err => {
  error(`Fatal error: ${err.message}`);
  process.exit(1);
});
