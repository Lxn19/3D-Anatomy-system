// =============================================================================
// src/routes/userRoutes.js
// User Router — /api/users
//
// All routes are PROTECTED — they require a valid JWT access token in the
// Authorization: Bearer <token> header. The verifyToken middleware (auth.js)
// populates req.user = { user_id, username, email } from the token payload.
//
// Endpoints (all scoped to the authenticated user — no user can read or
// modify another user's data):
//
//   GET  /api/users/profile       — fetch the current user's profile
//   PUT  /api/users/profile       — update username and/or avatar_url
//   GET  /api/users/progress      — fetch quiz attempt history + summary stats
//   POST /api/users/progress      — record a new quiz answer (server-side scoring)
//
// Consumers:
//   Member 2 (Quiz Module)   — POST /progress to save answers,
//                              GET  /progress to display results & history.
//   Member 4 (AI Assistant)  — GET  /progress to read learning context,
//                              GET  /profile  to personalise AI responses.
// =============================================================================

const express = require('express');
const { verifyToken } = require('../middleware/auth');
const {
    getUserProfile,
    updateUserProfile,
    getUserProgress,
    recordQuizAnswer,
} = require('../services/userService');

const router = express.Router();

// All routes in this file require authentication.
// Applying verifyToken to the router instance protects every endpoint below.
router.use(verifyToken);

// =============================================================================
// GET /api/users/profile
// =============================================================================

/**
 * @route   GET /api/users/profile
 * @desc    Return the current user's public profile.
 *          Excludes password_hash — that field never leaves the service layer.
 * @access  Protected
 *
 * Response (200):
 * {
 *   success: true,
 *   user: {
 *     user_id:    number,
 *     username:   string,
 *     email:      string,
 *     avatar_url: string | null,
 *     created_at: string (ISO 8601),
 *     updated_at: string (ISO 8601)
 *   }
 * }
 */
router.get('/profile', async (req, res) => {
    try {
        const user = await getUserProfile(req.user.user_id);

        if (!user) {
            // This case should be rare: it means the token is valid but the
            // DB row was deleted after the token was issued.
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        return res.status(200).json({ success: true, user });
    } catch (error) {
        console.error('[userRoutes] GET /profile error:', error.message);
        return res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// =============================================================================
// PUT /api/users/profile
// =============================================================================

/**
 * @route   PUT /api/users/profile
 * @desc    Update the current user's username and/or avatar_url.
 *          Email and password changes are NOT handled here — those require
 *          separate, security-sensitive verification flows.
 * @access  Protected
 *
 * Request body (at least one field required):
 * {
 *   username:   string   (optional, 3–50 characters, alphanumeric + underscore)
 *   avatar_url: string   (optional, must be a valid URL)
 * }
 *
 * Response (200):
 * {
 *   success: true,
 *   user: { user_id, username, email, avatar_url, updated_at }
 * }
 *
 * Response (409):
 *   If the new username is already taken by another user.
 */
router.put('/profile', async (req, res) => {
    const { username, avatar_url } = req.body;

    // --- Validation ---

    // At least one field must be provided.
    if (username === undefined && avatar_url === undefined) {
        return res.status(400).json({
            success: false,
            message: 'Provide at least one field to update: username or avatar_url.',
        });
    }

    // Validate username format if provided.
    if (username !== undefined) {
        const trimmed = username.trim();
        if (trimmed.length < 3 || trimmed.length > 50) {
            return res.status(400).json({
                success: false,
                message: 'username must be between 3 and 50 characters.',
            });
        }
        // Allow letters, numbers, underscores, and hyphens only.
        if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
            return res.status(400).json({
                success: false,
                message: 'username may only contain letters, numbers, underscores, and hyphens.',
            });
        }
    }

    // Validate avatar_url format if provided (must be a URL or empty string to clear it).
    if (avatar_url !== undefined && avatar_url.trim() !== '') {
        try {
            new URL(avatar_url.trim());
        } catch {
            return res.status(400).json({
                success: false,
                message: 'avatar_url must be a valid URL.',
            });
        }
    }

    try {
        const updatedUser = await updateUserProfile(req.user.user_id, { username, avatar_url });

        if (!updatedUser) {
            // updateUserProfile returns null when no valid fields are provided.
            // Should not reach here given validation above, but guard defensively.
            return res.status(400).json({ success: false, message: 'No valid fields to update.' });
        }

        return res.status(200).json({ success: true, user: updatedUser });

    } catch (error) {
        // PostgreSQL unique violation code: '23505' — username already taken.
        if (error.code === '23505') {
            return res.status(409).json({
                success: false,
                message: 'That username is already taken. Please choose another.',
            });
        }

        console.error('[userRoutes] PUT /profile error:', error.message);
        return res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// =============================================================================
// GET /api/users/progress
// =============================================================================

/**
 * @route   GET /api/users/progress
 * @desc    Return the current user's complete quiz attempt history,
 *          enriched with question and organ metadata.
 *
 *          Designed to serve two consumers:
 *            Member 2 (Quiz Module) — uses `attempts` array for result screens.
 *            Member 4 (AI Assistant) — uses `summary.by_system` to personalise
 *              responses (e.g. "You're weakest in Nervous — let me explain...").
 *
 * @access  Protected
 *
 * Response (200):
 * {
 *   success: true,
 *   summary: {
 *     total_attempted: number,
 *     total_correct:   number,
 *     accuracy_pct:    number,   // e.g. 72.50
 *     by_system: {
 *       Skeletal:    { attempted: number, correct: number, accuracy: number },
 *       Muscular:    { ... },
 *       Nervous:     { ... },
 *       Circulatory: { ... }
 *     }
 *   },
 *   attempts: [
 *     {
 *       progress_id:      number,
 *       quiz_question_id: number,
 *       selected_answer:  'A'|'B'|'C'|'D',
 *       is_correct:       boolean,
 *       attempted_at:     string (ISO 8601),
 *       question_text:    string,
 *       correct_answer:   'A'|'B'|'C'|'D',
 *       difficulty:       'easy'|'medium'|'hard',
 *       organ_id:         number,
 *       organ_name:       string,
 *       organ_system:     string
 *     },
 *     ...
 *   ]
 * }
 */
router.get('/progress', async (req, res) => {
    try {
        const data = await getUserProgress(req.user.user_id);

        return res.status(200).json({
            success: true,
            summary:  data.summary,
            attempts: data.attempts,
        });
    } catch (error) {
        console.error('[userRoutes] GET /progress error:', error.message);
        return res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// =============================================================================
// POST /api/users/progress
// =============================================================================

/**
 * @route   POST /api/users/progress
 * @desc    Record a single quiz attempt.
 *
 *          SECURITY: The client sends only quiz_question_id and selected_answer.
 *          is_correct is COMPUTED SERVER-SIDE by looking up correct_answer in
 *          quiz_questions — the client never controls is_correct, preventing
 *          users from submitting forged "all correct" payloads.
 *
 * @access  Protected
 *
 * Request body:
 * {
 *   quiz_question_id: number,           — must exist in quiz_questions table
 *   selected_answer:  'A'|'B'|'C'|'D'  — the answer the user chose
 * }
 *
 * Response (201):
 * {
 *   success:    true,
 *   is_correct: boolean,   — immediate feedback for the quiz UI
 *   attempt: {
 *     progress_id:      number,
 *     user_id:          number,
 *     quiz_question_id: number,
 *     selected_answer:  string,
 *     is_correct:       boolean,
 *     attempted_at:     string (ISO 8601)
 *   }
 * }
 *
 * Response (404):
 *   If quiz_question_id does not exist.
 */
router.post('/progress', async (req, res) => {
    const { quiz_question_id, selected_answer } = req.body;

    // --- Validation ---

    if (!quiz_question_id || !selected_answer) {
        return res.status(400).json({
            success: false,
            message: 'quiz_question_id and selected_answer are required.',
        });
    }

    // quiz_question_id must be a positive integer.
    const questionId = parseInt(quiz_question_id, 10);
    if (!Number.isInteger(questionId) || questionId < 1) {
        return res.status(400).json({
            success: false,
            message: 'quiz_question_id must be a positive integer.',
        });
    }

    // selected_answer must be exactly one of the four valid option letters.
    const VALID_ANSWERS = ['A', 'B', 'C', 'D'];
    const answer = String(selected_answer).trim().toUpperCase();
    if (!VALID_ANSWERS.includes(answer)) {
        return res.status(400).json({
            success: false,
            message: `selected_answer must be one of: ${VALID_ANSWERS.join(', ')}.`,
        });
    }

    try {
        const attempt = await recordQuizAnswer(req.user.user_id, questionId, answer);

        return res.status(201).json({
            success:    true,
            is_correct: attempt.is_correct,  // Convenience field for the quiz UI.
            attempt,
        });

    } catch (error) {
        // recordQuizAnswer throws a 404 error if the question doesn't exist.
        if (error.status === 404) {
            return res.status(404).json({ success: false, message: error.message });
        }

        console.error('[userRoutes] POST /progress error:', error.message);
        return res.status(500).json({ success: false, message: 'Server error.' });
    }
});

module.exports = router;
