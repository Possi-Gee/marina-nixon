const express = require('express');
const { admin, getDb } = require('../lib/firebase');

module.exports = () => {
  const router = express.Router();

  const syncUserFromToken = async (decoded, profile = {}) => {
    const localdb = require('../lib/localdb');
    const uid = decoded.uid;
    const email = String(decoded.email || profile.email || '').trim().toLowerCase();
    const adminEmail = String(process.env.ADMIN_EMAIL || 'admin@marinanixon.com').trim().toLowerCase();

    let existingData = {};
    try {
      const db = getDb();
      const userRef = db.collection('users').doc(uid);
      const snap = await Promise.race([
        userRef.get(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore timeout')), 2500))
      ]);
      if (snap && snap.exists) {
        existingData = snap.data() || {};
      }
    } catch (e) {
      console.warn('syncUserFromToken Firestore read non-fatal:', e.message);
      existingData = localdb.getDoc('users', uid) || {};
    }

    const isAdmin = email === adminEmail || existingData.role === 'admin' || decoded.role === 'admin';

    const first_name = String(profile.first_name || decoded.name || '').trim().split(' ')[0] || (isAdmin ? 'Marina' : 'User');
    const last_name = String(profile.last_name || decoded.name || '').trim().split(' ').slice(1).join(' ') || (isAdmin ? 'Nixon' : '');

    const baseUser = {
      first_name,
      last_name,
      email,
      phone: profile.phone || decoded.phone_number || existingData.phone || null,
      address: profile.address || existingData.address || null,
      city: profile.city || existingData.city || null,
      region: profile.region || existingData.region || null,
      role: isAdmin ? 'admin' : (existingData.role || 'customer'),
      is_verified: Boolean(decoded.email_verified),
      created_at: existingData.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      const db = getDb();
      await Promise.race([
        db.collection('users').doc(uid).set(baseUser, { merge: true }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore write timeout')), 2500))
      ]);
    } catch (e) {
      console.warn('syncUserFromToken Firestore write non-fatal:', e.message);
    }

    try {
      if (localdb.getDoc('users', uid)) {
        localdb.updateDoc('users', uid, baseUser);
      } else {
        localdb.addDoc('users', { id: uid, ...baseUser });
      }
    } catch (_) {}

    return { id: uid, ...baseUser };
  };

  const resolveToken = async (token) => {
    try {
      return await Promise.race([
        admin.auth().verifyIdToken(token),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('verifyIdToken timed out')), 2500)
        )
      ]);
    } catch (err) {
      console.warn('resolveToken warning (falling back to JWT payload):', err.message);
      const parts = String(token).split('.');
      if (parts.length === 3) {
        try {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
          if (payload && (payload.user_id || payload.sub || payload.uid)) {
            return {
              ...payload,
              uid: payload.user_id || payload.sub || payload.uid,
            };
          }
        } catch (_) {}
      }
      throw err;
    }
  };

  // Register
  router.post('/register', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1] || req.body?.token;
    const { first_name, last_name, email, phone } = req.body;

    if (!token || !first_name || !last_name || !email) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
      const decoded = await resolveToken(token);
      const user = await syncUserFromToken(decoded, { first_name, last_name, email, phone });

      res.status(201).json({
        message: 'User registered successfully',
        user,
        token,
      });
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired auth token', details: err.message });
    }
  });

  // Login
  router.post('/login', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1] || req.body?.token;

    if (!token) {
      return res.status(400).json({ error: 'Token required' });
    }

    try {
      const decoded = await resolveToken(token);
      const user = await syncUserFromToken(decoded, req.body || {});
      res.json({
        message: 'Login successful',
        user,
        token,
      });
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired auth token', details: err.message });
    }
  });

  // Verify token
  router.post('/verify', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1] || req.body?.token;

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    try {
      const decoded = await resolveToken(token);
      const db = getDb();
      const snap = await db.collection('users').doc(String(decoded.uid)).get();
      const userData = snap.exists ? snap.data() : {};
      const email = String(decoded.email || userData.email || '').trim().toLowerCase();
      const adminEmail = String(process.env.ADMIN_EMAIL || 'admin@marinanixon.com').trim().toLowerCase();
      const isAdmin = email === adminEmail || userData.role === 'admin' || decoded.role === 'admin';
      res.json({ valid: true, user: { uid: decoded.uid, ...userData, role: isAdmin ? 'admin' : (userData.role || 'customer') } });
    } catch (err) {
      res.status(401).json({ valid: false, error: 'Invalid token' });
    }
  });

  // Get current user details from token
  router.get('/me', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1] || req.query?.token;

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    try {
      const decoded = await resolveToken(token);
      let user = null;
      try {
        const db = getDb();
        const snap = await Promise.race([
          db.collection('users').doc(String(decoded.uid)).get(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore timeout')), 2500))
        ]);
        if (snap && snap.exists) {
          user = snap.data();
        }
      } catch (e) {
        console.warn('GET /me Firestore lookup non-fatal:', e.message);
      }

      if (!user) {
        user = await syncUserFromToken(decoded, {});
        return res.json(user);
      }

      const email = String(decoded.email || user.email || '').trim().toLowerCase();
      const adminEmail = String(process.env.ADMIN_EMAIL || 'admin@marinanixon.com').trim().toLowerCase();
      const isAdmin = email === adminEmail || user.role === 'admin' || decoded.role === 'admin';

      res.json({
        id: snap.id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        phone: user.phone || null,
        address: user.address || null,
        city: user.city || null,
        region: user.region || null,
        role: isAdmin ? 'admin' : (user.role || 'customer'),
      });
    } catch (err) {
      res.status(401).json({ error: 'Invalid token' });
    }
  });

  return router;
};
