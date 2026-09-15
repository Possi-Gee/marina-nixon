const admin = require('firebase-admin');

let initialized = false;

function parseServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  return {
    project_id: projectId,
    client_email: clientEmail,
    private_key: privateKey.replace(/\\n/g, '\n'),
  };
}

function initFirebase() {
  if (initialized) return admin;

  const serviceAccount = parseServiceAccount();
  const projectId = process.env.FIREBASE_PROJECT_ID;

  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id || projectId,
    });
  } else if (projectId) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId,
    });
  } else {
    admin.initializeApp();
  }

  admin.firestore().settings({ ignoreUndefinedProperties: true });
  initialized = true;
  return admin;
}

function getDb() {
  initFirebase();
  return admin.firestore();
}

module.exports = { admin, initFirebase, getDb };
