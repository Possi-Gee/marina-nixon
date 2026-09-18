const express = require('express');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { getDb } = require('../lib/firebase');
const { uploadImage, deleteImage } = require('../lib/cloudinary');

module.exports = () => {
  const router = express.Router();

  const toProduct = (doc) => ({ id: doc.id, ...doc.data() });

  // Add product
  router.post('/products', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const db = getDb();
      const { name, category, label, price, old_price, badge, stock, description, sizes } = req.body;

      if (!name || !category || !price) {
        return res.status(400).json({ error: 'Name, category, and price required' });
      }

      const imageInput = req.body.image || req.body.image_url || req.body.img || null;
      let uploadedImage = null;
      if (imageInput && (imageInput.startsWith('data:') || imageInput.startsWith('http'))) {
        uploadedImage = await uploadImage(imageInput).catch((err) => {
          console.warn('Cloudinary upload non-fatal warning:', err.message);
          return null;
        });
      }

      const ref = db.collection('products').doc();
      await ref.set({
        name,
        category,
        label: label || null,
        price,
        old_price: old_price || null,
        badge: badge || null,
        stock: stock || 50,
        description: description || null,
        sizes: Array.isArray(sizes) ? sizes : (sizes ? String(sizes).split(',').map((s) => s.trim()).filter(Boolean) : []),
        img: uploadedImage ? uploadedImage.url : (imageInput || null),
        image_public_id: uploadedImage ? uploadedImage.public_id : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      res.status(201).json({ message: 'Product added', product_id: ref.id });
    } catch (err) {
      console.error('Failed to add product:', err);
      res.status(500).json({ error: 'Failed to add product', message: err.message });
    }
  });

  // Update product
  router.put('/products/:productId', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const db = getDb();
      const productId = req.params.productId;
      const { name, category, label, price, old_price, badge, stock, description, sizes } = req.body;
      const ref = db.collection('products').doc(String(productId));
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: 'Product not found' });

      const imageInput = req.body.image || req.body.image_url || req.body.img || null;
      let uploadedImage = null;
      if (imageInput && (imageInput.startsWith('data:') || imageInput.startsWith('http'))) {
        uploadedImage = await uploadImage(imageInput).catch((err) => {
          console.warn('Cloudinary upload non-fatal warning:', err.message);
          return null;
        });
      }

      const previous = snap.data();
      if (uploadedImage && previous.image_public_id) {
        await deleteImage(previous.image_public_id).catch(() => null);
      }

      await ref.update({
        name,
        category,
        label: label || null,
        price,
        old_price: old_price || null,
        badge: badge || null,
        stock,
        description: description || null,
        sizes: Array.isArray(sizes) ? sizes : (sizes ? String(sizes).split(',').map((s) => s.trim()).filter(Boolean) : []),
        ...(uploadedImage ? { img: uploadedImage.url, image_public_id: uploadedImage.public_id } : {}),
        updated_at: new Date().toISOString(),
      });

      res.json({ message: 'Product updated' });
    } catch (err) {
      console.error('Failed to update product:', err);
      res.status(500).json({ error: 'Failed to update product', message: err.message });
    }
  });

  // Delete product
  router.delete('/products/:productId', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const db = getDb();
      const productId = req.params.productId;
      const ref = db.collection('products').doc(String(productId));
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: 'Product not found' });

      const data = snap.data();
      if (data.image_public_id) {
        await deleteImage(data.image_public_id).catch(() => null);
      }

      await ref.delete();
      res.json({ message: 'Product deleted' });
    } catch (err) {
      console.error('Failed to delete product:', err);
      res.status(500).json({ error: 'Failed to delete product', message: err.message });
    }
  });

  // Get all orders (admin)
  router.get('/orders', authMiddleware, adminMiddleware, async (req, res) => {
    const db = getDb();
    const ordersSnap = await db.collection('orders').get();
    const orders = await Promise.all(ordersSnap.docs.map(async (doc) => {
      const data = doc.data();
      const userSnap = await db.collection('users').doc(String(data.user_id)).get();
      const user = userSnap.exists ? userSnap.data() : {};
      return {
        id: doc.id,
        ...data,
        first_name: user.first_name || null,
        last_name: user.last_name || null,
        email: user.email || null,
      };
    }));

    orders.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    res.json(orders);
  });

  // Update order status (admin)
  router.patch('/orders/:orderId/status', authMiddleware, adminMiddleware, async (req, res) => {
    const db = getDb();
    const { status } = req.body;
    const orderId = req.params.orderId;

    if (!status) return res.status(400).json({ error: 'Status required' });

    const ref = db.collection('orders').doc(String(orderId));
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Order not found' });

    await ref.update({ status, updated_at: new Date().toISOString() });
    res.json({ message: 'Order status updated' });
  });

  // Get order details (admin)
  router.get('/orders/:orderId', authMiddleware, adminMiddleware, async (req, res) => {
    const db = getDb();
    const orderId = req.params.orderId;
    const orderSnap = await db.collection('orders').doc(String(orderId)).get();
    if (!orderSnap.exists) return res.status(404).json({ error: 'Order not found' });

    const data = orderSnap.data();
    const [userSnap, itemsSnap] = await Promise.all([
      db.collection('users').doc(String(data.user_id)).get(),
      db.collection('order_items').where('order_id', '==', String(orderId)).get()
    ]);

    const user = userSnap.exists ? userSnap.data() : {};
    const items = itemsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Map item product names and images for the admin
    const withProductInfo = await Promise.all(items.map(async (item) => {
      const prodSnap = await db.collection('products').doc(String(item.product_id)).get();
      const prod = prodSnap.exists ? prodSnap.data() : {};
      return {
        ...item,
        name: prod.name || 'Unknown Product',
        img: prod.img || ''
      };
    }));

    res.json({
      id: orderSnap.id,
      ...data,
      first_name: user.first_name || null,
      last_name: user.last_name || null,
      email: user.email || null,
      phone: user.phone || null,
      items: withProductInfo
    });
  });

  // Get dashboard statistics (admin)
  router.get('/stats/dashboard', authMiddleware, adminMiddleware, async (req, res) => {
    const db = getDb();
    const [usersSnap, productsSnap, ordersSnap, paidOrdersSnap] = await Promise.all([
      db.collection('users').get(),
      db.collection('products').get(),
      db.collection('orders').get(),
      db.collection('orders').where('status', '==', 'paid').get(),
    ]);

    const totalRevenue = paidOrdersSnap.docs.reduce((sum, doc) => sum + Number(doc.data().total || 0), 0);

    res.json({
      total_users: usersSnap.size,
      total_products: productsSnap.size,
      total_orders: ordersSnap.size,
      total_revenue: totalRevenue,
    });
  });

  // Get sales report
  router.get('/reports/sales', authMiddleware, adminMiddleware, async (req, res) => {
    const db = getDb();
    const snap = await db.collection('orders').where('status', '==', 'paid').get();
    const buckets = new Map();

    snap.docs.forEach((doc) => {
      const data = doc.data();
      const date = String(data.created_at || '').slice(0, 10);
      if (!date) return;
      const current = buckets.get(date) || { date, orders: 0, revenue: 0 };
      current.orders += 1;
      current.revenue += Number(data.total || 0);
      buckets.set(date, current);
    });

    res.json(Array.from(buckets.values()).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30));
  });

  // Get top products
  router.get('/reports/top-products', authMiddleware, adminMiddleware, async (req, res) => {
    const db = getDb();
    const [productsSnap, itemsSnap] = await Promise.all([
      db.collection('products').get(),
      db.collection('order_items').get(),
    ]);

    const productMap = new Map(productsSnap.docs.map((doc) => [String(doc.id), toProduct(doc)]));
    const agg = new Map();

    itemsSnap.docs.forEach((doc) => {
      const item = doc.data();
      const productId = String(item.product_id);
      const entry = agg.get(productId) || { id: productId, times_sold: 0, total_quantity: 0, revenue: 0 };
      entry.times_sold += 1;
      entry.total_quantity += Number(item.quantity || 0);
      entry.revenue += Number(item.price || 0) * Number(item.quantity || 0);
      agg.set(productId, entry);
    });

    const rows = Array.from(agg.values())
      .map((row) => ({
        ...row,
        ...(productMap.get(row.id) || { name: null, category: null }),
      }))
      .sort((a, b) => b.times_sold - a.times_sold)
      .slice(0, 20);

    res.json(rows);
  });

  // Get site settings & carousel banners
  router.get('/settings', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const db = getDb();
      const doc = await db.collection('site_settings').doc('main').get();
      if (doc.exists) {
        return res.json({ settings: doc.data() });
      }
      return res.json({ settings: {} });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update site settings & carousel banners
  router.put('/settings', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const db = getDb();
      const payload = req.body || {};
      await db.collection('site_settings').doc('main').set({
        ...payload,
        updated_at: new Date().toISOString()
      }, { merge: true });

      const updatedSnap = await db.collection('site_settings').doc('main').get();
      res.json({ message: 'Settings saved', settings: updatedSnap.data() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
