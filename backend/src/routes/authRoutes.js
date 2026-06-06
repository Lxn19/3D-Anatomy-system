// =============================================================================
// src/routes/authRoutes.js
// Authentication Router — /api/auth
//
// Endpoints:
//   POST /api/auth/register  — create a new user account
//   POST /api/auth/login     — authenticate, receive access + refresh tokens
//   POST /api/auth/refresh   — exchange a valid refresh token for a new access token
//   POST /api/auth/logout    — revoke the current refresh token
//   GET  /api/auth/me        — return the current user's profile (protected)
//
// Token strategy:
//   Access token  — short-lived JWT (15 min), signed with JWT_SECRET.
//                   Sent in Authorization: Bearer <token> header.
//   Refresh token — long-lived random token (30 days), SHA-256 hash stored in DB.
//                   Used only at POST /api/auth/refresh to obtain a new access token.
//                   Immediately revocable by deleting the DB row (logout).
// =============================================================================

const express  = require('express');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');    // Built-in Node.js module — no install needed.
const jwt      = require('jsonwebtoken');
const { pool } = require('../config/db');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// =============================================================================
// Token Helpers
// =============================================================================

/**
 * Signs a short-lived JWT access token (15 minutes).
 * Payload: { user_id, username, email }
 *
 * @param {{ user_id: number, username: string, email: string }} user
 * @returns {string} Signed JWT.
 */
const signAccessToken = (user) =>
    jwt.sign(
        { user_id: user.user_id, username: user.username, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '15m' }   // Short-lived: forces rotation every 15 minutes.
    );

/**
 * Generates a cryptographically random 40-byte refresh token (80 hex chars).
 * The raw value is returned to the client; only its hash is stored in the DB.
 *
 * @returns {string} Raw refresh token (hex string).
 */
const generateRefreshToken = () => crypto.randomBytes(40).toString('hex');

/**
 * Hashes a raw refresh token with SHA-256 for secure database storage.
 * If the database is ever compromised, raw tokens cannot be reconstructed.
 *
 * @param {string} rawToken - The raw refresh token received from the client.
 * @returns {string} SHA-256 hex digest.
 */
const hashToken = (rawToken) =>
    crypto.createHash('sha256').update(rawToken).digest('hex');

/**
 * Stores a hashed refresh token in the refresh_tokens table.
 * Expires 30 days from now.
 *
 * @param {number} userId     - The user's user_id.
 * @param {string} rawToken   - The raw (unhashed) refresh token.
 * @returns {Promise<void>}
 */
const storeRefreshToken = async (userId, rawToken) => {
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now.

    await pool.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [userId, tokenHash, expiresAt]
    );
};

// =============================================================================
// POST /api/auth/register
// =============================================================================

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user with a hashed password.
 *          Returns both an access token (15 min) and a refresh token (30 days).
 * @access  Public
 *
 * Request body:
 *   { username: string, email: string, password: string }
 *
 * Response (201):
 *   { success: true, accessToken: string, refreshToken: string,
 *     user: { user_id, username, email, avatar_url } }
 */
router.post('/register', async (req, res) => {
    const { username, email, password } = req.body;

    // --- Input Validation ---
    if (!username || !email || !password) {
        return res.status(400).json({
            success: false,
            message: 'username, email, and password are all required.',
        });
    }

    // Minimum length guard.
    if (password.length < 8) {
        return res.status(400).json({
            success: false,
            message: 'Password must be at least 8 characters long.',
        });
    }

    // [FIX] Maximum length guard — bcrypt silently truncates passwords over
    // 72 bytes, meaning "aaaaaaa...73chars" and "aaaaaaa...73chars + anything"
    // produce identical hashes. Rejecting > 72 bytes prevents this footgun.
    if (Buffer.byteLength(password, 'utf8') > 72) {
        return res.status(400).json({
            success: false,
            message: 'Password must be 72 characters or fewer.',
        });
    }

    try {
        // Check for duplicate username or email in one query.
        const existing = await pool.query(
            'SELECT user_id FROM users WHERE email = $1 OR username = $2',
            [email.toLowerCase(), username]
        );

        if (existing.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'A user with that email or username already exists.',
            });
        }

        // Hash the password with a cost factor of 12.
        const password_hash = await bcrypt.hash(password, 12);

        // Insert the new user and return the created row.
        const result = await pool.query(
            `INSERT INTO users (username, email, password_hash)
             VALUES ($1, $2, $3)
             RETURNING user_id, username, email, avatar_url`,
            [username, email.toLowerCase(), password_hash]
        );

        const newUser = result.rows[0];

        // Issue tokens.
        const accessToken  = signAccessToken(newUser);
        const refreshToken = generateRefreshToken();
        await storeRefreshToken(newUser.user_id, refreshToken);

        return res.status(201).json({
            success: true,
            accessToken,
            refreshToken,   // Client should store this securely (httpOnly cookie recommended).
            user: {
                user_id:    newUser.user_id,
                username:   newUser.username,
                email:      newUser.email,
                avatar_url: newUser.avatar_url,
            },
        });
    } catch (error) {
        console.error('[authRoutes] /register error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Server error during registration. Please try again.',
        });
    }
});

// =============================================================================
// POST /api/auth/login
// =============================================================================

/**
 * @route   POST /api/auth/login
 * @desc    Validate credentials and return access + refresh tokens.
 * @access  Public
 *
 * Request body:
 *   { email: string, password: string }
 *
 * Response (200):
 *   { success: true, accessToken: string, refreshToken: string,
 *     user: { user_id, username, email, avatar_url } }
 */
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            success: false,
            message: 'Email and password are required.',
        });
    }

    try {
        // Retrieve the user by email.
        const result = await pool.query(
            'SELECT user_id, username, email, avatar_url, password_hash FROM users WHERE email = $1',
            [email.toLowerCase()]
        );

        const user = result.rows[0];

        // Timing-safe comparison — always runs bcrypt.compare regardless of
        // whether the email exists, so response time is identical for wrong
        // email vs wrong password. Prevents user enumeration via timing.
        const passwordMatch = user
            ? await bcrypt.compare(password, user.password_hash)
            : await bcrypt.compare(password, '$2b$12$invalidhashtopreventtimingattack');

        if (!user || !passwordMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password.',
            });
        }

        // Issue tokens.
        const accessToken  = signAccessToken(user);
        const refreshToken = generateRefreshToken();
        await storeRefreshToken(user.user_id, refreshToken);

        return res.status(200).json({
            success: true,
            accessToken,
            refreshToken,
            user: {
                user_id:    user.user_id,
                username:   user.username,
                email:      user.email,
                avatar_url: user.avatar_url,
            },
        });
    } catch (error) {
        console.error('[authRoutes] /login error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Server error during login. Please try again.',
        });
    }
});

// =============================================================================
// POST /api/auth/refresh                                               [NEW]
// =============================================================================

/**
 * @route   POST /api/auth/refresh
 * @desc    Exchange a valid, unexpired refresh token for a new access token.
 *          The refresh token itself is NOT rotated here (stateless rotation
 *          would require the client to update its stored token on every call).
 *          To force full re-authentication, call /logout first.
 * @access  Public (the refresh token IS the credential)
 *
 * Request body:
 *   { refreshToken: string }
 *
 * Response (200):
 *   { success: true, accessToken: string }
 *
 * Response (401):
 *   Token not found, expired, or already revoked.
 */
router.post('/refresh', async (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
        return res.status(400).json({
            success: false,
            message: 'refreshToken is required.',
        });
    }

    try {
        const tokenHash = hashToken(refreshToken);

        // Look up the hashed token. JOIN users to get the payload fields
        // needed to sign a new access token without a second query.
        const result = await pool.query(
            `SELECT
                 rt.token_id,
                 rt.expires_at,
                 u.user_id,
                 u.username,
                 u.email
             FROM  refresh_tokens rt
             JOIN  users          u  ON u.user_id = rt.user_id
             WHERE rt.token_hash = $1`,
            [tokenHash]
        );

        const record = result.rows[0];

        // Token not found — either it was never issued, or it was revoked via logout.
        if (!record) {
            return res.status(401).json({
                success: false,
                message: 'Refresh token is invalid or has been revoked.',
            });
        }

        // Token found but it has passed its expiry date.
        if (new Date(record.expires_at) < new Date()) {
            // Clean up the stale row.
            await pool.query('DELETE FROM refresh_tokens WHERE token_id = $1', [record.token_id]);
            return res.status(401).json({
                success: false,
                message: 'Refresh token has expired. Please log in again.',
            });
        }

        // Issue a new short-lived access token.
        const accessToken = signAccessToken({
            user_id:  record.user_id,
            username: record.username,
            email:    record.email,
        });

        return res.status(200).json({ success: true, accessToken });

    } catch (error) {
        console.error('[authRoutes] /refresh error:', error.message);
        return res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// =============================================================================
// POST /api/auth/logout                                                [NEW]
// =============================================================================

/**
 * @route   POST /api/auth/logout
 * @desc    Revoke the provided refresh token by deleting its DB row.
 *          After this call, the token cannot be used at /refresh.
 *          The short-lived access token (15 min) remains valid until it
 *          naturally expires — this is an accepted trade-off for stateless JWTs.
 *          To also invalidate the access token immediately, you would need a
 *          server-side token blacklist (Redis is the standard solution).
 * @access  Public (the refresh token IS the credential)
 *
 * Request body:
 *   { refreshToken: string }
 *
 * Response (200):
 *   { success: true, message: 'Logged out successfully.' }
 */
router.post('/logout', async (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
        return res.status(400).json({
            success: false,
            message: 'refreshToken is required.',
        });
    }

    try {
        const tokenHash = hashToken(refreshToken);

        // Delete the token row. Even if it doesn't exist (already logged out),
        // we return 200 — idempotent logout is the correct behaviour.
        await pool.query(
            'DELETE FROM refresh_tokens WHERE token_hash = $1',
            [tokenHash]
        );

        return res.status(200).json({ success: true, message: 'Logged out successfully.' });

    } catch (error) {
        console.error('[authRoutes] /logout error:', error.message);
        return res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// =============================================================================
// GET /api/auth/me
// =============================================================================

/**
 * @route   GET /api/auth/me
 * @desc    Return the currently authenticated user's profile.
 * @access  Protected (requires valid access token in Authorization: Bearer header)
 */
router.get('/me', verifyToken, async (req, res) => {
    try {
        // req.user.user_id is decoded from the access token by verifyToken.
        const result = await pool.query(
            'SELECT user_id, username, email, avatar_url, created_at FROM users WHERE user_id = $1',
            [req.user.user_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        return res.status(200).json({ success: true, user: result.rows[0] });
    } catch (error) {
        console.error('[authRoutes] /me error:', error.message);
        return res.status(500).json({ success: false, message: 'Server error.' });
    }
});

module.exports = router;
