// =============================================================================
// src/server.js
// Application Entry Point — Express server setup and startup.
//
// Start development server:
//   npm run dev
//
// Start production server:
//   npm start
// =============================================================================

require('dotenv').config();                        // Load .env variables first.

if (!process.env.JWT_SECRET || !process.env.JWT_SECRET.trim()) {
    console.error('[server] Fatal configuration error: JWT_SECRET is required.');
    process.exit(1);
}

const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const morgan      = require('morgan');
const rateLimit   = require('express-rate-limit');

const { pool, testConnection } = require('./config/db');
const authRoutes          = require('./routes/authRoutes');
const organRoutes         = require('./routes/organRoutes');
const userRoutes          = require('./routes/userRoutes');

const app  = express();
const PORT = process.env.PORT || 5000;
let server;

// =============================================================================
// Global Middleware
// =============================================================================

// --- Security headers (CSP, XSS protection, etc.) ---
app.use(helmet());

// --- CORS ---
// Only allow requests from the configured frontend origin.
app.use(cors({
    origin:      process.env.FRONTEND_URL || 'http://localhost:3000',
    methods:     ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
}));

// --- Request body parsing ---
app.use(express.json({ limit: '10kb' }));           // Reject bodies > 10 KB.
app.use(express.urlencoded({ extended: true }));

// --- HTTP request logging ---
// 'dev' format: coloured single-line logs for development.
// Switch to 'combined' for production (Apache-style access log).
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// --- Global rate limiter ---
// Prevents brute-force and DoS attacks on all endpoints.
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15-minute window.
    max:      200,               // Maximum 200 requests per window per IP.
    standardHeaders: true,
    legacyHeaders:   false,
    message: { success: false, message: 'Too many requests, please try again later.' },
});
app.use(globalLimiter);

// Stricter limiter specifically for auth endpoints.
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15-minute window.
    max:      20,               // Maximum 20 auth attempts per window per IP.
    standardHeaders: true,
    legacyHeaders:   false,
    message: { success: false, message: 'Too many authentication attempts. Please try again in 15 minutes.' },
});

// =============================================================================
// Routes
// =============================================================================

// Health check — no auth required, useful for Docker/Kubernetes probes.
app.get('/api/health', (_req, res) => {
    res.status(200).json({ success: true, status: 'OK', timestamp: new Date().toISOString() });
});

// Authentication routes (register, login, refresh, logout, me).
app.use('/api/auth', authLimiter, authRoutes);

// Organ search and detail routes.
app.use('/api/organs', organRoutes);

// User profile and progress routes (all protected via verifyToken in userRoutes.js).
// Member 2 (Quiz Module): POST /api/users/progress, GET /api/users/progress
// Member 4 (AI Assistant): GET  /api/users/progress, GET /api/users/profile
app.use('/api/users', userRoutes);

// =============================================================================
// 404 Handler — catches all unmatched routes
// =============================================================================

app.use((_req, res) => {
    res.status(404).json({ success: false, message: 'Route not found.' });
});

// =============================================================================
// Global Error Handler — catches errors passed via next(err)
// =============================================================================

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
    console.error('[server] Unhandled error:', err.stack);
    res.status(err.status || 500).json({
        success: false,
        message: process.env.NODE_ENV === 'production'
            ? 'An unexpected error occurred.'
            : err.message,
    });
});

// =============================================================================
// Startup
// =============================================================================

const startServer = async () => {
    try {
        // Verify the database is reachable before accepting HTTP traffic.
        await testConnection();

        server = app.listen(PORT, () => {
            console.log(`[server] 3D Anatomy API running on http://localhost:${PORT}`);
            console.log(`[server] Environment: ${process.env.NODE_ENV || 'development'}`);
        });
    } catch (err) {
        console.error('[server] Failed to connect to the database. Exiting.', err.message);
        process.exit(1);
    }
};

startServer();

// =============================================================================
// Graceful Shutdown
// =============================================================================

const gracefulShutdown = async (signal) => {
    console.log(`[server] ${signal} received. Shutting down gracefully...`);

    try {
        if (server) {
            await new Promise((resolve, reject) => {
                server.close((err) => (err ? reject(err) : resolve()));
            });
            console.log('[server] HTTP server closed.');
        }

        await pool.end();
        console.log('[server] PostgreSQL pool closed.');
        process.exit(0);
    } catch (err) {
        console.error('[server] Error during graceful shutdown:', err.message);
        process.exit(1);
    }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
