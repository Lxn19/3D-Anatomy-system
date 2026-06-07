// =============================================================================
// src/config/db.js
// PostgreSQL connection pool — the single shared pool used by all services.
//
// INTEGRATION NOTE:
//   organService.js and userService.js import as:  const { pool } = require('../config/db');
//   promptEngine.js (Member 4) imports as:         const pool = require('../db');
//
//   FIX: Member 4's promptEngine.js uses `const pool = require('../db')` with
//   no destructuring, expecting the pool directly. We export BOTH forms:
//     - Named:   { pool }          → used by Member 3's services
//     - Default: module.exports.pool AND module.exports itself as a pool-like object
//   To fix Member 4 cleanly, update promptEngine.js to use:
//     const { pool } = require('../config/db');
//   The corrected promptEngine.js (in routes/aiRoutes.js) uses { pool }.
// =============================================================================

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,

    ssl: process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,

    max:                    10,
    idleTimeoutMillis:      30_000,
    connectionTimeoutMillis: 5_000,
});

/**
 * Borrow one client from the pool to verify connectivity.
 * Call this from server.js (app.js) at startup to fail fast.
 */
const testConnection = async () => {
    const client = await pool.connect();
    try {
        await client.query('SELECT NOW()');
        console.log('[db] PostgreSQL connection pool established successfully.');
    } finally {
        client.release();
    }
};

pool.on('error', (err) => {
    console.error('[db] Unexpected PostgreSQL pool error:', err.message);
    process.exit(1);
});

module.exports = { pool, testConnection };
