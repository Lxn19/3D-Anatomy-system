// =============================================================================
// src/promptEngine.js
// Prompt Engineering Layer — enriches every user message with organ context
// before it is sent to OpenAI.
//
// FIX (Member 4): Original used `const pool = require('../db')` which points
// to the wrong path and imports the whole module object instead of the pool.
// Corrected to `const { pool } = require('./config/db')` to match the export
// in db.js and the correct relative path from this file's location.
// =============================================================================

const { pool } = require('./config/db');    // FIX: was require('../db')

// ---------------------------------------------------------------------------
// System prompt — constrains the AI to anatomy topics only.
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `
You are an expert AI anatomy tutor for a 3D Anatomy Learning System used by medical students.

RULES:
1. ONLY answer questions about human anatomy, physiology, and related medical topics.
2. If a question is off-topic, politely redirect the user back to anatomy.
3. Always be accurate, educational, and clear.
4. Use proper medical terminology but explain it simply.
5. When describing organ functions, reference their location, system, and clinical significance.
6. Keep answers concise (under 150 words) unless the user asks for detail.
7. If you are given ORGAN CONTEXT below, use it as your primary factual source.

FORMAT: Respond in plain conversational text. Do not use markdown headers.
`.trim();

// ---------------------------------------------------------------------------
// detectOrganInMessage
// ---------------------------------------------------------------------------

/**
 * Detects the first organ name mentioned in a user message by checking
 * against the organs table in the database.
 *
 * Uses Member 3's organs table schema:
 *   SELECT o.name, o.description, o.fact, os.name AS system_name
 *   FROM organs o ...
 *
 * FIX: Original JOIN referenced organ_systems table with system_id FK.
 * Member 3's actual schema uses a `system` text column directly on organs,
 * NOT a separate organ_systems table. Query updated accordingly.
 *
 * @param {string} message
 * @returns {Promise<Object|null>} Organ row or null.
 */
async function detectOrganInMessage(message) {
    try {
        // FIX: Member 3's schema has a `system` column directly on organs,
        //      not a separate organ_systems table with a system_id FK.
        //      Original query joined organ_systems which doesn't exist here.
        const { rows } = await pool.query(
            `SELECT name, description, fact, system
             FROM   organs
             WHERE  $1 ILIKE '%' || name || '%'
             ORDER  BY LENGTH(name) DESC
             LIMIT  1`,
            [message]
        );
        return rows[0] || null;
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// buildPrompt
// ---------------------------------------------------------------------------

/**
 * Builds the enriched prompt for OpenAI.
 * Injects organ context from Member 3's DB if the message mentions an organ.
 *
 * @param {string} userMessage
 * @returns {Promise<{ systemPrompt: string, userMessage: string }>}
 */
async function buildPrompt(userMessage) {
    const organ = await detectOrganInMessage(userMessage);

    let systemPrompt = SYSTEM_PROMPT;

    if (organ) {
        systemPrompt += `

ORGAN CONTEXT (use this as your factual reference):
- Name:             ${organ.name}
- System:           ${organ.system}
- Description:      ${organ.description}
- Interesting Fact: ${organ.fact || 'Not available'}`;
        // FIX: original used organ.interesting_fact — Member 3's schema
        //      column is named `fact`, not `interesting_fact`.
    }

    return { systemPrompt, userMessage };
}

module.exports = { buildPrompt };
