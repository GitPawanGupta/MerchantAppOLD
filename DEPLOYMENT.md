# Deployment Guide

## Backend → Railway (Production)

### 1. MongoDB Atlas setup (free database)
1. Go to [mongodb.com/atlas](https://www.mongodb.com/atlas) → Sign up free
2. Create a **Free M0 cluster** (512MB, always on)
3. **Database Access** → Add user → username + password note kar lo
4. **Network Access** → Add IP → `0.0.0.0/0` (allow all — Railway ke liye zaroori)
5. **Connect** → Drivers → Copy connection string:
   ```
   mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/iss_merchant_db
   ```

---

### 2. Railway account + deploy
1. Go to [railway.com](https://railway.com) → Sign up with GitHub
2. **New Project** → **Deploy from GitHub repo**
3. Connect repo: `GitPawanGupta/MerchantAPP`
4. Settings:
   | Field | Value |
   |---|---|
   | **Root Directory** | `backend` |
   | **Build Command** | `npm install` |
   | **Start Command** | `node src/server.js` |
   | **Healthcheck Path** | `/api/health` |

---

### 3. Environment Variables (Railway Dashboard → Variables tab)

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `MONGODB_URI` | *(MongoDB Atlas connection string)* |
| `JWT_SECRET` | *(random 64-char string — use [randomkeygen.com](https://randomkeygen.com))* |
| `JWT_REFRESH_SECRET` | *(another random 64-char string)* |
| `JWT_EXPIRES_IN` | `7d` |
| `JWT_REFRESH_EXPIRES_IN` | `30d` |
| `CASHFREE_APP_ID` | *(from Cashfree PG dashboard)* |
| `CASHFREE_SECRET_KEY` | *(from Cashfree PG dashboard)* |
| `CASHFREE_BASE_URL` | `https://api.cashfree.com/pg` |
| `CASHFREE_PAYOUT_CLIENT_ID` | *(from Cashfree Payout dashboard)* |
| `CASHFREE_PAYOUT_CLIENT_SECRET` | *(from Cashfree Payout dashboard)* |
| `CASHFREE_PAYOUT_BASE_URL` | `https://payout-api.cashfree.com` |
| `CASHFREE_WEBHOOK_SECRET` | *(set same value in Cashfree webhook config)* |
| `APP_BASE_URL` | `https://merchantappold-production.up.railway.app` |
| `FRONTEND_URL` | `https://<your-hostinger-domain>.com` |
| `DEFAULT_COMMISSION_RATE` | `2.0` |
| `MIN_SETTLEMENT_AMOUNT` | `100` |

> **Tip:** For sandbox/testing use:
> - `CASHFREE_BASE_URL` = `https://sandbox.cashfree.com/pg`
> - `CASHFREE_PAYOUT_BASE_URL` = `https://payout-gamma.cashfree.com`

---

### 4. After deploy

**Verify backend is running:**
```
GET https://merchantappold-production.up.railway.app/api/health
```
Expected response:
```json
{ "success": true, "message": "ISS Merchant API is running" }
```

**Seed admin user (one-time only):**
```
POST https://merchantappold-production.up.railway.app/api/admin/seed
```

**Configure Cashfree webhooks:**
| Webhook | URL |
|---|---|
| Payment webhook | `https://merchantappold-production.up.railway.app/api/payment/webhook` |
| Payout webhook | `https://merchantappold-production.up.railway.app/api/settlement/payout-webhook` |

---

### 5. Railway advantages over Render
- ✅ **No cold start / sleep** — always on
- ✅ **$5/month free credit** — sufficient for small apps
- ✅ **Faster builds** with Nixpacks
- ✅ **Auto-deploy** on GitHub push

---

## Flutter App → Update Railway URL

`app_constants.dart` mein Railway URL already updated hai:

```dart
// merchant_app/lib/core/constants/app_constants.dart
static const String baseUrl = 'https://merchantappold-production.up.railway.app/api';
```

Then rebuild APK:
```bash
cd merchant_app
flutter build apk --release
```

---

## Frontend → Hostinger

### 1. Flutter web build
```bash
cd merchant_app
flutter build web --release --base-href "/"
```
Output: `merchant_app/build/web/`

### 2. Upload to Hostinger
1. Login to **Hostinger hPanel** → **File Manager**
2. Navigate to `public_html/`
3. Delete existing files
4. Upload ALL contents of `merchant_app/build/web/`
   - `.htaccess` is already included (SPA routing + HTTPS + caching)
5. Set **Default document** = `index.html` in hPanel → Website → Advanced

### 3. FTP alternative (FileZilla)
- Host: `ftp.<yourdomain>.com` | Port: `21`
- Upload `build/web/*` → `public_html/`

---

## After Full Deployment Checklist

- [ ] `GET /api/health` returns success
- [ ] Admin seeded: `POST /api/admin/seed`
- [ ] Login as admin, change default password
- [ ] Set global commission rate via Admin API
- [ ] Register test merchant → complete KYC → activate
- [ ] Configure Cashfree webhook URLs in Cashfree dashboard
- [ ] Test payment end-to-end in sandbox mode
- [ ] Switch Cashfree URLs to production when ready
- [ ] Flutter app URL updated to Railway URL ✅
- [ ] Fresh APK built and installed

---

## Useful Commands

```bash
# Backend local dev
cd backend && npm run dev

# Flutter local dev (Android emulator)
cd merchant_app && flutter run

# Flutter APK build (production)
cd merchant_app && flutter build apk --release

# Verify backend
node --check src/server.js

# Verify Flutter
flutter analyze
```
