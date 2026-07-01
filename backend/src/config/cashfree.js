const axios = require('axios');

// ─── Payment Gateway Config ─────────────────────────────────────────────────
const CASHFREE_PG = {
  appId: process.env.CASHFREE_APP_ID,
  secretKey: process.env.CASHFREE_SECRET_KEY,
  baseUrl: process.env.CASHFREE_BASE_URL || 'https://sandbox.cashfree.com/pg',
};

// ─── Payout Config ───────────────────────────────────────────────────────────
const CASHFREE_PAYOUT = {
  clientId: process.env.CASHFREE_PAYOUT_CLIENT_ID,
  clientSecret: process.env.CASHFREE_PAYOUT_CLIENT_SECRET,
  baseUrl: process.env.CASHFREE_PAYOUT_BASE_URL || 'https://payout-gamma.cashfree.com',
};

// ─── PG Axios Instance ────────────────────────────────────────────────────────
const pgClient = axios.create({
  baseURL: CASHFREE_PG.baseUrl,
  headers: {
    'x-client-id': CASHFREE_PG.appId,
    'x-client-secret': CASHFREE_PG.secretKey,
    'x-api-version': '2023-08-01',
    'Content-Type': 'application/json',
  },
});

// ─── Payout Token Cache ───────────────────────────────────────────────────────
let payoutToken = null;
let payoutTokenExpiry = null;

const getPayoutToken = async () => {
  const now = Date.now();

  // Return cached token if still valid (with 5 min buffer)
  if (payoutToken && payoutTokenExpiry && now < payoutTokenExpiry - 300000) {
    return payoutToken;
  }

  const res = await axios.post(
    `${CASHFREE_PAYOUT.baseUrl}/payout/v1/authorize`,
    {},
    {
      headers: {
        'X-Client-Id': CASHFREE_PAYOUT.clientId,
        'X-Client-Secret': CASHFREE_PAYOUT.clientSecret,
      },
    }
  );

  if (res.data.status !== 'SUCCESS') {
    throw new Error('Cashfree Payout authorization failed');
  }

  payoutToken = res.data.data.token;
  // Token typically valid for 1 hour
  payoutTokenExpiry = now + 3600 * 1000;

  return payoutToken;
};

// ─── Payout Axios Instance (with dynamic auth) ───────────────────────────────
const getPayoutClient = async () => {
  const token = await getPayoutToken();

  return axios.create({
    baseURL: CASHFREE_PAYOUT.baseUrl,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
};

module.exports = {
  CASHFREE_PG,
  CASHFREE_PAYOUT,
  pgClient,
  getPayoutClient,
  getPayoutToken,
};
