const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { getDb } = require('../lib/firebase');
const { sendOrderConfirmation } = require('../lib/mailer');

module.exports = () => {
  const router = express.Router();

  const toOrder = (doc) => ({ id: doc.id, ...doc.data() });

  // Generate unique order number (e.g. MN-20260914-A3F9)
  async function generateOrderNumber(db) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    for (let attempts = 0; attempts < 5; attempts++) {
      let suffix = '';
      for (let i = 0; i < 4; i++) {
        suffix += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const orderNumber = `MN-${dateStr}-${suffix}`;
      const existing = await db.collection('orders').where('order_number', '==', orderNumber).limit(1).get();
      if (existing.empty) return orderNumber;
    }
    return `MN-${dateStr}-${Date.now().toString().slice(-6)}`;
  }

  const { getPromoDetails, calculateDiscount } = require('../lib/promo');

  // Create order
  router.post('/', authMiddleware, async (req, res) => {
    const db = getDb();
    const userId = req.user.id;
    const {
      items, payment_method, delivery_method,
      shipping_address, address = {},
      payment_phone, promo_code, promo,
    } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Order must contain at least one item' });
    }

    const orderNumber = await generateOrderNumber(db);
    const orderRef = db.collection('orders').doc();
    const orderId = orderRef.id;
    const now = new Date().toISOString();

    const addressPayload = {
      street: address.street || address.address1 || shipping_address?.street || null,
      city: address.city || shipping_address?.city || 'Accra',
      region: address.region || shipping_address?.region || 'Greater Accra',
      notes: address.notes || shipping_address?.notes || null,
    };

    let verifiedItems = [];
    let subtotal = 0;

    // Atomically decrement stock and verify authentic prices from DB
    // IMPORTANT: Firestore transactions require ALL READS to execute before ALL WRITES!
    try {
      await db.runTransaction(async (tx) => {
        verifiedItems = [];
        subtotal = 0;

        // 1. ALL READS FIRST
        const reads = [];
        for (const item of items) {
          const productId = String(item.product_id || item.id || '');
          if (!productId) throw new Error('Invalid product in order');
          const prodRef = db.collection('products').doc(productId);
          const snap = await tx.get(prodRef);
          reads.push({ item, prodRef, snap, productId });
        }

        // 2. Process validations & prepare write updates
        const updates = [];
        for (const { item, prodRef, snap, productId } of reads) {
          if (!snap.exists) {
            throw new Error(`Product ${productId} not found`);
          }

          const productData = snap.data();
          const currentStock = Number(productData.stock || 0);
          const qty = Math.max(1, parseInt(item.quantity, 10) || 1);

          if (currentStock < qty) {
            throw new Error(`Insufficient stock for ${productData.name || productId}`);
          }

          const verifiedPrice = Number(productData.price || 0);
          const itemTotal = verifiedPrice * qty;
          subtotal += itemTotal;

          verifiedItems.push({
            product_id: productId,
            name: productData.name || 'Garment',
            price: verifiedPrice,
            quantity: qty,
            size: item.size || null,
            image: productData.image || productData.img || null,
          });

          updates.push({
            prodRef,
            stock: Math.max(0, currentStock - qty),
          });
        }

        // 3. ALL WRITES AFTER READS
        for (const update of updates) {
          tx.update(update.prodRef, {
            stock: update.stock,
            updated_at: now,
          });
        }
      });

      // Calculate server-side discounts and shipping
      const promoInfo = getPromoDetails(promo_code || promo);
      const discountAmount = promoInfo ? calculateDiscount(promoInfo, subtotal) : 0;

      let shippingFee = 30; // default standard
      const method = String(delivery_method || 'standard').toLowerCase();
      if (method === 'pickup') {
        shippingFee = 0;
      } else if (method === 'express') {
        shippingFee = 50;
      } else {
        // Standard delivery: free over GH₵ 1,000 or if promo is FREESHIP
        if (subtotal >= 1000 || (promoInfo && promoInfo.code === 'FREESHIP')) {
          shippingFee = 0;
        }
      }

      const finalTotal = Math.max(0, Math.round((subtotal - discountAmount + shippingFee) * 100) / 100);

      const batch = db.batch();
      batch.set(orderRef, {
        user_id: userId,
        order_number: orderNumber,
        subtotal,
        total: finalTotal,
        shipping_cost: shippingFee,
        discount: discountAmount,
        promo_code: promoInfo ? promoInfo.code : null,
        status: 'processing',
        payment_status: 'unpaid',
        payment_method: payment_method || null,
        delivery_method: delivery_method || null,
        shipping_address: addressPayload,
        payment_phone: payment_phone || null,
        created_at: now,
        updated_at: now,
      });

      verifiedItems.forEach((item) => {
        const itemRef = db.collection('order_items').doc();
        batch.set(itemRef, {
          order_id: orderId,
          product_id: item.product_id,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          size: item.size,
          created_at: now,
        });
      });

      await batch.commit();

      // Send confirmation email (best-effort, non-blocking)
      try {
        const userSnap = await db.collection('users').doc(String(userId)).get();
        const user = userSnap.data() || {};
        await sendOrderConfirmation({
          to: user.email,
          order: {
            ...req.body,
            reference: orderNumber,
            order_number: orderNumber,
            total: finalTotal,
            subtotal,
            shipping_cost: shippingFee,
            discount: discountAmount,
          },
          items: verifiedItems,
        });
      } catch (err) {
        // email is best-effort; never fail the order because of it
      }

      res.status(201).json({
        message: 'Order created successfully',
        order_id: orderId,
        order_number: orderNumber,
        subtotal,
        total: finalTotal,
        shipping_cost: shippingFee,
        discount: discountAmount,
      });
    } catch (err) {
      console.error('Order creation error:', err.message);
      return res.status(400).json({ error: err.message || 'Order could not be created' });
    }
  });

  // Get user orders
  router.get('/', authMiddleware, async (req, res) => {
    const db = getDb();
    const userId = req.user.id;

    const snap = await db.collection('orders').where('user_id', '==', userId).get();
    const orders = await Promise.all(snap.docs.map(async (doc) => {
      const data = doc.data();
      const itemsSnap = await db.collection('order_items').where('order_id', '==', doc.id).get();
      return { id: doc.id, ...data, item_count: itemsSnap.size };
    }));

    orders.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    res.json(orders);
  });

  // Get order details
  router.get('/:orderId', authMiddleware, async (req, res) => {
    const db = getDb();
    const userId = req.user.id;
    const orderId = req.params.orderId;

    const orderSnap = await db.collection('orders').doc(String(orderId)).get();
    if (!orderSnap.exists || orderSnap.data().user_id !== userId) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const itemsSnap = await db.collection('order_items').where('order_id', '==', String(orderId)).get();
    res.json({ ...toOrder(orderSnap), items: itemsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) });
  });

  // Update order status
  router.patch('/:orderId/status', authMiddleware, async (req, res) => {
    const db = getDb();
    const { status } = req.body;
    const orderId = req.params.orderId;
    const userId = req.user.id;

    if (!status) {
      return res.status(400).json({ error: 'Status required' });
    }

    const ref = db.collection('orders').doc(String(orderId));
    const snap = await ref.get();
    if (!snap.exists || snap.data().user_id !== userId) {
      return res.status(404).json({ error: 'Order not found' });
    }

    await ref.update({ status, updated_at: new Date().toISOString() });
    res.json({ message: 'Order status updated' });
  });

  // Cancel order
  router.post('/:orderId/cancel', authMiddleware, async (req, res) => {
    const db = getDb();
    const orderId = req.params.orderId;
    const userId = req.user.id;

    const ref = db.collection('orders').doc(String(orderId));
    const snap = await ref.get();
    if (!snap.exists || snap.data().user_id !== userId || snap.data().status !== 'processing') {
      return res.status(400).json({ error: 'Order cannot be cancelled' });
    }

    await ref.update({ status: 'cancelled', updated_at: new Date().toISOString() });
    res.json({ message: 'Order cancelled successfully' });
  });

  return router;
};