const { admin, getDb } = require('../lib/firebase');

const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1] || req.body?.token;
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const db = getDb();
    const userId = decoded.uid;
    let userSnap = await db.collection('users').doc(String(userId)).get();
    const email = String(decoded.email || '').toLowerCase();
    const adminEmail = String(process.env.ADMIN_EMAIL || 'admin@marinanixon.com').trim().toLowerCase();
    const isAdmin = email === adminEmail;

    if (!userSnap.exists) {
      const nameParts = String(decoded.name || '').split(' ');
      const baseUser = {
        first_name: nameParts[0] || (isAdmin ? 'Marina' : 'Customer'),
        last_name: nameParts.slice(1).join(' ') || (isAdmin ? 'Nixon' : ''),
        email: email,
        role: isAdmin ? 'admin' : 'customer',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await db.collection('users').doc(String(userId)).set(baseUser, { merge: true });
      userSnap = await db.collection('users').doc(String(userId)).get();
    } else if (isAdmin && userSnap.data()?.role !== 'admin') {
      await db.collection('users').doc(String(userId)).update({
        role: 'admin',
        updated_at: new Date().toISOString()
      });
      userSnap = await db.collection('users').doc(String(userId)).get();
    }

    const userData = userSnap.data() || {};
    req.user = { 
      ...decoded, 
      ...userData, 
      role: isAdmin ? 'admin' : (userData.role || 'customer'), 
      id: userSnap.id 
    };
    next();
  } catch (err) {
    console.error('authMiddleware verification error:', err.message);
    res.status(401).json({ error: 'Invalid token', details: err.message });
  }
};

const adminMiddleware = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Admin access required' });
  }
};

module.exports = { authMiddleware, adminMiddleware };
