// =============================================================================
// src/routes/quizController.js
// Quiz Business Logic
//
// FIX (Member 2): Original used `new Pool({ connectionString: ... })` directly.
// Updated to import from Member 3's shared db.js so the entire backend uses
// one connection pool, avoiding connection exhaustion under load.
// =============================================================================

const { pool } = require('../config/db');    // FIX: was new Pool({...}) inline

// ---------------------------------------------------------------------------
// GET /api/quiz/questions
// ---------------------------------------------------------------------------

const getQuestions = async (req, res) => {
    try {
        const { count = 10, category, type } = req.query;

        let query = `
            SELECT q.*,
                   json_agg(
                       json_build_object('label', qo.option_label, 'text', qo.option_text)
                       ORDER BY qo.option_label
                   ) AS options
            FROM   questions q
            LEFT   JOIN question_options qo ON qo.question_id = q.id
            WHERE  1=1
        `;

        const params = [];

        if (category) {
            params.push(category);
            query += ` AND q.system_category = $${params.length}`;
        }
        if (type) {
            params.push(type);
            query += ` AND q.question_type = $${params.length}`;
        }

        // Add organ_id to result so integration test can cross-check unity_object_name
        query += ` GROUP BY q.id ORDER BY RANDOM() LIMIT $${params.length + 1}`;
        params.push(parseInt(count));

        const result = await pool.query(query, params);
        res.json({ questions: result.rows });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ---------------------------------------------------------------------------
// POST /api/quiz/session/start
// ---------------------------------------------------------------------------

const startSession = async (req, res) => {
    try {
        // FIX: use req.user.user_id from JWT rather than trusting body.userId
        const userId      = req.user.user_id;
        const { questionIds } = req.body;

        const result = await pool.query(
            `INSERT INTO quiz_sessions (user_id, total) VALUES ($1, $2) RETURNING id`,
            [userId, questionIds.length]
        );

        res.json({ sessionId: result.rows[0].id });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ---------------------------------------------------------------------------
// POST /api/quiz/session/:id/answer
// ---------------------------------------------------------------------------

const submitAnswer = async (req, res) => {
    try {
        const { id: sessionId }              = req.params;
        const { questionId, userAnswer, timeTakenMs } = req.body;

        const qResult = await pool.query(
            `SELECT correct_answer, explanation FROM questions WHERE id = $1`,
            [questionId]
        );

        if (qResult.rows.length === 0)
            return res.status(404).json({ error: 'Question not found' });

        const { correct_answer, explanation } = qResult.rows[0];
        const isCorrect = userAnswer?.trim().toUpperCase() === correct_answer.trim().toUpperCase();

        await pool.query(
            `INSERT INTO session_answers
                 (session_id, question_id, user_answer, is_correct, time_taken_ms)
             VALUES ($1, $2, $3, $4, $5)`,
            [sessionId, questionId, userAnswer, isCorrect, timeTakenMs]
        );

        if (isCorrect) {
            await pool.query(
                `UPDATE quiz_sessions SET score = score + 1 WHERE id = $1`,
                [sessionId]
            );
        }

        res.json({ isCorrect, correctAnswer: correct_answer, explanation });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ---------------------------------------------------------------------------
// POST /api/quiz/session/:id/finish
// ---------------------------------------------------------------------------

const finishSession = async (req, res) => {
    try {
        const { id: sessionId }  = req.params;
        const { durationSeconds } = req.body;

        const result = await pool.query(
            `UPDATE quiz_sessions
             SET  finished_at      = NOW(),
                  duration_seconds = $1,
                  percentage       = ROUND((score::NUMERIC / total) * 100, 2),
                  passed           = (score::NUMERIC / total) >= 0.6
             WHERE id = $2
             RETURNING *`,
            [durationSeconds, sessionId]
        );

        res.json({ session: result.rows[0] });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ---------------------------------------------------------------------------
// GET /api/quiz/session/:id/results
// ---------------------------------------------------------------------------

const getSessionResults = async (req, res) => {
    try {
        const { id: sessionId } = req.params;

        const sessionRes = await pool.query(
            `SELECT * FROM quiz_sessions WHERE id = $1`,
            [sessionId]
        );

        const answersRes = await pool.query(
            `SELECT sa.*,
                    q.question_text, q.question_type, q.correct_answer,
                    q.explanation,   q.system_category, q.organ_ref,
                    json_agg(json_build_object(
                        'label', qo.option_label, 'text', qo.option_text
                    ) ORDER BY qo.option_label) AS options
             FROM   session_answers   sa
             JOIN   questions          q  ON q.id = sa.question_id
             LEFT   JOIN question_options qo ON qo.question_id = q.id
             WHERE  sa.session_id = $1
             GROUP  BY sa.id, q.id
             ORDER  BY sa.id`,
            [sessionId]
        );

        res.json({ session: sessionRes.rows[0], answers: answersRes.rows });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ---------------------------------------------------------------------------
// GET /api/quiz/progress/:userId
// ---------------------------------------------------------------------------

const getUserProgress = async (req, res) => {
    try {
        const { userId } = req.params;

        const sessionsRes = await pool.query(
            `SELECT id, score, total, percentage, passed, started_at, duration_seconds
             FROM   quiz_sessions
             WHERE  user_id = $1
             ORDER  BY started_at ASC`,
            [userId]
        );

        const systemRes = await pool.query(
            `SELECT q.system_category,
                    COUNT(*) AS total_answers,
                    SUM(CASE WHEN sa.is_correct THEN 1 ELSE 0 END) AS correct_answers,
                    ROUND(AVG(CASE WHEN sa.is_correct THEN 100.0 ELSE 0.0 END), 1) AS accuracy_pct
             FROM   session_answers sa
             JOIN   quiz_sessions    qs ON qs.id     = sa.session_id
             JOIN   questions        q  ON q.id      = sa.question_id
             WHERE  qs.user_id = $1
             GROUP  BY q.system_category`,
            [userId]
        );

        const sessions  = sessionsRes.rows;
        const avgScore  = sessions.length
            ? (sessions.reduce((a, s) => a + parseFloat(s.percentage), 0) / sessions.length).toFixed(2)
            : 0;
        const bestScore = sessions.length
            ? Math.max(...sessions.map((s) => parseFloat(s.percentage)))
            : 0;

        res.json({
            totalSessions:  sessions.length,
            averageScore:   avgScore,
            bestScore,
            sessions,
            systemBreakdown: systemRes.rows,
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = {
    getQuestions,
    startSession,
    submitAnswer,
    finishSession,
    getSessionResults,
    getUserProgress,
};
