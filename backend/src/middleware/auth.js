// =============================================================================
// src/middleware/auth.js
// JWT Authentication Middleware
//
// Protects Express routes by verifying the Bearer token attached to the
// Authorization header.
//
// Usage — protect a router:
//   const { verifyToken } = require('../middleware/auth');
//   router.get('/protected', verifyToken, handler);
//
// On success, injects req.user = { user_id, username, email } for downstream
// route handlers to use without hitting the database again.
// =============================================================================

const jwt = require('jsonwebtoken');

/**
 * Express middleware that validates a JWT Bearer token.
 *
 * Expected header format:
 *   Authorization: Bearer <token>
 *
 * On valid token  → calls next() and sets req.user to the decoded payload.
 * On missing/bad  → responds with 401 Unauthorized.
 * On expired      → responds with 401 with a specific message.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const verifyToken = (req, res, next) => {
    // -----------------------------------------------------------------
    // 1. Extract the token from the Authorization header.
    // -----------------------------------------------------------------
    const authHeader = req.headers['authorization'];

    // Header must be present and follow the "Bearer <token>" format.
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            message: 'Access denied. No token provided.',
        });
    }

    // Slice off the "Bearer " prefix (7 characters).
    const token = authHeader.slice(7);

    // -----------------------------------------------------------------
    // 2. Verify and decode the token.
    // -----------------------------------------------------------------
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Attach the decoded payload to the request object.
        // Downstream handlers access the current user via:
        //   req.user.user_id  — the user's database primary key
        //   req.user.username — the user's display name
        //   req.user.email    — the user's email address
        // No 'role' or 'id' field is present in the payload.
        req.user = decoded;

        next();
    } catch (error) {
        // jwt.verify throws a TokenExpiredError for expired tokens and
        // a JsonWebTokenError for malformed/invalid tokens.
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token has expired. Please log in again.',
            });
        }

        return res.status(401).json({
            success: false,
            message: 'Invalid token. Authentication failed.',
        });
    }
};

/**
 * Role-based authorization middleware factory.
 * Must be used AFTER verifyToken (which sets req.user).
 *
 * NOTE: Your current schema does not have a role column in the users table.
 * This factory is included for future use if you add a role column.
 * It checks req.user.role, which will be undefined until a role field is added.
 *
 * Usage:
 *   router.delete('/user/:id', verifyToken, requireRole('admin'), handler);
 *
 * @param  {...string} roles - Allowed role strings (e.g. 'admin', 'student').
 * @returns {import('express').RequestHandler}
 */
const requireRole = (...roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({
            success: false,
            message: 'Forbidden. You do not have permission to access this resource.',
        });
    }
    next();
};

module.exports = { verifyToken, requireRole };
