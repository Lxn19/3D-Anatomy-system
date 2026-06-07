// =============================================================================
// src/routes/quizRoutes.js
// Quiz Router — /api/quiz
//
// INTEGRATION NOTE (Member 2 + Member 3):
//   Member 2's quizController uses its own pool instance via process.env.DATABASE_URL.
//   FIX: Updated to import from Member 3's shared db.js for a single pool.
//
//   Member 3's integration test (integrationTest.js) calls:
//     POST /api/quiz/submit   { userId, answers, timeTaken }
//   But Member 2's quizController exposes:
//     POST /api/quiz/session/start  then  POST /api/quiz/session/:id/answer
//   These are different APIs. We add a /submit convenience route here that
//   wraps the session start+answer flow for the integration test to pass.
//   The full session-based API is preserved for the React QuizApp.jsx.
// =============================================================================

const express = require('express');
const router  = express.Router();
const {
    getQuestions,
    startSession,
    submitAnswer,
    finishSession,
    getSessionResults,
    getUserProgress,
} = require('./quizController');
const { verifyToken } = require('../middleware/auth');
const { pool }        = require('../config/db');

// ---- Session-based API (used by React QuizApp.jsx) -------------------------

router.get('/questions',              getQuestions);
router.post('/session/start',         verifyToken, startSession);
router.post('/session/:id/answer',    verifyToken, submitAnswer);
router.post('/session/:id/finish',    verifyToken, finishSession);
router.get('/session/:id/results',    verifyToken, getSessionResults);
router.get('/progress/:userId',       verifyToken, getUserProgress);

// ---- /submit convenience route (used by integrationTest.js) ----------------

/**
 * @route   POST /api/quiz/submit
 * @desc    Batch-submit all answers for a quiz attempt in one call.
 *          Wraps the session start → answer → finish flow for the
 *          integration test and any simple client that doesn't want
 *          to manage session IDs.
 *
 * Body:
 *   { userId: number, answers: [{ questionId, selectedIndex }], timeTaken: number }
 *
 * Response:
 *   { score, total, percentage, breakdown }
 */
router.post('/submit', verifyToken, async (req, res) => {
    try {
        const { answers = [], timeTaken = 0 } = req.body;
        // FIX: use req.user.user_id from JWT rather than trusting body.userId
        const userId = req.user.user_id;

        if (!answers.length)
            return res.status(400).json({ error: 'answers array is required.' });

        const questionIds = answers.map((a) => a.questionId);

        // Create session
        const sessionRes = await pool.query(
            `INSERT INTO quiz_sessions (user_id, total) VALUES ($1, $2) RETURNING id`,
            [userId, questionIds.length]
        );
        const sessionId = sessionRes.rows[0].id;

        // Score each answer
        let score = 0;
        const systemMap = {};

        for (const { questionId, selectedIndex } of answers) {
            // Map selectedIndex (0-3) to letter ('A'-'D')
            const letter = ['A', 'B', 'C', 'D'][selectedIndex] || 'A';

            const qRes = await pool.query(
                `SELECT correct_answer, explanation, system_category
                 FROM   questions WHERE id = $1`,
                [questionId]
            );
            if (!qRes.rows.length) continue;

            const { correct_answer, system_category } = qRes.rows[0];
            const isCorrect = letter === correct_answer;
            if (isCorrect) score++;

            await pool.query(
                `INSERT INTO session_answers
                     (session_id, question_id, user_answer, is_correct, time_taken_ms)
                 VALUES ($1, $2, $3, $4, $5)`,
                [sessionId, questionId, letter, isCorrect, 0]
            );

            // Build per-system breakdown
            if (!systemMap[system_category])
                systemMap[system_category] = { total: 0, correct: 0 };
            systemMap[system_category].total++;
            if (isCorrect) systemMap[system_category].correct++;
        }

        const total      = questionIds.length;
        const percentage = total > 0
            ? parseFloat(((score / total) * 100).toFixed(2))
            : 0;

        // Finalize session
        await pool.query(
            `UPDATE quiz_sessions
             SET finished_at      = NOW(),
                 duration_seconds = $1,
                 percentage       = $2,
                 passed           = (score::NUMERIC / total) >= 0.6,
                 score            = $3
             WHERE id = $4`,
            [Math.round(timeTaken), percentage, score, sessionId]
        );

        const breakdown = Object.entries(systemMap).map(([system, stats]) => ({
            system,
            total:   stats.total,
            correct: stats.correct,
            accuracy: parseFloat(((stats.correct / stats.total) * 100).toFixed(2)),
        }));

        return res.json({ score, total, percentage, breakdown });

    } catch (err) {
        console.error('[quizRoutes] /submit error:', err.message);
        return res.status(500).json({ error: 'Server error during quiz submission.' });
    }
});

// ---- /history/:userId (used by integrationTest.js) -------------------------

/**
 * @route   GET /api/quiz/history/:userId
 * @desc    Returns session history for a user (alias for GET /progress/:userId).
 */
router.get('/history/:userId', verifyToken, async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, score, total, percentage, passed, started_at, duration_seconds
             FROM   quiz_sessions
             WHERE  user_id = $1
             ORDER  BY started_at DESC`,
            [req.params.userId]
        );
        return res.json({ history: rows });
    } catch (err) {
        console.error('[quizRoutes] /history error:', err.message);
        return res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router;
