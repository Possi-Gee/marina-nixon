const express = require('express');
const crypto = require('crypto');
const { authMiddleware } = require('../middleware/auth');
const { getDb } = require('../lib/firebase');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_BASE = 'https://api.paystack.co';

async function paystackRequest(method, path, body) {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

module.exports = () => {
  const router = express.Router();

  // Public config: Paystack public key for the checkout popup
  router.get('/config', (req, res) => {
    res.json({
      paystack_public_key: process.env.PAYSTACK_PUBLIC_KEY || null,
      currency: 'GHS',
    });
  });

  // Initialize a Paystack transaction for online methods (visa / momo / mtn)
  router.post('/initialize', authMiddleware, async (req, res) => {
    const db = getDb();
    const userId = req.user.id;
    const { order_id, payment_method, email, phone } = req.body;

    if (!order_id) {
      return res.status(400).json({ error: 'Order ID required' });
    }

    if (!PAYSTACK_SECRET) {
      return res.status(503).json({ error: 'Paystack is not configured on the server' });
    }

    const orderSnap = await db.collection('orders').doc(String(order_id)).get();
    if (!orderSnap.exists || orderSnap.data().user_id !== userId) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const orderData = orderSnap.data();
    // Enforce verified total from the order document
    const verifiedAmount = Number(orderData.total || req.body.amount || 0);
    if (verifiedAmount <= 0) {
      return res.status(400).json({ error: 'Invalid order amount' });
    }

    const method = String(payment_method || '').toLowerCase();
    let channels = ['card'];
    let paystackPayment = 'card';
    const mobileMoney = {};

    if (method === 'momo' || method === 'mtn' || method === 'telecel' || method === 'vodafone' || method === 'tigo' || method === 'airteltigo') {
      channels = ['mobile_money'];
      paystackPayment = 'mobile_money';
      mobileMoney.phone = String(phone || orderData.payment_phone || '');
      if (method === 'telecel' || method === 'vodafone') {
        mobileMoney.provider = 'vod';
      } else if (method === 'tigo' || method === 'airteltigo') {
        mobileMoney.provider = 'tgo';
      } else {
        mobileMoney.provider = 'mtn';
      }
    }

    const initBody = {
      email: email || req.user.email,
      amount: Math.round(verifiedAmount * 100),
      currency: 'GHS',
      reference: `MN-${order_id}-${Date.now().toString().slice(-4)}`,
      channels,
      metadata: { order_id: String(order_id), payment_method: paystackPayment },
      callback_url: process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/#chk` : undefined,
    };
    if (mobileMoney.phone) initBody.mobile_money = mobileMoney;

    const initResponse = await paystackRequest('POST', '/transaction/initialize', initBody);
    if (!initResponse.data || !initResponse.data.status) {
      return res.status(502).json({ error: `Paystack initialization failed: ${initResponse.data.message || 'unknown error'}` });
    }

    const data = initResponse.data.data;
    await db.collection('payments').doc(`intent_${order_id}`).set({
      order_id: String(order_id),
      user_id: userId,
      amount: verifiedAmount,
      payment_method: method,
      reference: String(data.reference),
      access_code: String(data.access_code || ''),
      status: 'pending',
      created_at: new Date().toISOString(),
    }, { merge: true });

    await db.collection('orders').doc(String(order_id)).update({
      payment_status: 'pending',
      paystack_reference: String(data.reference),
      updated_at: new Date().toISOString(),
    });

    res.json({
      message: 'Payment initialization started',
      authorization_url: data.authorization_url,
      access_code: data.access_code,
      reference: data.reference,
      payment_id: `intent_${order_id}`,
    });
  });

  // Verify a transaction (called after client returns from Paystack popup)
  router.get('/verify/:reference', authMiddleware, async (req, res) => {
    const db = getDb();
    const reference = String(req.params.reference);
    const userId = req.user.id;

    const verify = await paystackRequest('GET', `/transaction/verify/${encodeURIComponent(reference)}`);
    if (!verify.data || !verify.data.data) {
      return res.status(502).json({ error: 'Unable to verify payment' });
    }

    const tx = verify.data.data;
    const orderId = String(tx.metadata?.order_id || '').replace(/^intent_/, '');
    const orderSnap = orderId ? await db.collection('orders').doc(orderId).get() : null;
    if (!orderSnap || !orderSnap.exists || orderSnap.data().user_id !== userId) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (tx.status !== 'success') {
      await db.collection('orders').doc(orderId).update({ payment_status: 'failed', updated_at: new Date().toISOString() });
      return res.status(400).json({ error: 'Payment not successful', status: tx.status });
    }

    const amountPaid = Number(tx.amount || 0) / 100;
    await db.collection('payments').doc(`intent_${orderId}`).set({
      order_id: orderId,
      user_id: userId,
      amount: amountPaid,
      payment_method: tx.channel || 'card',
      reference,
      paystack_metadata: tx,
      status: 'completed',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { merge: true });

    await db.collection('orders').doc(orderId).update({
      payment_status: 'paid',
      status: orderSnap.data().status === 'processing' ? 'paid' : orderSnap.data().status,
      updated_at: new Date().toISOString(),
    });

    res.json({ success: true, order_id: orderId, paid: true });
  });

  // Get payment history
  router.get('/history', authMiddleware, async (req, res) => {
    const db = getDb();
    const userId = req.user.id;

    const ordersSnap = await db.collection('orders').where('user_id', '==', userId).get();
    const orderIds = ordersSnap.docs.map((doc) => doc.id);
    const paymentsSnap = await db.collection('payments').where('user_id', '==', userId).get();

    const rows = paymentsSnap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((payment) => orderIds.includes(String(payment.order_id)))
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

    res.json(rows);
  });

  // Webhook for Paystack payment confirmations (Mobile Money, Card, etc.)
  router.post('/webhook', async (req, res) => {
    try {
      const paystackSignature = req.headers['x-paystack-signature'];
      if (!PAYSTACK_SECRET) {
        return res.status(503).json({ error: 'Paystack secret not configured' });
      }

      if (!paystackSignature) {
        return res.status(401).json({ error: 'Missing Paystack signature' });
      }

      const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));
      const expectedHash = crypto.createHmac('sha512', PAYSTACK_SECRET).update(rawBody).digest('hex');

      if (paystackSignature !== expectedHash) {
        console.warn('Invalid Paystack webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      const event = req.body;
      if (event && event.event === 'charge.success') {
        const data = event.data;
        const reference = String(data.reference || '');
        const orderId = String(data.metadata?.order_id || '').replace(/^intent_/, '');

        const db = getDb();
        let targetOrderRef = null;
        let orderDoc = null;

        if (orderId) {
          const snap = await db.collection('orders').doc(orderId).get();
          if (snap.exists) {
            targetOrderRef = snap.ref;
            orderDoc = snap.data();
          }
        }

        if (!targetOrderRef && reference) {
          const byRefSnap = await db.collection('orders').where('paystack_reference', '==', reference).limit(1).get();
          if (!byRefSnap.empty) {
            targetOrderRef = byRefSnap.docs[0].ref;
            orderDoc = byRefSnap.docs[0].data();
          }
        }

        if (targetOrderRef && orderDoc) {
          const now = new Date().toISOString();
          await targetOrderRef.update({
            payment_status: 'paid',
            status: orderDoc.status === 'processing' ? 'paid' : orderDoc.status,
            paystack_reference: reference,
            updated_at: now,
          });

          await db.collection('payments').doc(`intent_${targetOrderRef.id}`).set({
            order_id: targetOrderRef.id,
            user_id: orderDoc.user_id,
            amount: Number(data.amount || 0) / 100,
            payment_method: data.channel || 'paystack',
            reference,
            paystack_metadata: data,
            status: 'completed',
            webhook_received_at: now,
            updated_at: now,
          }, { merge: true });
        }
      }

      return res.status(200).json({ status: 'success' });
    } catch (err) {
      console.error('Paystack webhook error:', err);
      return res.status(500).json({ error: 'Webhook processing error' });
    }
  });

  // Get payment by ID
  router.get('/:paymentId', authMiddleware, async (req, res) => {
    const db = getDb();
    const userId = req.user.id;
    const paymentId = req.params.paymentId;

    const paymentSnap = await db.collection('payments').doc(String(paymentId)).get();
    if (!paymentSnap.exists) return res.status(404).json({ error: 'Payment not found' });

    const payment = paymentSnap.data();
    const orderSnap = await db.collection('orders').doc(String(payment.order_id)).get();
    if (!orderSnap.exists || orderSnap.data().user_id !== userId) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json({ id: paymentSnap.id, ...payment });
  });

  return router;
};