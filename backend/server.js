const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { bootstrap } = require('./bootstrap');

const app = express();
const production = process.env.NODE_ENV === 'production';

const allowedOrigins = String(process.env.CORS_ORIGIN || process.env.FRONTEND_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

function validateProductionEnv() {
  if (!production) return;

  const missing = [];
  if (!process.env.ADMIN_EMAIL) missing.push('ADMIN_EMAIL');
  if (!process.env.ADMIN_PASSWORD) missing.push('ADMIN_PASSWORD');
  if (!process.env.CLOUDINARY_CLOUD_NAME) missing.push('CLOUDINARY_CLOUD_NAME');
  if (!process.env.CLOUDINARY_API_KEY) missing.push('CLOUDINARY_API_KEY');
  if (!process.env.CLOUDINARY_API_SECRET) missing.push('CLOUDINARY_API_SECRET');

  const hasFirebaseJson = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const hasFirebaseParts = Boolean(
    process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY
  );

  if (!hasFirebaseJson && !hasFirebaseParts) missing.push('FIREBASE_* credentials');

  if (missing.length) {
    throw new Error(`Missing required production env vars: ${missing.join(', ')}`);
  }
}

validateProductionEnv();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(morgan(production ? 'combined' : 'dev'));
app.use(cors({
  origin(origin, callback) {
    if (!origin || !allowedOrigins.length || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('CORS origin not allowed'));
  },
  credentials: true,
}));
app.use(express.json({
  limit: '20mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  },
}));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

const { getPromoDetails } = require('./lib/promo');

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

const buildTrackingTimeline = (status) => {
  const map = {
    processing: ['done', 'curr', 'pend', 'pend'],
    paid: ['done', 'done', 'curr', 'pend'],
    shipped: ['done', 'done', 'done', 'curr'],
    delivered: ['done', 'done', 'done', 'done'],
    cancelled: ['done', 'done', 'pend', 'pend'],
  };

  const steps = ['Order placed', 'Confirmed', 'In transit', 'Delivered'];
  const state = map[status] || map.processing;

  return steps.map((label, index) => ({
    label,
    done: state[index] === 'done',
    current: state[index] === 'curr',
  }));
};

app.get('/api/health', (req, res) => {
  res.json({ status: 'API is running', timestamp: new Date().toISOString() });
});

app.post('/api/promo', (req, res) => {
  const code = String(req.body?.code || '').trim().toUpperCase();

  if (!code) {
    return res.status(400).json({ success: false, message: 'Promo code required' });
  }

  const promo = getPromoDetails(code);
  if (!promo) {
    return res.json({ success: false, message: 'Invalid promo code.' });
  }

  res.json({
    success: true,
    message: `✓ ${promo.discount_value}${promo.discount_type === 'percent' ? '%' : 'GH₵'} discount applied!`,
    promo,
  });
});

app.post('/api/newsletter', async (req, res) => {
  const db = require('./lib/firebase').getDb();
  const email = String(req.body?.email || '').trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, message: 'Valid email required' });
  }

  const ref = db.collection('newsletter_subscribers').doc(email);
  const snap = await ref.get();
  if (snap.exists) {
    return res.json({ success: true, message: 'You are already subscribed.' });
  }

  await ref.set({ email, subscribed_at: new Date().toISOString() });
  res.json({ success: true, message: 'Subscribed successfully! Use promo code WELCOME10 for 10% off.' });
});

app.post('/api/contact', async (req, res) => {
  const db = require('./lib/firebase').getDb();
  const { first_name, last_name, email, subject, message } = req.body || {};

  if (!email || !first_name || !message) {
    return res.status(400).json({ success: false, message: 'First name, email, and message are required' });
  }

  const docRef = db.collection('contact_inquiries').doc();
  await docRef.set({
    first_name: String(first_name).trim(),
    last_name: String(last_name || '').trim(),
    email: String(email).trim().toLowerCase(),
    subject: String(subject || 'General inquiry').trim(),
    message: String(message).trim(),
    created_at: new Date().toISOString(),
  });

  res.json({ success: true, message: "Thank you for reaching out! We'll reply within 24 hours." });
});

app.get('/api/track-order', async (req, res) => {
  const db = require('./lib/firebase').getDb();
  const reference = String(req.query.reference || '').trim();

  if (!reference) {
    return res.status(400).json({ success: false, message: 'Order reference required' });
  }

  const ordersSnap = await db.collection('orders').where('order_number', '==', reference).limit(1).get();
  if (ordersSnap.empty) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }

  const orderDoc = ordersSnap.docs[0];
  const order = orderDoc.data();
  const userSnap = await db.collection('users').doc(String(order.user_id)).get();
  const user = userSnap.exists ? userSnap.data() : {};
  const itemsSnap = await db.collection('order_items').where('order_id', '==', orderDoc.id).get();

  res.json({
    success: true,
    order: {
      reference: order.order_number,
      status: order.status,
      total: order.total,
      created_at: order.created_at,
      payment_method: order.payment_method,
      delivery_method: order.delivery_method,
      customer: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
    },
    items: itemsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    timeline: buildTrackingTimeline(order.status),
  });
});

app.use('/api', apiLimiter);
app.use('/api/auth', authLimiter, require('./routes/auth')());
app.use('/api/products', require('./routes/products')());
app.use('/api/orders', require('./routes/orders')());
app.use('/api/users', require('./routes/users')());
app.use('/api/payments', require('./routes/payments')());
app.use('/api/admin', require('./routes/admin')());

app.get('/api/settings', async (req, res) => {
  try {
    const { getDb } = require('./lib/firebase');
    const db = getDb();
    const doc = await db.collection('site_settings').doc('main').get();
    if (doc.exists) {
      return res.json(doc.data());
    }
    return res.json({});
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});


app.use('/images', express.static(path.join(__dirname, '..', 'images'), {
  maxAge: production ? '1y' : 0,
  immutable: production,
}));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

app.get(/^\/(?!api\b).*/, (req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.accepts('html')) {
    return res.sendFile(path.join(__dirname, '..', 'index.html'));
  }
  return next();
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

const PORT = process.env.PORT || 5000;

async function start() {
  await bootstrap();
  app.listen(PORT, () => {
    console.log(`Marina Nixon Backend running on port ${PORT}`);
  });
}

if (require.main === module) {
  start().catch((err) => {
    console.error('Failed to start server:', err);
    process.exitCode = 1;
  });
}

module.exports = { app, start };

