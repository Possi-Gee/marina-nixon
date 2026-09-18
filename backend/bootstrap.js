const bcrypt = require('bcryptjs');
const { admin, getDb } = require('./lib/firebase');

const DEFAULT_ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@marinanixon.com';
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@1234';
const DEFAULT_ADMIN_FIRST_NAME = process.env.ADMIN_FIRST_NAME || 'Marina';
const DEFAULT_ADMIN_LAST_NAME = process.env.ADMIN_LAST_NAME || 'Nixon';
const DEFAULT_ADMIN_PHONE = process.env.ADMIN_PHONE || '+233000000000';

const DEFAULT_PRODUCTS = [
  { id: 'w1', name: 'Citron Luxe Cape', category: 'evening', cat: 'evening', label: 'Evening Wear', price: 850, old_price: null, badge: 'new', stock: 15, img: 'images/catalog/w1.jpg', sizes: ['XS','S','M','L','XL'], description: 'Signature Citron Luxe evening cape.' },
  { id: 'w2', name: 'Velour Wrap Dress', category: 'evening', cat: 'evening', label: 'Evening Wear', price: 620, old_price: null, badge: null, stock: 20, img: 'images/catalog/w2.png', sizes: ['S','M','L','XL'], description: 'Soft velour wrap dress.' },
  { id: 'w3', name: 'Linen Blazer Set', category: 'casual', cat: 'casual', label: 'Casual Luxe', price: 480, old_price: null, badge: 'best', stock: 25, img: 'images/catalog/w3.png', sizes: ['XS','S','M','L','XL'], description: 'Tailored linen blazer set.' },
  { id: 'w4', name: 'Wrap Midi', category: 'casual', cat: 'casual', label: 'Casual Luxe', price: 390, old_price: null, badge: null, stock: 18, img: 'images/catalog/look4.png', sizes: ['S','M','L'], description: 'Everyday luxury wrap midi.' },
  { id: 'w5', name: 'Classic Trench', category: 'heritage', cat: 'heritage', label: 'Heritage Line', price: 920, old_price: null, badge: null, stock: 12, img: 'images/classic_trench.png', sizes: ['XS','S','M','L'], description: 'Iconic heritage classic trench coat.' },
  { id: 'w6', name: 'Silk Blouse', category: 'new', cat: 'new', label: 'New Arrival', price: 340, old_price: null, badge: 'new', stock: 30, img: 'images/catalog/look6.jpg', sizes: ['XS','S','M','L'], description: 'Lightweight silk blouse.' },
  { id: 'w7', name: 'Pleated Skirt', category: 'casual', cat: 'casual', label: 'Casual Luxe', price: 280, old_price: 380, badge: 'sale', stock: 22, img: 'images/catalog/look7.jpg', sizes: ['S','M','L','XL'], description: 'Pleated midi skirt.' },
  { id: 'w8', name: 'Crochet Top', category: 'new', cat: 'new', label: 'New Arrival', price: 220, old_price: null, badge: 'new', stock: 18, img: 'images/catalog/look8.jpg', sizes: ['XS','S','M'], description: 'Handcrafted crochet top.' },
  { id: 'w9', name: 'Noir Draped Gown', category: 'evening', cat: 'evening', label: 'Evening Wear', price: 780, old_price: 1050, badge: 'sale', stock: 14, img: 'images/catalog/w9.png', sizes: ['XS','S','M'], description: 'Noir draped couture gown.' },
  { id: 'w10', name: 'Wide Trousers', category: 'casual', cat: 'casual', label: 'Casual Luxe', price: 320, old_price: null, badge: null, stock: 20, img: 'images/catalog/look10.jpg', sizes: ['S','M','L','XL'], description: 'Tailored wide trousers.' },
  { id: 'w11', name: 'Citron Kimono Cape', category: 'new', cat: 'new', label: 'New Arrival', price: 680, old_price: null, badge: 'new', stock: 16, img: 'images/catalog/w11.jpg', sizes: ['XS','S','M','L','XL'], description: 'Citron kimono statement cape.' },
  { id: 'w12', name: 'Statement Cape Set', category: 'evening', cat: 'evening', label: 'Evening Wear', price: 750, old_price: null, badge: 'best', stock: 15, img: 'images/catalog/w12.jpg', sizes: ['S','M','L'], description: 'Atelier statement cape set.' },
  { id: 'm1', name: 'MN Black Signature Set', category: 'men', cat: 'men', label: "Men's Collection", price: 850, old_price: null, badge: 'new', stock: 20, img: 'images/catalog/m1.jpg', sizes: ['S','M','L','XL','XXL'], description: 'Signature black tailored set for men.' },
  { id: 'm2', name: 'MN Forest Green Set', category: 'men', cat: 'men', label: "Men's Collection", price: 780, old_price: null, badge: 'best', stock: 18, img: 'images/catalog/m2.jpg', sizes: ['S','M','L','XL'], description: 'Forest green signature set.' },
  { id: 'm3', name: 'Forest Green — Styled', category: 'men', cat: 'men', label: "Men's Collection", price: 780, old_price: null, badge: null, stock: 15, img: 'images/catalog/m3.jpg', sizes: ['S','M','L','XL'], description: 'Tailored forest green styled edit.' },
  { id: 'm4', name: 'Black Edition — Styled', category: 'men', cat: 'men', label: "Men's Collection", price: 850, old_price: null, badge: null, stock: 15, img: 'images/catalog/m4.jpg', sizes: ['S','M','L','XL','XXL'], description: 'Black edition tailored silhouette.' },
  { id: 'm5', name: 'All White Luxe Set', category: 'men', cat: 'men', label: "Men's Collection", price: 820, old_price: null, badge: 'new', stock: 12, img: 'images/catalog/m5.jpg', sizes: ['S','M','L','XL'], description: 'All white luxury linen and cotton set.' },
  { id: 'm6', name: 'White Tee Set', category: 'men', cat: 'men', label: "Men's Collection", price: 820, old_price: null, badge: null, stock: 25, img: 'images/catalog/m6.jpg', sizes: ['S','M','L','XL'], description: 'Premium heavyweight white tee set.' },
  { id: 'm7', name: 'Heritage Zigzag Set', category: 'men', cat: 'men', label: "Men's Collection", price: 950, old_price: null, badge: 'best', stock: 10, img: 'images/catalog/m7.jpg', sizes: ['S','M','L','XL'], description: 'Heritage zigzag pattern luxury menswear.' },
  { id: 'm8', name: 'MN Black Tee', category: 'men', cat: 'men', label: "Men's Collection", price: 420, old_price: null, badge: null, stock: 30, img: 'images/catalog/m8.jpg', sizes: ['S','M','L','XL','XXL'], description: 'Atelier black essential tee.' },
  { id: 'm9', name: 'MN Green Tee', category: 'men', cat: 'men', label: "Men's Collection", price: 420, old_price: null, badge: null, stock: 30, img: 'images/catalog/m9.jpg', sizes: ['S','M','L','XL'], description: 'Forest green essential tee.' },
  { id: 'm10', name: 'MN White Tee', category: 'men', cat: 'men', label: "Men's Collection", price: 420, old_price: null, badge: 'new', stock: 30, img: 'images/catalog/m10.jpg', sizes: ['S','M','L','XL'], description: 'White atelier essential tee.' },
  { id: 'm11', name: 'MN Zigzag Tee', category: 'men', cat: 'men', label: "Men's Collection", price: 480, old_price: null, badge: null, stock: 25, img: 'images/catalog/m11.jpg', sizes: ['S','M','L','XL'], description: 'Heritage zigzag tee.' },
  { id: 'm12', name: 'MN Forest Bundle', category: 'men', cat: 'men', label: "Men's Collection", price: 1100, old_price: 1350, badge: 'sale', stock: 8, img: 'images/catalog/m12.jpg', sizes: ['S','M','L','XL'], description: 'Forest green complete atelier bundle.' },
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
  try {
    const snap = await db.collection('products').get();
    const batch = db.batch();
    const now = new Date().toISOString();
    let count = 0;

    DEFAULT_PRODUCTS.forEach((product) => {
      const docId = String(product.id);
      const existingDoc = snap.docs.find(d => d.id === docId);
      if (!existingDoc || !existingDoc.data().img) {
        const ref = db.collection('products').doc(docId);
        batch.set(ref, {
          ...product,
          sizes: Array.isArray(product.sizes) ? product.sizes : [],
          created_at: existingDoc?.data()?.created_at || now,
          updated_at: now,
        }, { merge: true });
        count++;
      }
    });

    if (count > 0) {
      await batch.commit();
      console.log(`[Bootstrap] Synchronized ${count} default products into Firestore with images.`);
    }
  } catch (err) {
    console.warn('[Bootstrap Warning] ensureProducts Firestore skipped:', err.message);
  }
}

async function bootstrap() {
  const db = getDb();
  await ensureAdminAccount(db);
  await ensureProducts(db);
  return db;
}

module.exports = { bootstrap, ensureAdminAccount, ensureProducts, DEFAULT_PRODUCTS };
