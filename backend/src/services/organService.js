// =============================================================================
// src/services/organService.js
// Organ Service Layer — all database query logic for organ operations.
//
// By keeping SQL here (not in the route handler), the route file stays thin
// and this logic can be unit-tested independently of Express.
//
// Exported functions:
//   searchOrgans(query, system, limit)  — ILIKE partial-match search
//   getOrganById(id)                    — fetch a single organ by primary key
//   getAllSystems()                      — list distinct system names
// =============================================================================

const { pool } = require('../config/db');

/**
 * Searches organs by name and/or system using case-insensitive ILIKE.
 *
 * The `query` string is wrapped in `%` wildcards for partial matching,
 * so "fem" matches "Femur", "fem" matches "Left Femur", etc.
 *
 * Both `query` and `system` are optional — passing neither returns all organs
 * up to the specified limit.
 *
 * @param {string|undefined} query  - Partial organ name to match (optional).
 * @param {string|undefined} system - Exact system filter: 'Skeletal'|'Muscular'|'Nervous'|'Circulatory' (optional).
 * @param {number}           limit  - Maximum rows to return (default: 10, max enforced: 50).
 * @returns {Promise<Array>}          Array of matching organ rows.
 */
const searchOrgans = async (query, system, limit = 10) => {
    // Clamp the limit to prevent runaway queries.
    const safeLimit = Math.min(parseInt(limit, 10) || 10, 50);

    // We build the WHERE clause dynamically depending on which filters were supplied.
    const conditions = [];
    const params     = [];
    let   paramIndex = 1;  // $1, $2, ... positional parameter counter.

    if (query && query.trim()) {
        // ILIKE is PostgreSQL's case-insensitive LIKE.
        // The % wildcards allow matching anywhere in the organ name.
        conditions.push(`name ILIKE $${paramIndex}`);
        params.push(`%${query.trim()}%`);
        paramIndex++;
    }

    if (system && system.trim()) {
        // Exact (but case-insensitive) system filter.
        conditions.push(`system ILIKE $${paramIndex}`);
        params.push(system.trim());
        paramIndex++;
    }

    // Add the LIMIT parameter last.
    params.push(safeLimit);
    const limitParam = `$${paramIndex}`;

    const whereClause = conditions.length > 0
        ? `WHERE ${conditions.join(' AND ')}`
        : '';

    const sql = `
        SELECT
            organ_id,
            name,
            system,
            description,
            fact,
            unity_ref
        FROM  organs
        ${whereClause}
        ORDER BY name ASC
        LIMIT ${limitParam}
    `;

    const result = await pool.query(sql, params);
    return result.rows;
};

/**
 * Fetches a single organ by its primary key (organ_id).
 * Returns null if no organ with the given organ_id exists.
 *
 * @param {number|string} organId - The organ's database organ_id.
 * @returns {Promise<Object|null>}
 */
const getOrganById = async (organId) => {
    const result = await pool.query(
        `SELECT
             organ_id,
             name,
             system,
             description,
             fact,
             unity_ref
         FROM  organs
         WHERE organ_id = $1`,
        [organId]
    );

    return result.rows[0] ?? null;
};

/**
 * Returns the list of distinct anatomical system names present in the database.
 * Useful for populating filter dropdowns in the frontend.
 *
 * @returns {Promise<string[]>} Array of system name strings.
 */
const getAllSystems = async () => {
    const result = await pool.query(
        'SELECT DISTINCT system FROM organs ORDER BY system ASC'
    );
    return result.rows.map((row) => row.system);
};

module.exports = { searchOrgans, getOrganById, getAllSystems };
