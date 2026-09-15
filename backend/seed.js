require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { bootstrap } = require('./bootstrap');

bootstrap()
  .then(() => {
    console.log('Seed completed successfully.');
  })
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  });
