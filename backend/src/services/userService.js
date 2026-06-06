// =============================================================================
// src/services/userService.js
// User Service Layer — all database query logic for user profile and progress.
//
// Keeping SQL here (not in route handlers) keeps routes thin and lets each
// function be unit-tested independently of Express.
//
// Exported functions:
//   getUserProfile(userId)                           — fetch public profile fields
//   updateUserProfile(userId, fields)                — partial UPDATE for username/avatar_url
//   getUserProgress(userId)                          — full attempt history + summary stats
//   recordQuizAnswer(userId, questionId, answer)     — insert one attempt row
//
// Schema columns referenced (exact names from schema.sql):
//   users:         user_id, username, email, avatar_url, created_at, updated_at
//   user_progress: progress_id, user_id, quiz_question_id, selected_answer,
//                  is_correct, attempted_at
//   quiz_questions: question_id, question_text, correct_answer, difficulty, organ_id
//   organs:         organ_id, name, system
// =============================================================================

const { pool } = require('../config/db');

// ---------------------------------------------------------------------------
// getUserProfile
// ---------------------------------------------------------------------------

/**
 * Fetches the public profile fields for a single user.
 * Excludes password_hash — that column must never leave the service layer.
 *
 * @param {number} userId - The authenticated user's user_id (from JWT payload).
 * @returns {Promise<Object|null>} User row, or null if not found.
 */
const getUserProfile = async (userId) => {
    const result = await pool.query(
        `SELECT
             user_id,
             username,
             email,
             avatar_url,
             created_at,
             updated_at
         FROM  users
         WHERE user_id = $1`,
        [userId]
    );

    return result.rows[0] ?? null;
};

// ---------------------------------------------------------------------------
// updateUserProfile
// ---------------------------------------------------------------------------

/**
 * Performs a partial UPDATE on the users table.
 * Only the fields that are explicitly provided in the `fields` object
 * are included in the SET clause — omitted fields are left unchanged.
 *
 * Supported fields: username, avatar_url.
 * Email and password changes are deliberately excluded (separate,
 * security-sensitive flows are required for those operations).
 *
 * The updated_at column is kept current by the PostgreSQL trigger
 * trigger_set_updated_at defined in schema.sql.
 *
 * @param {number} userId                               - Target user's user_id.
 * @param {{ username?: string, avatar_url?: string }}  fields - Fields to update.
 * @returns {Promise<Object|null>} Updated user row, or null if no fields supplied.
 */
const updateUserProfile = async (userId, fields) => {
    const setClauses = [];
    const params     = [];
    let   paramIndex = 1;

    // Build the SET clause dynamically so we never overwrite untouched columns.
    if (fields.username !== undefined) {
        setClauses.push(`username = $${paramIndex}`);
        params.push(fields.username.trim());
        paramIndex++;
    }

    if (fields.avatar_url !== undefined) {
        setClauses.push(`avatar_url = $${paramIndex}`);
        params.push(fields.avatar_url.trim());
        paramIndex++;
    }

    // Caller must validate that at least one field is provided before calling this.
    if (setClauses.length === 0) return null;

    params.push(userId);  // WHERE user_id = $N

    const result = await pool.query(
        `UPDATE users
         SET    ${setClauses.join(', ')}
         WHERE  user_id = $${paramIndex}
         RETURNING user_id, username, email, avatar_url, updated_at`,
        params
    );

    return result.rows[0] ?? null;
};

// ---------------------------------------------------------------------------
// getUserProgress
// ---------------------------------------------------------------------------

/**
 * Fetches the complete quiz attempt history for a user, enriched with
 * question and organ metadata. Also computes aggregate summary statistics.
 *
 * JOIN strategy:
 *   user_progress → quiz_questions (for question text + correct answer)
 *   quiz_questions → organs        (for organ name + anatomical system)
 *
 * Returns an object with two keys:
 *   summary  — aggregate stats (totals, accuracy, per-system breakdown)
 *   attempts — ordered list of every individual attempt row
 *
 * This structure is designed to satisfy both:
 *   Member 2 (Quiz Module) — needs individual attempt records for result screens.
 *   Member 4 (AI Assistant) — needs the summary/breakdown to personalise responses.
 *
 * @param {number} userId - The authenticated user's user_id.
 * @returns {Promise<{ summary: Object, attempts: Array }>}
 */
const getUserProgress = async (userId) => {
    // ---- 1. Individual attempt rows (most recent first) ----
    const attemptsResult = await pool.query(
        `SELECT
             up.progress_id,
             up.quiz_question_id,
             up.selected_answer,
             up.is_correct,
             up.attempted_at,
             qq.question_text,
             qq.correct_answer,
             qq.difficulty,
             o.organ_id,
             o.name        AS organ_name,
             o.system      AS organ_system
         FROM  user_progress   up
         JOIN  quiz_questions   qq  ON qq.question_id = up.quiz_question_id
         JOIN  organs           o   ON o.organ_id     = qq.organ_id
         WHERE up.user_id = $1
         ORDER BY up.attempted_at DESC`,
        [userId]
    );

    const attempts = attemptsResult.rows;

    // ---- 2. Overall summary stats ----
    const totalAttempted = attempts.length;
    const totalCorrect   = attempts.filter((a) => a.is_correct).length;
    const accuracyPct    = totalAttempted > 0
        ? parseFloat(((totalCorrect / totalAttempted) * 100).toFixed(2))
        : 0;

    // ---- 3. Per-system breakdown (useful for Member 4 AI context) ----
    //
    // Groups attempts by anatomical system and computes accuracy per system.
    // Example output:
    //   { Skeletal: { attempted: 10, correct: 7, accuracy: 70.00 }, ... }
    //
    const systemBreakdown = attempts.reduce((acc, attempt) => {
        const sys = attempt.organ_system;
        if (!acc[sys]) acc[sys] = { attempted: 0, correct: 0, accuracy: 0 };
        acc[sys].attempted++;
        if (attempt.is_correct) acc[sys].correct++;
        return acc;
    }, {});

    // Compute accuracy for each system after the reduce pass.
    for (const sys of Object.keys(systemBreakdown)) {
        const { attempted, correct } = systemBreakdown[sys];
        systemBreakdown[sys].accuracy = parseFloat(
            ((correct / attempted) * 100).toFixed(2)
        );
    }

    return {
        summary: {
            total_attempted: totalAttempted,
            total_correct:   totalCorrect,
            accuracy_pct:    accuracyPct,
            by_system:       systemBreakdown,
        },
        attempts,
    };
};

// ---------------------------------------------------------------------------
// recordQuizAnswer
// ---------------------------------------------------------------------------

/**
 * Inserts a single quiz attempt into user_progress.
 *
 * SECURITY: is_correct is computed SERVER-SIDE by fetching correct_answer
 * from quiz_questions. The client never sends is_correct — this prevents
 * users from manipulating their own scores by forging requests.
 *
 * @param {number} userId        - The authenticated user's user_id (from JWT).
 * @param {number} questionId    - The quiz_questions.question_id being answered.
 * @param {string} givenAnswer   - The answer the user selected ('A'|'B'|'C'|'D').
 * @returns {Promise<Object>}      The inserted progress row + isCorrect boolean.
 * @throws  {Error}               If questionId does not exist in quiz_questions.
 */
const recordQuizAnswer = async (userId, questionId, givenAnswer) => {
    // Step 1 — fetch the correct answer from the DB (server-side scoring).
    const questionResult = await pool.query(
        'SELECT correct_answer FROM quiz_questions WHERE question_id = $1',
        [questionId]
    );

    if (questionResult.rows.length === 0) {
        const err = new Error(`Question with question_id ${questionId} does not exist.`);
        err.status = 404;
        throw err;
    }

    const isCorrect = questionResult.rows[0].correct_answer === givenAnswer;

    // Step 2 — insert the attempt row.
    const insertResult = await pool.query(
        `INSERT INTO user_progress
             (user_id, quiz_question_id, selected_answer, is_correct)
         VALUES ($1, $2, $3, $4)
         RETURNING
             progress_id,
             user_id,
             quiz_question_id,
             selected_answer,
             is_correct,
             attempted_at`,
        [userId, questionId, givenAnswer, isCorrect]
    );

    return insertResult.rows[0];
};

module.exports = {
    getUserProfile,
    updateUserProfile,
    getUserProgress,
    recordQuizAnswer,
};
