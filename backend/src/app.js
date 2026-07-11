require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const path = require('path');

const connectDB = require('./config/database');
const routes = require('./routes');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');
const logger = require('./utils/logger');

// ─── Initialize Firebase Admin SDK at startup ────────────────────────────────
// Eagerly require so "Firebase Admin SDK initialized" appears in startup logs.
// If FIREBASE_SERVICE_ACCOUNT env var is missing the service logs an error but
// the app continues to run — notifications will simply be skipped.
require('./services/notificationService');

const app = express();

// ─── Trust Proxy (for Railway/Render deployments behind reverse proxy) ───────
app.set('trust proxy', 1);

// ─── Connect Database ─────────────────────────────────────────────────────────
connectDB();

// ─── Security Middleware ──────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, curl)
      if (!origin) return callback(null, true);

      const rawAllowed = process.env.FRONTEND_URL || 'http://localhost:3000';
      const allowed = rawAllowed.split(',').map((o) => o.trim());

      const isAllowed =
        allowed.includes(origin) ||
        // Render deployments
        /\.onrender\.com$/.test(origin) ||
        // Hostinger deployments
        /\.hostingersite\.com$/.test(origin) ||
        /\.hostinger\.com$/.test(origin) ||
        // Custom domain (pasuai.online and all subdomains)
        /\.pasuai\.online$/.test(origin) ||
        origin === 'https://pasuai.online' ||
        // Railway deployments
        /\.railway\.app$/.test(origin) ||
        // localhost on any port (Flutter web dev / Postman / browser testing)
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

      if (isAllowed) return callback(null, true);
      callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-webhook-signature',
      'x-razorpay-signature',
    ],
  })
);

// ─── Request Parsing ──────────────────────────────────────────────────────────
// NOTE: /api/payment/webhook and /api/partner/webhook apply
// express.raw() themselves inside their own route files — do NOT add global
// express.raw() here or it will conflict with express.json() on other routes.
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ─── HTTP Logging ─────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(
    morgan('combined', {
      stream: { write: (msg) => logger.info(msg.trim()) },
      skip: (req) => req.url === '/api/health',
    })
  );
}

// ─── Static Files (KYC docs) ──────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ─── Rate Limiting ────────────────────────────────────────────────────────────
app.use('/api', apiLimiter);

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api', routes);

// ─── Root redirect ────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.redirect('/api/health');
});

// ─── Cloudflare Custom Hostname Verification ──────────────────────────────────
// Cloudflare polls this URL to verify custom domain ownership.
// Must return 200 before the route hits the 404 handler.
app.get('/.well-known/cf-custom-hostname-challenge/:token', (req, res) => {
  res.status(200).send(req.params.token);
});

// ─── 404 + Global Error Handler ──────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

module.exports = app;
