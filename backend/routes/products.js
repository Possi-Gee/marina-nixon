const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { getDb } = require('../lib/firebase');

module.exports = () => {
  const router = express.Router();

  const toProduct = (doc) => {
    const data = doc.data() || {};
    const cat = data.cat || data.category || 'casual';
    return {
      id: doc.id,
      ...data,
      cat,
      category: cat,
      img: data.img || data.primary_image || '',
    };
  };

  const mergeCatalog = (firestoreRows) => {
    const { DEFAULT_PRODUCTS } = require('../bootstrap');
    const byId = new Map();
    DEFAULT_PRODUCTS.forEach((product) => {
      byId.set(String(product.id), { ...product });
    });
    (firestoreRows || []).forEach((product) => {
      const id = String(product.id);
      const prev = byId.get(id) || {};
      byId.set(id, {
        ...prev,
        ...product,
        cat: product.cat || product.category || prev.cat,
        category: product.category || product.cat || prev.category,
        img: product.img || product.primary_image || prev.img || '',
      });
    });
    return Array.from(byId.values());
  };

  // Get all products with filtering
  router.get('/', async (req, res) => {
    const { category, sort } = req.query;
    let rows = [];

    try {
      const db = getDb();
      const snap = await db.collection('products').get();
      rows = mergeCatalog(snap.docs.map(toProduct));
    } catch (err) {
      console.warn('GET /api/products Firestore read warning:', err.message);
      const { DEFAULT_PRODUCTS } = require('../bootstrap');
      rows = [...DEFAULT_PRODUCTS];
    }

    if (!rows || rows.length === 0) {
      const { DEFAULT_PRODUCTS } = require('../bootstrap');
      rows = [...DEFAULT_PRODUCTS];
    }

    if (category && category !== 'all') {
      if (category === 'sale') {
        rows = rows.filter((row) => (row.badge === 'sale' || row.category === 'sale' || row.cat === 'sale'));
      } else if (category === 'new') {
        rows = rows.filter((row) => (row.badge === 'new' || row.category === 'new' || row.cat === 'new'));
      } else {
        rows = rows.filter((row) => (row.category === category || row.cat === category));
      }
    }

    if (sort === 'price-asc') rows.sort((a, b) => (a.price || 0) - (b.price || 0));
    else if (sort === 'price-desc') rows.sort((a, b) => (b.price || 0) - (a.price || 0));
    else if (sort === 'newest') rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    else rows.sort((a, b) => String(a.id).localeCompare(String(b.id)));

    res.json(rows);
  });

  // Search products
  router.get('/search/:query', async (req, res) => {
    const term = String(req.params.query || '').trim().toLowerCase();
    let rows = [];

    try {
      const db = getDb();
      const snap = await db.collection('products').get();
      rows = mergeCatalog(snap.docs.map(toProduct));
    } catch (err) {
      console.warn('GET /api/products/search Firestore read warning:', err.message);
      const { DEFAULT_PRODUCTS } = require('../bootstrap');
      rows = [...DEFAULT_PRODUCTS];
    }

    if (!rows || rows.length === 0) {
      const { DEFAULT_PRODUCTS } = require('../bootstrap');
      rows = [...DEFAULT_PRODUCTS];
    }

    const matches = rows.filter((row) => {
      const name = String(row.name || '').toLowerCase();
      const label = String(row.label || '').toLowerCase();
      const categoryValue = String(row.category || row.cat || '').toLowerCase();
      return name.includes(term) || label.includes(term) || categoryValue.includes(term);
    });

    res.json(matches);
  });

  // Get single product
  router.get('/:id', async (req, res) => {
    const productId = String(req.params.id);
    try {
      const db = getDb();
      const snap = await db.collection('products').doc(productId).get();
      if (snap.exists) return res.json(toProduct(snap));
    } catch (err) {
      console.warn('GET /api/products/:id Firestore read warning:', err.message);
    }

    const { DEFAULT_PRODUCTS } = require('../bootstrap');
    const fallback = DEFAULT_PRODUCTS.find((p) => String(p.id) === productId);
    if (fallback) return res.json(fallback);

    res.status(404).json({ error: 'Product not found' });
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
