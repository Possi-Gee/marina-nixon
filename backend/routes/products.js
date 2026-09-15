const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { getDb } = require('../lib/firebase');

module.exports = () => {
  const router = express.Router();

  const toProduct = (doc) => ({ id: doc.id, ...doc.data() });

  // Get all products with filtering
  router.get('/', async (req, res) => {
    const db = getDb();
    const { category, sort } = req.query;

    const snap = await db.collection('products').get();
    let rows = snap.docs.map(toProduct);

    if (category && category !== 'all') {
      rows = rows.filter((row) => row.category === category);
    }

    if (sort === 'price-asc') rows.sort((a, b) => (a.price || 0) - (b.price || 0));
    else if (sort === 'price-desc') rows.sort((a, b) => (b.price || 0) - (a.price || 0));
    else if (sort === 'newest') rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    else rows.sort((a, b) => String(a.id).localeCompare(String(b.id)));

    res.json(rows);
  });

  // Search products
  router.get('/search/:query', async (req, res) => {
    const db = getDb();
    const term = String(req.params.query || '').trim().toLowerCase();

    const snap = await db.collection('products').get();
    const rows = snap.docs.map(toProduct).filter((row) => {
      const name = String(row.name || '').toLowerCase();
      const label = String(row.label || '').toLowerCase();
      const categoryValue = String(row.category || '').toLowerCase();
      return name.includes(term) || label.includes(term) || categoryValue.includes(term);
    });

    res.json(rows);
  });

  // Get single product
  router.get('/:id', async (req, res) => {
    const db = getDb();
    const snap = await db.collection('products').doc(String(req.params.id)).get();
    if (!snap.exists) return res.status(404).json({ error: 'Product not found' });
    res.json(toProduct(snap));
  });

  // Add to wishlist
  router.post('/:id/wishlist', authMiddleware, async (req, res) => {
    const db = getDb();
    const userId = req.user.id;
    const productId = req.params.id;
    const wishlistId = `${userId}_${productId}`;

    await db.collection('wishlist').doc(wishlistId).set({
      user_id: userId,
      product_id: productId,
      created_at: new Date().toISOString(),
    }, { merge: true });

    res.json({ message: 'Added to wishlist' });
  });

  // Get wishlist
  router.get('/wishlist/all/items', authMiddleware, async (req, res) => {
    const db = getDb();
    const userId = req.user.id;

    const snap = await db.collection('wishlist').where('user_id', '==', userId).get();
    const items = await Promise.all(snap.docs.map(async (doc) => {
      const data = doc.data();
      const productSnap = await db.collection('products').doc(String(data.product_id)).get();
      if (!productSnap.exists) {
        return { id: data.product_id, product_id: data.product_id, user_id: data.user_id };
      }
      return toProduct(productSnap);
    }));

    res.json(items);
  });

  // Remove from wishlist
  router.delete('/:id/wishlist', authMiddleware, async (req, res) => {
    const db = getDb();
    const userId = req.user.id;
    const productId = req.params.id;
    await db.collection('wishlist').doc(`${userId}_${productId}`).delete();
    res.json({ message: 'Removed from wishlist' });
  });

  return router;
};
