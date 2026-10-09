'use strict';

require('dotenv').config();
const { io: Client } = require('socket.io-client');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');

const { initSocket, sendToUser } = require('./utils/socket');
const User = require('./models/User');

let mongoServer;
let httpServer;
let clientSocket;
let patientId;
let token;

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function setup() {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'testsecret123';
  
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  // Setup Express and Socket.io
  const app = express();
  httpServer = http.createServer(app);
  initSocket(httpServer);
  
  await new Promise(resolve => httpServer.listen(5005, resolve));

  const patient = await User.create({
    name: 'Patient RT', email: 'rt@demo.com', passwordHash: 'hash', role: 'patient'
  });
  patientId = patient._id;

  token = jwt.sign({ id: patientId, role: 'patient' }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

async function runTests() {
  await setup();
  console.log('════════════════════════════════════════════════════════════');
  console.log('  A. Real-Time WebSocket Tests');
  console.log('════════════════════════════════════════════════════════════');

  // Test 1: Connect without token should fail
  await new Promise((resolve) => {
    const badClient = new Client(`http://localhost:5005`);
    badClient.on('connect_error', (err) => {
      assert(err.message === 'Authentication error: No token', 'Rejects connection without token');
      badClient.disconnect();
      resolve();
    });
  });

  // Test 2: Connect with invalid token should fail
  await new Promise((resolve) => {
    const badClient = new Client(`http://localhost:5005`, {
      auth: { token: 'invalidtoken' }
    });
    badClient.on('connect_error', (err) => {
      assert(err.message === 'Authentication error: Invalid token', `Rejects connection with invalid token (Got: ${err.message})`);
      badClient.disconnect();
      resolve();
    });
  });

  // Test 3: Connect with valid token
  await new Promise((resolve) => {
    clientSocket = new Client(`http://localhost:5005`, {
      auth: { token }
    });
    clientSocket.on('connect_error', (err) => {
      console.error('Test 3 connect_error:', err.message);
      assert(false, `Test 3 failed to connect: ${err.message}`);
      resolve();
    });
    clientSocket.on('connect', () => {
      assert(true, 'Connects successfully with valid token');
      resolve();
    });
  });

  // Test 4: Receive directed notification
  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      assert(false, 'Test 4 timed out waiting for notification');
      resolve();
    }, 2000);

    clientSocket.on('notification', (payload) => {
      clearTimeout(timeout);
      assert(payload.title === 'Test Alert', 'Receives directed real-time notification');
      resolve();
    });
    
    // Trigger notification
    sendToUser(patientId, 'notification', { title: 'Test Alert', message: 'Hello RT' });
  });

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  RESULTS');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`  Total:  ${passed + failed}`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);

  clientSocket.disconnect();
  httpServer.close();
  await mongoose.disconnect();
  await mongoServer.stop();
  
  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
