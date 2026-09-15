const bcrypt = require('bcryptjs');
const { admin, getDb } = require('./lib/firebase');

const DEFAULT_ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@marinanixon.com';
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@1234';
const DEFAULT_ADMIN_FIRST_NAME = process.env.ADMIN_FIRST_NAME || 'Marina';
const DEFAULT_ADMIN_LAST_NAME = process.env.ADMIN_LAST_NAME || 'Nixon';
const DEFAULT_ADMIN_PHONE = process.env.ADMIN_PHONE || '+233000000000';

const DEFAULT_PRODUCTS = [
  { id: '1', name: 'Noir Gown', category: 'evening', label: 'Evening Wear', price: 850, old_price: null, badge: 'new', stock: 15, description: 'Signature evening gown.', sizes: ['XS', 'S', 'M', 'L', 'XL'] },
  { id: '2', name: 'Velour Dress', category: 'evening', label: 'Evening Wear', price: 620, old_price: null, badge: null, stock: 20, description: 'Soft velour dress.', sizes: ['XS', 'S', 'M', 'L'] },
  { id: '3', name: 'Linen Blazer', category: 'casual', label: 'Casual Luxe', price: 480, old_price: null, badge: 'best', stock: 25, description: 'Tailored linen blazer.', sizes: ['S', 'M', 'L', 'XL'] },
  { id: '4', name: 'Wrap Midi', category: 'casual', label: 'Casual Luxe', price: 390, old_price: null, badge: null, stock: 18, description: 'Everyday wrap midi.', sizes: ['XS', 'S', 'M', 'L'] },
  { id: '5', name: 'Classic Trench', category: 'heritage', label: 'Heritage Line', price: 920, old_price: null, badge: null, stock: 12, description: 'Classic trench coat.', sizes: ['S', 'M', 'L', 'XL'] },
  { id: '6', name: 'Silk Blouse', category: 'new', label: 'New Arrival', price: 340, old_price: null, badge: 'new', stock: 30, description: 'Lightweight silk blouse.', sizes: ['XS', 'S', 'M', 'L'] },
  { id: '7', name: 'Pleated Skirt', category: 'casual', label: 'Casual Luxe', price: 280, old_price: 380, badge: 'sale', stock: 22, description: 'Pleated midi skirt.', sizes: ['XS', 'S', 'M', 'L'] },
  { id: '8', name: 'Tailored Suit', category: 'heritage', label: 'Heritage Line', price: 1150, old_price: null, badge: 'best', stock: 10, description: 'Structured tailored suit.', sizes: ['S', 'M', 'L', 'XL'] },
];

async function ensureAdminAccount(db = getDb()) {
  const adminHash = bcrypt.hashSync(DEFAULT_ADMIN_PASSWORD, 10);
  let authUser = null;

  try {
    authUser = await admin.auth().getUserByEmail(DEFAULT_ADMIN_EMAIL);
  } catch (err) {
    if (err.code !== 'auth/user-not-found') throw err;
  }

  if (!authUser) {
    await admin.auth().createUser({
      email: DEFAULT_ADMIN_EMAIL,
      password: DEFAULT_ADMIN_PASSWORD,
      displayName: `${DEFAULT_ADMIN_FIRST_NAME} ${DEFAULT_ADMIN_LAST_NAME}`.trim(),
      phoneNumber: DEFAULT_ADMIN_PHONE,
      emailVerified: true,
    });
  } else {
    await admin.auth().updateUser(authUser.uid, {
      password: DEFAULT_ADMIN_PASSWORD,
      displayName: `${DEFAULT_ADMIN_FIRST_NAME} ${DEFAULT_ADMIN_LAST_NAME}`.trim(),
      phoneNumber: DEFAULT_ADMIN_PHONE,
      emailVerified: true,
    });
  }

  await db.collection('users').doc(DEFAULT_ADMIN_EMAIL).set(
    {
      first_name: DEFAULT_ADMIN_FIRST_NAME,
      last_name: DEFAULT_ADMIN_LAST_NAME,
      email: DEFAULT_ADMIN_EMAIL,
      phone: DEFAULT_ADMIN_PHONE,
      password: adminHash,
      role: 'admin',
      is_verified: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { merge: true }
  );
}

async function ensureProducts(db = getDb()) {
  const snap = await db.collection('products').limit(1).get();
  if (!snap.empty) return;

  const batch = db.batch();
  const now = new Date().toISOString();

  DEFAULT_PRODUCTS.forEach((product) => {
    const ref = db.collection('products').doc(String(product.id));
    batch.set(ref, {
      ...product,
      sizes: Array.isArray(product.sizes) ? product.sizes : [],
      created_at: now,
      updated_at: now,
    });
  });

  await batch.commit();
}

async function bootstrap() {
  const db = getDb();
  await ensureAdminAccount(db);
  await ensureProducts(db);
  return db;
}

module.exports = { bootstrap, ensureAdminAccount, ensureProducts, DEFAULT_PRODUCTS };
