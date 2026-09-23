const express = require('express');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { getDb } = require('../lib/firebase');
const { uploadImage, deleteImage } = require('../lib/cloudinary');

module.exports = () => {
  const router = express.Router();

  const toProduct = (doc) => ({ id: doc.id, ...doc.data() });

  // ── GET /admin/products — Firestore-only list (no DEFAULT_PRODUCTS merge) ──
  // Used by the admin catalog so only real Firestore products appear (deletable)
  router.get('/products', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const db = getDb();
      const { sort } = req.query;
      const snap = await db.collection('products').get();
      let rows = snap.docs.map(toProduct);

      if (sort === 'price-asc') rows.sort((a, b) => (a.price || 0) - (b.price || 0));
      else if (sort === 'price-desc') rows.sort((a, b) => (b.price || 0) - (a.price || 0));
      else rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

      res.json(rows);
    } catch (err) {
      console.error('GET /admin/products error:', err);
      res.status(500).json({ error: err.message, products: [] });
    }
  });

  // ── GET /admin/products/:productId — Single product ──
  router.get('/products/:productId', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const db = getDb();
      const snap = await db.collection('products').doc(req.params.productId).get();
      if (!snap.exists) return res.status(404).json({ error: 'Product not found' });
      res.json(toProduct(snap));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

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
      let img = null;
      if (imageInput && (String(imageInput).startsWith('data:') || String(imageInput).startsWith('http'))) {
        uploadedImage = await uploadImage(imageInput).catch((err) => {
          console.warn('Cloudinary upload non-fatal warning:', err.message);
          return null;
        });
      }
      if (uploadedImage) {
        img = uploadedImage.url;
      } else if (imageInput && String(imageInput).startsWith('data:image/') && String(imageInput).length < 750000) {
        img = imageInput;
      } else if (imageInput && !String(imageInput).startsWith('data:')) {
        img = imageInput;
      }

      const product = {
        name,
        category,
        cat: category,
        label: label || null,
        price: Number(price),
        old_price: old_price || null,
        badge: badge || 'new',
        stock: stock || 50,
        description: description || null,
        sizes: Array.isArray(sizes) ? sizes : (sizes ? String(sizes).split(',').map((s) => s.trim()).filter(Boolean) : []),
        img,
        image_public_id: uploadedImage ? uploadedImage.public_id : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const ref = db.collection('products').doc();
      await ref.set(product);

      res.status(201).json({ message: 'Product added', product_id: ref.id, product: { id: ref.id, ...product } });
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

      const nextImg = uploadedImage
        ? uploadedImage.url
        : (imageInput && String(imageInput).startsWith('data:image/') && String(imageInput).length < 750000
          ? imageInput
          : (imageInput && !String(imageInput).startsWith('data:') ? imageInput : previous.img));

      await ref.update({
        name,
        category,
        cat: category,
        label: label || null,
        price,
        old_price: old_price || null,
        badge: badge || null,
        stock,
        description: description || null,
        sizes: Array.isArray(sizes) ? sizes : (sizes ? String(sizes).split(',').map((s) => s.trim()).filter(Boolean) : []),
        img: nextImg || previous.img || null,
        ...(uploadedImage ? { image_public_id: uploadedImage.public_id } : {}),
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

  // Partial update product (e.g. quick stock edit)
  router.patch('/products/:productId', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const db = getDb();
      const productId = req.params.productId;
      const ref = db.collection('products').doc(String(productId));
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: 'Product not found' });

      const allowedFields = ['name', 'category', 'label', 'price', 'old_price', 'badge', 'stock', 'description', 'sizes'];
      const updateData = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          if (field === 'price' || field === 'stock') {
            updateData[field] = Number(req.body[field]);
          } else if (field === 'category') {
            updateData.category = req.body.category;
            updateData.cat = req.body.category;
          } else if (field === 'sizes') {
            updateData.sizes = Array.isArray(req.body.sizes)
              ? req.body.sizes
              : (req.body.sizes ? String(req.body.sizes).split(',').map((s) => s.trim()).filter(Boolean) : []);
          } else {
            updateData[field] = req.body[field];
          }
        }
      }
      updateData.updated_at = new Date().toISOString();

      await ref.update(updateData);
      const updatedSnap = await ref.get();
      res.json({ message: 'Product updated', product: toProduct(updatedSnap) });
    } catch (err) {
      console.error('Failed to patch product:', err);
      res.status(500).json({ error: 'Failed to update product', message: err.message });
    }
  });

  // Bulk delete products
  router.post('/products/bulk-delete', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const db = getDb();
      const { productIds } = req.body;
      if (!Array.isArray(productIds) || productIds.length === 0) {
        return res.status(400).json({ error: 'productIds array required' });
      }

      let deletedCount = 0;
      for (const id of productIds) {
        try {
          const ref = db.collection('products').doc(String(id));
          const snap = await ref.get();
          if (snap.exists) {
            const data = snap.data();
            if (data.image_public_id) {
              await deleteImage(data.image_public_id).catch(() => null);
            }
            await ref.delete();
            deletedCount++;
          }
        } catch (subErr) {
          console.warn(`Failed to delete product ${id}:`, subErr.message);
        }
      }

      res.json({ message: `Successfully deleted ${deletedCount} product(s)`, deletedCount });
    } catch (err) {
      console.error('Failed to bulk delete products:', err);
      res.status(500).json({ error: 'Bulk delete failed', message: err.message });
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

  // ── LOOKBOOK ROUTES ─────────────────────────────────────────────────────────

  // Get full lookbook data (hero + sections + items)
  router.get('/lookbook', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const db = getDb();
      const [heroSnap, sectionsSnap] = await Promise.all([
        db.collection('site_settings').doc('lookbook_hero').get(),
        db.collection('lookbook_sections').orderBy('order', 'asc').get(),
      ]);

      const hero = heroSnap.exists ? heroSnap.data() : {};
      const sections = await Promise.all(
        sectionsSnap.docs.map(async (secDoc) => {
          const secData = { id: secDoc.id, ...secDoc.data() };
          const itemsSnap = await db
            .collection('lookbook_sections')
            .doc(secDoc.id)
            .collection('items')
            .orderBy('order', 'asc')
            .get();
          secData.items = itemsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
          return secData;
        })
      );

      res.json({ hero, sections });
    } catch (err) {
      console.error('Failed to get lookbook:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Save lookbook hero banner settings
  router.put('/lookbook/hero', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const db = getDb();
      const hero = req.body || {};

      // Handle image upload if base64
      if (hero.image && String(hero.image).startsWith('data:')) {
        const uploaded = await uploadImage(hero.image).catch(() => null);
        if (uploaded) {
          hero.image = uploaded.url;
          hero.image_public_id = uploaded.public_id;
        }
      }

      await db.collection('site_settings').doc('lookbook_hero').set({
        ...hero,
        updated_at: new Date().toISOString(),
      }, { merge: true });

      const snap = await db.collection('site_settings').doc('lookbook_hero').get();
      res.json({ message: 'Lookbook hero saved', hero: snap.data() });
    } catch (err) {
      console.error('Failed to save lookbook hero:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Add new lookbook section
  router.post('/lookbook/sections', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const db = getDb();
      const { title, subtitle, layout } = req.body;

      // Determine next order index
      const existing = await db.collection('lookbook_sections').get();
      const order = existing.size;

      const ref = db.collection('lookbook_sections').doc();
      await ref.set({
        title: title || 'New Section',
        subtitle: subtitle || '',
        layout: layout || 'editorial',
        order,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      res.status(201).json({ id: ref.id, message: 'Section created' });
    } catch (err) {
      console.error('Failed to create lookbook section:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Update a lookbook section (title, subtitle, layout, order)
  router.put('/lookbook/sections/:sectionId', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const db = getDb();
      const ref = db.collection('lookbook_sections').doc(req.params.sectionId);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: 'Section not found' });

      const { title, subtitle, layout, order } = req.body;
      const update = {};
      if (title !== undefined) update.title = title;
      if (subtitle !== undefined) update.subtitle = subtitle;
      if (layout !== undefined) update.layout = layout;
      if (order !== undefined) update.order = order;
      update.updated_at = new Date().toISOString();

      await ref.update(update);
      res.json({ message: 'Section updated' });
    } catch (err) {
      console.error('Failed to update lookbook section:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Delete a lookbook section (and all its items)
  router.delete('/lookbook/sections/:sectionId', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const db = getDb();
      const ref = db.collection('lookbook_sections').doc(req.params.sectionId);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: 'Section not found' });

      // Delete all items in this section
      const itemsSnap = await ref.collection('items').get();
      const batch = db.batch();
      itemsSnap.docs.forEach((d) => batch.delete(d.ref));
      batch.delete(ref);
      await batch.commit();

      res.json({ message: 'Section deleted' });
    } catch (err) {
      console.error('Failed to delete lookbook section:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Add item to a lookbook section
  router.post('/lookbook/sections/:sectionId/items', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const db = getDb();
      const sectionRef = db.collection('lookbook_sections').doc(req.params.sectionId);
      const sectionSnap = await sectionRef.get();
      if (!sectionSnap.exists) return res.status(404).json({ error: 'Section not found' });

      const { title, category, product_id, badge, hotspot_x, hotspot_y, span } = req.body;

      // Handle image upload
      let imageUrl = req.body.image || req.body.image_url || '';
      let imagePublicId = null;
      if (imageUrl && String(imageUrl).startsWith('data:')) {
        const uploaded = await uploadImage(imageUrl).catch(() => null);
        if (uploaded) {
          imageUrl = uploaded.url;
          imagePublicId = uploaded.public_id;
        }
      }

      const existingItems = await sectionRef.collection('items').get();
      const order = existingItems.size;

      const itemRef = sectionRef.collection('items').doc();
      await itemRef.set({
        title: title || '',
        category: category || '',
        product_id: product_id || null,
        badge: badge || null,
        image: imageUrl,
        image_public_id: imagePublicId,
        hotspot_x: hotspot_x != null ? Number(hotspot_x) : null,
        hotspot_y: hotspot_y != null ? Number(hotspot_y) : null,
        span: span || 'normal', // 'normal' | 'wide' | 'tall'
        order,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      res.status(201).json({ id: itemRef.id, message: 'Item added' });
    } catch (err) {
      console.error('Failed to add lookbook item:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Update a lookbook item
  router.put('/lookbook/sections/:sectionId/items/:itemId', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const db = getDb();
      const itemRef = db
        .collection('lookbook_sections')
        .doc(req.params.sectionId)
        .collection('items')
        .doc(req.params.itemId);

      const snap = await itemRef.get();
      if (!snap.exists) return res.status(404).json({ error: 'Item not found' });

      const { title, category, product_id, badge, hotspot_x, hotspot_y, span, order } = req.body;

      let imageUrl = req.body.image || req.body.image_url || snap.data().image || '';
      let imagePublicId = snap.data().image_public_id || null;

      if (imageUrl && String(imageUrl).startsWith('data:')) {
        if (imagePublicId) await deleteImage(imagePublicId).catch(() => null);
        const uploaded = await uploadImage(imageUrl).catch(() => null);
        if (uploaded) {
          imageUrl = uploaded.url;
          imagePublicId = uploaded.public_id;
        }
      }

      const update = {
        updated_at: new Date().toISOString(),
      };
      if (title !== undefined) update.title = title;
      if (category !== undefined) update.category = category;
      if (product_id !== undefined) update.product_id = product_id;
      if (badge !== undefined) update.badge = badge;
      if (imageUrl !== undefined) update.image = imageUrl;
      if (imagePublicId !== undefined) update.image_public_id = imagePublicId;
      if (hotspot_x !== undefined) update.hotspot_x = hotspot_x != null ? Number(hotspot_x) : null;
      if (hotspot_y !== undefined) update.hotspot_y = hotspot_y != null ? Number(hotspot_y) : null;
      if (span !== undefined) update.span = span;
      if (order !== undefined) update.order = order;

      await itemRef.update(update);
      res.json({ message: 'Item updated' });
    } catch (err) {
      console.error('Failed to update lookbook item:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Delete a lookbook item
  router.delete('/lookbook/sections/:sectionId/items/:itemId', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const db = getDb();
      const itemRef = db
        .collection('lookbook_sections')
        .doc(req.params.sectionId)
        .collection('items')
        .doc(req.params.itemId);

      const snap = await itemRef.get();
      if (!snap.exists) return res.status(404).json({ error: 'Item not found' });

      const data = snap.data();
      if (data.image_public_id) await deleteImage(data.image_public_id).catch(() => null);
      await itemRef.delete();

      res.json({ message: 'Item deleted' });
    } catch (err) {
      console.error('Failed to delete lookbook item:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Reorder sections (bulk update order fields)
  router.put('/lookbook/sections/reorder', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const db = getDb();
      const { order } = req.body; // array of { id, order }
      if (!Array.isArray(order)) return res.status(400).json({ error: 'order array required' });

      const batch = db.batch();
      order.forEach(({ id, order: idx }) => {
        const ref = db.collection('lookbook_sections').doc(id);
        batch.update(ref, { order: idx, updated_at: new Date().toISOString() });
      });
      await batch.commit();

      res.json({ message: 'Sections reordered' });
    } catch (err) {
      console.error('Failed to reorder sections:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
