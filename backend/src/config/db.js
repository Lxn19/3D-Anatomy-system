// =============================================================================
// src/config/db.js
// PostgreSQL connection pool — the single shared pool used by all services.
//
// Uses the `pg` package's Pool class which maintains a pool of reusable
// connections, avoiding the overhead of opening a new connection per query.
//
// Usage in any service file:
//   const pool = require('../config/db');
//   const result = await pool.query('SELECT ...', [params]);
// =============================================================================

const { Pool } = require('pg');
require('dotenv').config();

// ---------------------------------------------------------------------------
// Pool configuration
// ---------------------------------------------------------------------------

const pool = new Pool({
    // If DATABASE_URL is provided (e.g. in a cloud deployment), use it directly.
    // Otherwise, fall back to individual environment variables for local dev.
    connectionString: process.env.DATABASE_URL,

    // In production with TLS (e.g. Heroku, Render, Supabase), set ssl.rejectUnauthorized
    // to false only if the provider uses a self-signed cert (common on managed DBs).
    // Remove this block entirely for local development.
    ssl: process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,

    // Maximum number of simultaneous connections the pool will maintain.
    max: 10,

    // Milliseconds a client is allowed to remain idle before it is released.
    idleTimeoutMillis: 30_000,

    // Milliseconds to wait before timing out when acquiring a connection.
    connectionTimeoutMillis: 5_000,
});

// ---------------------------------------------------------------------------
// Connection health check — logged at startup from server.js
// ---------------------------------------------------------------------------

/**
 * Borrows one client from the pool, runs a trivial query, then releases it.
 * Throws if the database is unreachable so server.js can fail fast.
 *
 * @returns {Promise<void>}
 */
const testConnection = async () => {
    const client = await pool.connect();
    try {
        await client.query('SELECT NOW()');
        console.log('[db] PostgreSQL connection pool established successfully.');
    } finally {
        // Always release the client back to the pool, even if the query throws.
        client.release();
    }
};

// Propagate unexpected pool errors to the console rather than crashing silently.
pool.on('error', (err) => {
    console.error('[db] Unexpected PostgreSQL pool error:', err.message);
    process.exit(1);
});

module.exports = { pool, testConnection };
