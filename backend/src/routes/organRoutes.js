// =============================================================================
// src/routes/organRoutes.js
// Organ Router — /api/organs
//
// Endpoints:
//   GET /api/organs/search            — search organs by name/system
//   GET /api/organs/systems           — list all distinct system names
//   GET /api/organs/:id               — get a single organ by id (protected)
// =============================================================================

const express = require('express');
const { searchOrgans, getOrganById, getAllSystems } = require('../services/organService');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// IMPORTANT:
// Keep literal routes such as /search and /systems registered before /:id.
// Express matches routes in declaration order, so placing /:id first would make
// "search" or "systems" look like an organ id and break the public endpoints.

// ---------------------------------------------------------------------------
// GET /api/organs/search
// ---------------------------------------------------------------------------

/**
 * @route   GET /api/organs/search
 * @desc    Search organs by name (partial ILIKE) and/or system.
 *          This is the primary endpoint consumed by the React SearchBar
 *          and ultimately by Unity's SearchManager.FocusOnOrgan().
 * @access  Public (no auth required so the search bar works for guests)
 *
 * Query parameters:
 *   q      {string}  Partial organ name  (e.g. ?q=fem  → returns "Femur", "Left Femur")
 *   system {string}  Exact system filter  (e.g. ?system=Skeletal)
 *   limit  {number}  Max results (default 10, max 50)
 *
 * Response (200):
 *   { success: true, count: number, organs: Array<OrganRow> }
 *
 * Each OrganRow contains:
 *   organ_id, name, system, description, fact, unity_ref
 *
 * @property {string} unity_ref
 *   Stable Unity object reference for this organ. This should match the exact
 *   identifier Member 1 exposes from the Unity scene, such as a GameObject name,
 *   hierarchy path, or agreed SearchManager lookup key. Member 1 should keep
 *   these values synchronized with the Unity build. Member 4 should use this
 *   value when linking AI/search responses to the 3D scene instead of guessing
 *   from the display name, which may be renamed or localized.
 */
router.get('/search', async (req, res) => {
    const { q, system, limit } = req.query;

    try {
        const organs = await searchOrgans(q, system, limit);

        return res.status(200).json({
            success: true,
            count:   organs.length,
            organs,
        });
    } catch (error) {
        console.error('[organRoutes] /search error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Server error while searching organs.',
        });
    }
});

// ---------------------------------------------------------------------------
// GET /api/organs/systems
// ---------------------------------------------------------------------------

/**
 * @route   GET /api/organs/systems
 * @desc    Returns the distinct list of anatomical system names.
 *          Use this to populate filter dropdowns in the React UI.
 * @access  Public
 */
router.get('/systems', async (_req, res) => {
    try {
        const systems = await getAllSystems();
        return res.status(200).json({ success: true, systems });
    } catch (error) {
        console.error('[organRoutes] /systems error:', error.message);
        return res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ---------------------------------------------------------------------------
// GET /api/organs/:id
// ---------------------------------------------------------------------------

/**
 * @route   GET /api/organs/:id
 * @desc    Fetch the full data for a single organ by its organ_id.
 *          Protected — requires a valid JWT.
 * @access  Protected
 */
router.get('/:id', verifyToken, async (req, res) => {
    const { id } = req.params;

    // Basic guard: organ_id must be a positive integer.
    if (!Number.isInteger(Number(id)) || Number(id) < 1) {
        return res.status(400).json({ success: false, message: 'Invalid organ_id.' });
    }

    try {
        const organ = await getOrganById(id);

        if (!organ) {
            return res.status(404).json({ success: false, message: `Organ with organ_id ${id} not found.` });
        }

        return res.status(200).json({ success: true, organ });
    } catch (error) {
        console.error('[organRoutes] /:id error:', error.message);
        return res.status(500).json({ success: false, message: 'Server error.' });
    }
});

module.exports = router;
