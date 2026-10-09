'use strict';

const { Server } = require('socket.io');
const cookie = require('cookie');
const jwt = require('jsonwebtoken');

let io;
// Map to track user connections: userId -> Set of socketIds
const userSockets = new Map();

/**
 * Initialize WebSocket Server
 * @param {object} httpServer - Express HTTP server instance
 */
function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5000',
      credentials: true
    }
  });

  io.use((socket, next) => {
    let token;
    try {
      const cookieStr = socket.request.headers.cookie || (socket.handshake && socket.handshake.headers && socket.handshake.headers.cookie) || '';
      const parseFn = cookie.parse || cookie.parseCookie;
      const cookies = parseFn(cookieStr);
      token = cookies.carelink_auth || (socket.handshake && socket.handshake.auth && socket.handshake.auth.token);
    } catch (err) {
      console.error('Socket auth parsing error:', err);
    }

    if (!token) {
      return next(new Error('Authentication error: No token'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Attach user info to socket
      socket.user = {
        id: decoded.id,
        role: decoded.role
      };
      
      next();
    } catch (err) {
      return next(new Error('Authentication error: Invalid token'));
    }
  });

  // Connection Handler
  io.on('connection', (socket) => {
    const userId = socket.user.id;

    // Track user's socket
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId).add(socket.id);

    // Join a room based on role (useful for broadcasting to all lab techs, doctors, etc)
    socket.join(`role:${socket.user.role}`);

    socket.on('disconnect', () => {
      if (userSockets.has(userId)) {
        userSockets.get(userId).delete(socket.id);
        if (userSockets.get(userId).size === 0) {
          userSockets.delete(userId);
        }
      }
    });
  });
}

/**
 * Send an event to a specific user
 * @param {string} userId - Target User ID
 * @param {string} eventName - Socket event name
 * @param {object} payload - Event data
 */
function sendToUser(userId, eventName, payload) {
  if (!io) return;
  const targetId = userId.toString();
  
  if (userSockets.has(targetId)) {
    const socketIds = userSockets.get(targetId);
    socketIds.forEach((socketId) => {
      io.to(socketId).emit(eventName, payload);
    });
  }
}

/**
 * Broadcast an event to a specific role group
 * @param {string} role - Role name (e.g., 'doctor', 'lab')
 * @param {string} eventName - Socket event name
 * @param {object} payload - Event data
 */
function broadcastToRole(role, eventName, payload) {
  if (!io) return;
  io.to(`role:${role}`).emit(eventName, payload);
}

module.exports = {
  initSocket,
  sendToUser,
  broadcastToRole
};
