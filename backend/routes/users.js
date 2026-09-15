const express = require('express');
const bcrypt = require('bcryptjs');
const { authMiddleware } = require('../middleware/auth');
const { getDb } = require('../lib/firebase');

module.exports = () => {
  const router = express.Router();

  // Get profile
  router.get('/profile/me', authMiddleware, async (req, res) => {
    const db = getDb();
    const userId = req.user.id;

    const snap = await db.collection('users').doc(String(userId)).get();
    if (!snap.exists) return res.status(404).json({ error: 'User not found' });

    const user = snap.data();
    res.json({
      id: snap.id,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      phone: user.phone || null,
      address: user.address || null,
      city: user.city || null,
      region: user.region || null,
    });
  });

  // Update profile
  router.put('/profile/me', authMiddleware, async (req, res) => {
    const db = getDb();
    const userId = req.user.id;
    const { first_name, last_name, phone, address, city, region } = req.body;

    await db.collection('users').doc(String(userId)).update({
      first_name,
      last_name,
      phone: phone || null,
      address: address || null,
      city: city || null,
      region: region || null,
      updated_at: new Date().toISOString(),
    });

    res.json({ message: 'Profile updated successfully' });
  });

  // Change password
  router.post('/change-password', authMiddleware, async (req, res) => {
    const db = getDb();
    const userId = req.user.id;
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current and new password required' });
    }

    const snap = await db.collection('users').doc(String(userId)).get();
    if (!snap.exists) return res.status(404).json({ error: 'User not found' });

    const user = snap.data();
    const passwordMatch = bcrypt.compareSync(current_password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hashedPassword = bcrypt.hashSync(new_password, 10);
    await db.collection('users').doc(String(userId)).update({
      password: hashedPassword,
      updated_at: new Date().toISOString(),
    });

    res.json({ message: 'Password changed successfully' });
  });

  // Get user statistics
  router.get('/stats/dashboard', authMiddleware, async (req, res) => {
    const db = getDb();
    const userId = req.user.id;

    const [ordersSnap, wishlistSnap] = await Promise.all([
      db.collection('orders').where('user_id', '==', userId).get(),
      db.collection('wishlist').where('user_id', '==', userId).get(),
    ]);

    const totalSpent = ordersSnap.docs.reduce((sum, doc) => sum + Number(doc.data().total || 0), 0);

    res.json({
      total_orders: ordersSnap.size,
      total_wishlist: wishlistSnap.size,
      total_spent: totalSpent,
    });
  });

  return router;
};
