require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { bootstrap } = require('./bootstrap');

bootstrap()
  .then(() => {
    console.log('Firestore bootstrap completed successfully.');
  })
  .catch((err) => {
    console.error('Bootstrap failed:', err);
    process.exitCode = 1;
  });
