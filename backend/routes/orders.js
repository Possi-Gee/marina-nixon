const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { getDb } = require('../lib/firebase');
const { sendOrderConfirmation } = require('../lib/mailer');
const localdb = require('../lib/localdb');

// Detect if Firestore is genuinely usable (credentials configured)
let _firestoreAvailable = null;
async function isFirestoreAvailable() {
  if (_firestoreAvailable !== null) return _firestoreAvailable;
  try {
    const db = getDb();
    await Promise.race([
      db.collection('_ping').doc('test').get(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500)),
    ]);
    _firestoreAvailable = true;
  } catch {
    _firestoreAvailable = false;
  }
  return _firestoreAvailable;
}

module.exports = () => {
  const router = express.Router();

  // Generate unique order number (e.g. MN-20260914-A3F9)
  async function generateOrderNumber() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    for (let attempts = 0; attempts < 5; attempts++) {
      let suffix = '';
      for (let i = 0; i < 4; i++) {
        suffix += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const orderNumber = `MN-${dateStr}-${suffix}`;
      // Check for collision in localdb
      const existing = localdb.queryDocs('orders', 'order_number', orderNumber);
      if (!existing.length) return orderNumber;
    }
    return `MN-${dateStr}-${Date.now().toString().slice(-6)}`;
  }

  const { getPromoDetails, calculateDiscount } = require('../lib/promo');

  // ─── Create order ──────────────────────────────────────────────────────────
  router.post('/', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const {
      items, payment_method, delivery_method,
      shipping_address, address = {},
      payment_phone, promo_code, promo,
    } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Order must contain at least one item' });
    }

    const now = new Date().toISOString();
    const orderNumber = await generateOrderNumber();
    const orderId = localdb.generateId();

    const addressPayload = {
      street: address.street || address.address1 || shipping_address?.street || null,
      city: address.city || shipping_address?.city || 'Accra',
      region: address.region || shipping_address?.region || 'Greater Accra',
      notes: address.notes || shipping_address?.notes || null,
    };

    // Use items as-is (trust client prices since Firestore unavailable for validation)
    let verifiedItems = items.map((item) => ({
      product_id: String(item.product_id || item.id || ''),
      name: item.name || `Item ${item.product_id || item.id}`,
      price: parseFloat(item.price || 0),
      quantity: Math.max(1, parseInt(item.quantity || item.qty, 10) || 1),
      size: item.size || null,
      image: item.image || item.img || null,
      img: item.img || item.image || item.primary_image || null,
    }));

    let subtotal = verifiedItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

    // Try Firestore first for server-side stock validation
    const useFirestore = await isFirestoreAvailable();
    if (useFirestore) {
      try {
        const db = getDb();
        await db.runTransaction(async (tx) => {
          verifiedItems = [];
          subtotal = 0;
          const reads = [];
          for (const item of items) {
            const productId = String(item.product_id || item.id || '');
            if (!productId) throw new Error('Invalid product in order');
            const prodRef = db.collection('products').doc(productId);
            const snap = await tx.get(prodRef);
            reads.push({ item, prodRef, snap, productId });
          }
          const updates = [];
          for (const { item, prodRef, snap, productId } of reads) {
            if (!snap.exists) throw new Error(`Product ${productId} not found`);
            const productData = snap.data();
            const currentStock = Number(productData.stock || 0);
            const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
            if (currentStock < qty) throw new Error(`Insufficient stock for ${productData.name || productId}`);
            const verifiedPrice = Number(productData.price || 0);
            subtotal += verifiedPrice * qty;
            verifiedItems.push({
              product_id: productId,
              name: productData.name || 'Garment',
              price: verifiedPrice,
              quantity: qty,
              size: item.size || null,
              image: productData.image || productData.img || null,
            });
            updates.push({ prodRef, stock: Math.max(0, currentStock - qty) });
          }
          for (const update of updates) {
            tx.update(update.prodRef, { stock: update.stock, updated_at: now });
          }
        });
      } catch (err) {
        return res.status(400).json({ error: err.message || 'Order could not be validated' });
      }
    }

    // Calculate discounts and shipping
    const promoInfo = getPromoDetails(promo_code || promo);
    const discountAmount = promoInfo ? calculateDiscount(promoInfo, subtotal) : 0;

    let shippingFee = 30;
    const method = String(delivery_method || 'standard').toLowerCase();
    if (method === 'pickup') {
      shippingFee = 0;
    } else if (method === 'express') {
      shippingFee = 60;
    } else if (subtotal >= 500 || (promoInfo && promoInfo.code === 'FREESHIP')) {
      shippingFee = 0;
    }

    const finalTotal = Math.max(0, Math.round((subtotal - discountAmount + shippingFee) * 100) / 100);
    const isCash = String(payment_method || '').toLowerCase() === 'cash';
    const initialStatus = isCash ? 'processing' : 'pending_verification';
    const initialPaymentStatus = isCash ? 'cash_on_delivery' : 'awaiting_screenshot';

    const orderDoc = {
      id: orderId,
      user_id: userId,
      user_name: `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim(),
      user_email: req.user.email || null,
      order_number: orderNumber,
      subtotal,
      total: finalTotal,
      shipping_cost: shippingFee,
      discount: discountAmount,
      promo_code: promoInfo ? promoInfo.code : null,
      status: initialStatus,
      payment_status: initialPaymentStatus,
      payment_method: isCash ? 'cash' : (payment_method || 'momo'),
      delivery_method: delivery_method || null,
      shipping_address: addressPayload,
      payment_phone: payment_phone || null,
      items: verifiedItems,
      created_at: now,
      updated_at: now,
    };

    if (useFirestore) {
      // Save to Firestore
      try {
        const db = getDb();
        const orderRef = db.collection('orders').doc(orderId);
        const batch = db.batch();
        batch.set(orderRef, { ...orderDoc, items: undefined });
        verifiedItems.forEach((item) => {
          const itemRef = db.collection('order_items').doc();
          batch.set(itemRef, { order_id: orderId, ...item, created_at: now });
        });
        await batch.commit();
      } catch (err) {
        console.warn('Firestore write failed, falling back to local:', err.message);
        localdb.addDoc('orders', orderDoc);
      }
    } else {
      // Save to local JSON file
      localdb.addDoc('orders', orderDoc);
    }

    // Send confirmation email (best-effort)
    try {
      if (useFirestore) {
        const db = getDb();
        const userSnap = await db.collection('users').doc(String(userId)).get();
        const user = userSnap.data() || {};
        await sendOrderConfirmation({
          to: user.email,
          order: { ...req.body, reference: orderNumber, order_number: orderNumber, total: finalTotal, subtotal, shipping_cost: shippingFee, discount: discountAmount },
          items: verifiedItems,
        });
      }
    } catch (_) {
      // email is best-effort; never fail the order
    }

    return res.status(201).json({
      message: 'Order created successfully',
      order_id: orderId,
      order_number: orderNumber,
      subtotal,
      total: finalTotal,
      shipping_cost: shippingFee,
      discount: discountAmount,
    });
  });

  // ─── Get user orders ───────────────────────────────────────────────────────
  router.get('/', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const useFirestore = await isFirestoreAvailable();

    if (useFirestore) {
      try {
        const db = getDb();
        const snap = await db.collection('orders').where('user_id', '==', userId).get();
        const orders = await Promise.all(snap.docs.map(async (doc) => {
          const data = doc.data();
          const itemsSnap = await db.collection('order_items').where('order_id', '==', doc.id).get();
          return { id: doc.id, ...data, item_count: itemsSnap.size };
        }));
        orders.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
        return res.json(orders);
      } catch (err) {
        console.warn('Firestore read failed, falling back to local:', err.message);
      }
    }

    // Local fallback
    const orders = localdb.queryDocs('orders', 'user_id', userId);
    orders.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    const enriched = orders.map((o) => ({ ...o, item_count: (o.items || []).length }));
    return res.json(enriched);
  });

  // ─── Get order details ─────────────────────────────────────────────────────
  router.get('/:orderId', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const orderId = req.params.orderId;
    const useFirestore = await isFirestoreAvailable();

    if (useFirestore) {
      try {
        const db = getDb();
        const orderSnap = await db.collection('orders').doc(String(orderId)).get();
        if (orderSnap.exists && orderSnap.data().user_id === userId) {
          const itemsSnap = await db.collection('order_items').where('order_id', '==', String(orderId)).get();
          return res.json({ id: orderSnap.id, ...orderSnap.data(), items: itemsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) });
        }
      } catch (err) {
        console.warn('Firestore read failed, falling back to local:', err.message);
      }
    }

    const order = localdb.getDoc('orders', orderId);
    if (!order || order.user_id !== userId) {
      return res.status(404).json({ error: 'Order not found' });
    }
    return res.json(order);
  });

  // ─── Update order status ───────────────────────────────────────────────────
  router.patch('/:orderId/status', authMiddleware, async (req, res) => {
    const { status } = req.body;
    const orderId = req.params.orderId;
    const userId = req.user.id;

    if (!status) return res.status(400).json({ error: 'Status required' });

    const useFirestore = await isFirestoreAvailable();
    if (useFirestore) {
      try {
        const db = getDb();
        const ref = db.collection('orders').doc(String(orderId));
        const snap = await ref.get();
        if (snap.exists && snap.data().user_id === userId) {
          await ref.update({ status, updated_at: new Date().toISOString() });
          return res.json({ message: 'Order status updated' });
        }
      } catch (err) {
        console.warn('Firestore update failed, using local:', err.message);
      }
    }

    const order = localdb.getDoc('orders', orderId);
    if (!order || order.user_id !== userId) return res.status(404).json({ error: 'Order not found' });
    localdb.updateDoc('orders', orderId, { status, updated_at: new Date().toISOString() });
    return res.json({ message: 'Order status updated' });
  });

  // ─── Cancel order ──────────────────────────────────────────────────────────
  router.post('/:orderId/cancel', authMiddleware, async (req, res) => {
    const orderId = req.params.orderId;
    const userId = req.user.id;

    const useFirestore = await isFirestoreAvailable();
    if (useFirestore) {
      try {
        const db = getDb();
        const ref = db.collection('orders').doc(String(orderId));
        const snap = await ref.get();
        if (snap.exists && snap.data().user_id === userId && snap.data().status === 'processing') {
          await ref.update({ status: 'cancelled', updated_at: new Date().toISOString() });
          return res.json({ message: 'Order cancelled successfully' });
        }
      } catch (err) {
        console.warn('Firestore cancel failed, using local:', err.message);
      }
    }

    const order = localdb.getDoc('orders', orderId);
    if (!order || order.user_id !== userId || order.status !== 'processing') {
      return res.status(400).json({ error: 'Order cannot be cancelled' });
    }
    localdb.updateDoc('orders', orderId, { status: 'cancelled', updated_at: new Date().toISOString() });
    return res.json({ message: 'Order cancelled successfully' });
  });

  // ─── Attach payment proof screenshot ──────────────────────────────────────
  router.post('/:orderId/payment-proof', authMiddleware, async (req, res) => {
    try {
      const orderId = req.params.orderId;
      const userId = req.user.id;
      const { proof_image, notes } = req.body;

      if (!proof_image) return res.status(400).json({ error: 'Payment screenshot image is required' });

      const updateData = {
        payment_proof: {
          image: proof_image,
          notes: notes || '',
          uploaded_at: new Date().toISOString(),
        },
        payment_status: 'proof_submitted',
        updated_at: new Date().toISOString(),
      };

      const useFirestore = await isFirestoreAvailable();
      if (useFirestore) {
        try {
          const db = getDb();
          const ref = db.collection('orders').doc(String(orderId));
          const snap = await ref.get();
          if (!snap.exists) return res.status(404).json({ error: 'Order not found' });
          const order = snap.data();
          if (order.user_id !== userId && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized to modify this order' });
          }
          await ref.update(updateData);
          return res.json({ message: 'Screenshot attached successfully', ...updateData });
        } catch (err) {
          console.warn('Firestore proof update failed, using local:', err.message);
        }
      }

      const order = localdb.getDoc('orders', orderId);
      if (!order) return res.status(404).json({ error: 'Order not found' });
      if (order.user_id !== userId && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      localdb.updateDoc('orders', orderId, updateData);
      return res.json({ message: 'Screenshot attached successfully', ...updateData });
    } catch (err) {
      console.error('Failed to attach payment proof:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};