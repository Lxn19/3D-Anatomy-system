// =============================================================================
// src/routes/aiRoutes.js
// AI Chat Route — /api/ai
//
// FIX (Member 4):
//   1. Pool import updated to use Member 3's db.js: `const { pool } = require('../config/db')`
//   2. promptEngine import path corrected to `require('../promptEngine')`
//   3. chat_history INSERT updated — Member 4's original schema used `user_id`
//      but Member 3's JWT payload exposes `req.user.user_id` (not `req.user.id`).
//   4. Rate-limiting is applied in app.js; no per-file config needed here.
// =============================================================================

const express  = require('express');
const router   = express.Router();
const OpenAI   = require('openai');
const { verifyToken }  = require('../middleware/auth');     // Member 3's auth middleware
const { buildPrompt }  = require('../promptEngine');        // FIX: corrected path
const { pool }         = require('../config/db');           // FIX: was require('../db')

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---------------------------------------------------------------------------
// POST /api/ai/chat
// ---------------------------------------------------------------------------

/**
 * @route   POST /api/ai/chat
 * @desc    Send a message to the AI anatomy tutor.
 *          Streams the response via Server-Sent Events (SSE).
 * @access  Protected (requires valid JWT from Member 3's auth system)
 *
 * Body: { message: string, history: [{ role, content }] }
 */
router.post('/chat', verifyToken, async (req, res) => {
    const { message, history = [] } = req.body;

    if (!message || !message.trim())
        return res.status(400).json({ error: 'Message is required' });

    // Set SSE headers for streaming
    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.flushHeaders();

    try {
        const { systemPrompt, userMessage } = await buildPrompt(message.trim());

        const messages = [
            { role: 'system',  content: systemPrompt },
            ...history.slice(-10),   // keep last 10 turns for context window management
            { role: 'user',    content: userMessage },
        ];

        const stream = await openai.chat.completions.create({
            model:      'gpt-4o-mini',
            messages,
            max_tokens: 400,
            temperature: 0.5,
            stream:     true,
        });

        let fullResponse = '';

        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content || '';
            if (delta) {
                fullResponse += delta;
                res.write(`data: ${JSON.stringify({ delta })}\n\n`);
            }
        }

        // Save conversation to DB (async, non-blocking)
        // FIX: req.user.id → req.user.user_id (Member 3's JWT payload uses user_id)
        pool.query(
            `INSERT INTO chat_history (user_id, user_message, ai_response)
             VALUES ($1, $2, $3)`,
            [req.user.user_id, message.trim(), fullResponse]
        ).catch((err) => console.error('[aiRoutes] Failed to save chat history:', err));

        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();

    } catch (err) {
        console.error('[aiRoutes] OpenAI error:', err);
        res.write(`data: ${JSON.stringify({ error: 'AI service unavailable. Please try again.' })}\n\n`);
        res.end();
    }
});

// ---------------------------------------------------------------------------
// GET /api/ai/history
// ---------------------------------------------------------------------------

/**
 * @route   GET /api/ai/history
 * @desc    Returns last 20 chat exchanges for the current user.
 * @access  Protected
 */
router.get('/history', verifyToken, async (req, res) => {
    try {
        // FIX: req.user.id → req.user.user_id
        const { rows } = await pool.query(
            `SELECT id, user_message, ai_response, created_at
             FROM   chat_history
             WHERE  user_id = $1
             ORDER  BY created_at DESC
             LIMIT  20`,
            [req.user.user_id]
        );

        res.json({ history: rows.reverse() });

    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch chat history' });
    }
});

// ---------------------------------------------------------------------------
// Schema addition — add to schema.sql
// ---------------------------------------------------------------------------
//
// CREATE TABLE IF NOT EXISTS chat_history (
//     id           SERIAL PRIMARY KEY,
//     user_id      INT  NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
//     user_message TEXT NOT NULL,
//     ai_response  TEXT NOT NULL,
//     created_at   TIMESTAMP DEFAULT NOW()
// );
// CREATE INDEX idx_chat_user ON chat_history(user_id);

module.exports = router;
