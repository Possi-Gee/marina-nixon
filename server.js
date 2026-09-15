const express = require('express');
const { app, start } = require('./backend/server');

if (require.main === module) {
  start().catch((err) => {
    console.error('Failed to start server:', err);
    process.exitCode = 1;
  });
}

module.exports = app;
