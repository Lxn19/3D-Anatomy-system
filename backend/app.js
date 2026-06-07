// =============================================================================
// app.js — Final Integrated Express Server
// 3D Anatomy Learning System — All Four Members
//
// Routes mounted:
//   /api/auth    — Member 3 (authRoutes.js)   — register, login, refresh, logout, /me
//   /api/organs  — Member 3 (organRoutes.js)  — search, systems, /:id
//   /api/users   — Member 3 (userRoutes.js)   — profile, progress (CRUD)
//   /api/quiz    — Member 2 (quizRoutes.js)   — questions, sessions, submit, history
//   /api/ai      — Member 4 (aiRoutes.js)     — chat (SSE stream), history
//
// FIX (Member 4 server.js):
//   Original server.js posted a single hard-coded /chat endpoint with mock
//   replies and no auth. Replaced entirely with the proper OpenAI-integrated
//   aiRoutes.js, mounted under /api/ai and protected by Member 3's JWT auth.
//
// FIX (Member 4 server.js — setLoading bug in App.jsx):
//   App.jsx called `loading(true)` instead of `setLoading(true)`. This is a
//   React crash bug. See the corrected AIChatWidget.jsx which replaces App.jsx.
// =============================================================================

require('dotenv').config();

const express   = require('express');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');

const { testConnection } = require('./config/db');

const authRoutes  = require('./routes/authRoutes');
const organRoutes = require('./routes/organRoutes');
const userRoutes  = require('./routes/userRoutes');
const quizRoutes  = require('./routes/quizRoutes');
const aiRoutes    = require('./routes/aiRoutes');

const app  = express();
const PORT = process.env.PORT || 3001;

// =============================================================================
// Middleware
// =============================================================================

app.use(cors({
    origin:         process.env.FRONTEND_URL || 'http://localhost:3000',
    methods:        ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

// Rate limiting — tighter limit for AI (expensive), standard for everything else
app.use('/api/ai',  rateLimit({ windowMs: 60 * 1000,       max: 20  }));  // 20 req/min
app.use('/api/',    rateLimit({ windowMs: 15 * 60 * 1000,  max: 100 }));  // 100 req/15 min

// =============================================================================
// Routes
// =============================================================================

app.use('/api/auth',   authRoutes);    // Member 3
app.use('/api/organs', organRoutes);   // Member 3
app.use('/api/users',  userRoutes);    // Member 3
app.use('/api/quiz',   quizRoutes);    // Member 2
app.use('/api/ai',     aiRoutes);      // Member 4

// =============================================================================
// Health Check
// =============================================================================

app.get('/health', (_req, res) =>
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
);

// =============================================================================
// 404 Handler
// =============================================================================

app.use((req, res) =>
    res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` })
);

// =============================================================================
// Global Error Handler
// =============================================================================

app.use((err, _req, res, _next) => {
    console.error('[app] Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error.' });
});

// =============================================================================
// Start
// =============================================================================

const start = async () => {
    try {
        await testConnection();
        app.listen(PORT, () =>
            console.log(`🫀 Anatomy API running on port ${PORT}`)
        );
    } catch (err) {
        console.error('[app] Failed to connect to database:', err.message);
        process.exit(1);
    }
};

start();

module.exports = app;   // Exported for integrationTest.js
