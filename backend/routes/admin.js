const express = require('express');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { getDb, isFirestoreAvailable } = require('../lib/firebase');
const { uploadImage, deleteImage } = require('../lib/cloudinary');
const localdb = require('../lib/localdb');


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
    try {
      if (await isFirestoreAvailable()) {
        const db = getDb();
        const ordersSnap = await Promise.race([
          db.collection('orders').get(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
        ]);
        const orders = await Promise.all(ordersSnap.docs.map(async (doc) => {
          const data = doc.data();
          let user = {};
          try {
            const userSnap = await db.collection('users').doc(String(data.user_id)).get();
            if (userSnap.exists) user = userSnap.data();
          } catch (_) {}
          return {
            id: doc.id,
            ...data,
            first_name: user.first_name || null,
            last_name: user.last_name || null,
            email: user.email || null,
          };
        }));

        orders.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
        return res.json(orders);
      }
    } catch (_) {}

    // Local fallback
    const localOrders = localdb.getAllDocs('orders') || [];
    localOrders.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    return res.json(localOrders);
  });

  // Update order status & payment status (admin)
  router.patch('/orders/:orderId/status', authMiddleware, adminMiddleware, async (req, res) => {
    const { status, payment_status } = req.body;
    const orderId = req.params.orderId;

    if (!status && !payment_status) return res.status(400).json({ error: 'Status or payment_status required' });

    const updatePayload = { updated_at: new Date().toISOString() };
    if (status) updatePayload.status = status;
    if (payment_status) {
      updatePayload.payment_status = payment_status;
    } else if (status === 'paid' || status === 'completed') {
      updatePayload.payment_status = 'paid';
    }

    let updated = false;
    try {
      if (await isFirestoreAvailable()) {
        const db = getDb();
        const ref = db.collection('orders').doc(String(orderId));
        const snap = await Promise.race([
          ref.get(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500)),
        ]);
        if (snap && snap.exists) {
          await ref.update(updatePayload);
          updated = true;
        }
      }
    } catch (_) {}

    // Always update localdb
    const localUpdated = localdb.updateDoc('orders', orderId, updatePayload);
    if (localUpdated || updated) {
      return res.json({ message: 'Order status updated', ...updatePayload });
    }
    return res.status(404).json({ error: 'Order not found' });
  });

  // Get order details (admin)
  router.get('/orders/:orderId', authMiddleware, adminMiddleware, async (req, res) => {
    const orderId = req.params.orderId;

    try {
      if (await isFirestoreAvailable()) {
        const db = getDb();
        const orderSnap = await Promise.race([
          db.collection('orders').doc(String(orderId)).get(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500)),
        ]);
        if (orderSnap && orderSnap.exists) {
          const data = orderSnap.data();
          let user = {};
          let items = [];
          try {
            const [userSnap, itemsSnap] = await Promise.all([
              db.collection('users').doc(String(data.user_id)).get(),
              db.collection('order_items').where('order_id', '==', String(orderId)).get()
            ]);
            if (userSnap.exists) user = userSnap.data();
            items = itemsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          } catch (_) {}

          return res.json({
            id: orderSnap.id,
            ...data,
            first_name: user.first_name || null,
            last_name: user.last_name || null,
            email: user.email || null,
            phone: user.phone || null,
            items: items.length ? items : (data.items || []),
          });
        }
      }
    } catch (_) {}

    // Local fallback
    const localOrder = localdb.getDoc('orders', orderId) || (localdb.queryDocs('orders', 'order_number', orderId) || [])[0];
    if (localOrder) {
      return res.json(localOrder);
    }
    return res.status(404).json({ error: 'Order not found' });
  });

  // Get dashboard statistics (admin)
  router.get('/stats/dashboard', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      if (await isFirestoreAvailable()) {
        const db = getDb();
        const [usersSnap, productsSnap, ordersSnap, paidOrdersSnap] = await Promise.race([
          Promise.all([
            db.collection('users').get(),
            db.collection('products').get(),
            db.collection('orders').get(),
            db.collection('orders').where('status', '==', 'paid').get(),
          ]),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
        ]);

        const totalRevenue = paidOrdersSnap.docs.reduce((sum, doc) => sum + Number(doc.data().total || 0), 0);

        return res.json({
          total_users: usersSnap.size,
          total_products: productsSnap.size,
          total_orders: ordersSnap.size,
          total_revenue: totalRevenue,
        });
      }
    } catch (_) {}

    // Fallback using localdb
    const localOrders = localdb.getAllDocs('orders') || [];
    const paidOrders = localOrders.filter(o => o.status === 'paid' || o.payment_status === 'paid');
    const totalRevenue = paidOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    return res.json({
      total_users: 1,
      total_products: 16,
      total_orders: localOrders.length,
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
      if (await isFirestoreAvailable()) {
        const db = getDb();
        const doc = await Promise.race([
          db.collection('site_settings').doc('main').get(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500)),
        ]);
        if (doc && doc.exists) {
          return res.json({ settings: { ...localdb.getSettings(), ...doc.data() } });
        }
      }
    } catch (_) {}
    return res.json({ settings: localdb.getSettings() });
  });

  // Update site settings & carousel banners
  router.put('/settings', authMiddleware, adminMiddleware, async (req, res) => {
    const payload = req.body || {};
    try {
      if (await isFirestoreAvailable()) {
        const db = getDb();
        await Promise.race([
          db.collection('site_settings').doc('main').set({
            ...payload,
            updated_at: new Date().toISOString()
          }, { merge: true }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500)),
        ]);
      }
    } catch (_) {}

    const updated = localdb.saveSettings(payload);
    return res.json({ message: 'Settings saved', settings: updated });
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

  // ── USER MANAGEMENT ─────────────────────────────────────────────────────────

  // GET /admin/users — List all users (paginated)
  router.get('/users', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const db = getDb();
      const { role, limit: qLimit, offset: qOffset } = req.query;
      const pageLimit = Math.min(Number(qLimit) || 50, 200);
      const pageOffset = Number(qOffset) || 0;

      let query = db.collection('users').orderBy('created_at', 'desc');
      if (role) query = query.where('role', '==', role);

      const snap = await query.get();
      const all = snap.docs.map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          first_name: d.first_name || '',
          last_name: d.last_name || '',
          email: d.email || '',
          phone: d.phone || null,
          role: d.role || 'customer',
          is_verified: d.is_verified || false,
          created_at: d.created_at || null,
        };
      });

      const paginated = all.slice(pageOffset, pageOffset + pageLimit);
      res.json({ total: all.length, users: paginated });
    } catch (err) {
      console.error('GET /admin/users error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /admin/users/:uid — Single user detail
  router.get('/users/:uid', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const db = getDb();
      const snap = await db.collection('users').doc(req.params.uid).get();
      if (!snap.exists) return res.status(404).json({ error: 'User not found' });
      res.json({ id: snap.id, ...snap.data() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /admin/users/:uid/promote — Promote a user to admin
  router.post('/users/:uid/promote', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { uid } = req.params;
      const db = getDb();
      const { admin: adminSdk } = require('../lib/firebase');

      const snap = await db.collection('users').doc(uid).get();
      if (!snap.exists) return res.status(404).json({ error: 'User not found' });

      // Update Firestore record
      await db.collection('users').doc(uid).update({
        role: 'admin',
        updated_at: new Date().toISOString(),
      });

      // Set Firebase Auth custom claim so token reflects the role
      await adminSdk.auth().setCustomUserClaims(uid, { role: 'admin' });

      const updated = snap.data();
      res.json({
        message: `${updated.first_name || 'User'} ${updated.last_name || ''} has been promoted to admin.`.trim(),
        user: { id: uid, ...updated, role: 'admin' },
      });
    } catch (err) {
      console.error('POST /admin/users/:uid/promote error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /admin/users/:uid/demote — Demote an admin back to customer
  router.post('/users/:uid/demote', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { uid } = req.params;
      const db = getDb();
      const { admin: adminSdk } = require('../lib/firebase');

      // Prevent self-demotion
      if (uid === req.user.id) {
        return res.status(400).json({ error: 'You cannot demote your own account.' });
      }

      const snap = await db.collection('users').doc(uid).get();
      if (!snap.exists) return res.status(404).json({ error: 'User not found' });

      await db.collection('users').doc(uid).update({
        role: 'customer',
        updated_at: new Date().toISOString(),
      });

      await adminSdk.auth().setCustomUserClaims(uid, { role: 'customer' });

      const updated = snap.data();
      res.json({
        message: `${updated.first_name || 'User'} ${updated.last_name || ''} has been demoted to customer.`.trim(),
        user: { id: uid, ...updated, role: 'customer' },
      });
    } catch (err) {
      console.error('POST /admin/users/:uid/demote error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /admin/users/:uid — Delete a user account
  router.delete('/users/:uid', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { uid } = req.params;
      const db = getDb();
      const { admin: adminSdk } = require('../lib/firebase');

      if (uid === req.user.id) {
        return res.status(400).json({ error: 'You cannot delete your own account.' });
      }

      const snap = await db.collection('users').doc(uid).get();
      if (!snap.exists) return res.status(404).json({ error: 'User not found' });

      // Delete from Firestore and Firebase Auth
      await db.collection('users').doc(uid).delete();
      await adminSdk.auth().deleteUser(uid).catch(() => {}); // best-effort

      res.json({ message: 'User deleted successfully.' });
    } catch (err) {
      console.error('DELETE /admin/users/:uid error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
