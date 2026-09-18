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

  // Get product reviews
  router.get('/:id/reviews', async (req, res) => {
    const db = getDb();
    const productId = String(req.params.id);
    try {
      const snap = await db.collection('reviews').where('product_id', '==', productId).get();
      const reviews = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

      const count = reviews.length;
      const avg = count > 0 
        ? Math.round((reviews.reduce((acc, r) => acc + (Number(r.rating) || 5), 0) / count) * 10) / 10
        : 5.0;

      res.json({ reviews, count, avg_rating: avg });
    } catch (err) {
      console.error('Error fetching reviews:', err);
      res.status(500).json({ error: 'Failed to fetch reviews', reviews: [], count: 0, avg_rating: 5.0 });
    }
  });

  // Submit product review & rating
  router.post('/:id/reviews', async (req, res) => {
    const db = getDb();
    const productId = String(req.params.id);
    const { rating, name, comment } = req.body || {};

    const numericRating = Math.min(5, Math.max(1, Number(rating) || 5));
    const reviewerName = String(name || 'Client').trim().slice(0, 80);
    const reviewComment = String(comment || '').trim().slice(0, 1000);

    if (!reviewComment) {
      return res.status(400).json({ error: 'Review comment cannot be empty' });
    }

    try {
      const newReview = {
        product_id: productId,
        rating: numericRating,
        name: reviewerName,
        comment: reviewComment,
        verified: true,
        created_at: new Date().toISOString()
      };

      const ref = await db.collection('reviews').add(newReview);
      
      // Calculate updated stats
      const snap = await db.collection('reviews').where('product_id', '==', productId).get();
      const reviews = snap.docs.map(d => d.data());
      const count = reviews.length;
      const avg = Math.round((reviews.reduce((acc, r) => acc + (Number(r.rating) || 5), 0) / count) * 10) / 10;

      // Update product rating if product exists
      const prodRef = db.collection('products').doc(productId);
      const prodSnap = await prodRef.get();
      if (prodSnap.exists) {
        await prodRef.update({
          stars: Math.round(avg),
          avg_rating: avg,
          reviews_count: count
        });
      }

      res.status(201).json({
        message: 'Review submitted successfully',
        review: { id: ref.id, ...newReview },
        avg_rating: avg,
        reviews_count: count
      });
    } catch (err) {
      console.error('Error saving review:', err);
      res.status(500).json({ error: 'Failed to submit review' });
    }
  });

  return router;
};
