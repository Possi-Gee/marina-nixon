// Eagerly initialize Firebase before any requests arrive.
// Without this, Firebase is initialized lazily on the first request,
// which causes admin.auth().verifyIdToken() to race with initializeApp().
const { initFirebase } = require('../backend/lib/firebase');
initFirebase();

const { app } = require('../backend/server');

module.exports = app;
