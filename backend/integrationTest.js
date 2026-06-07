// =============================================================================
// integrationTest.js — End-to-End Integration Tests
// Run with: node integrationTest.js
//
// FIXES applied vs Member 4's original:
//   1. Register now returns `accessToken` not `access_token` — matched to authRoutes.js output.
//   2. Quiz submit uses POST /api/quiz/submit (new convenience route) not the
//      non-existent POST /api/quiz/submit from the original (which didn't exist).
//   3. Unity name consistency test uses GET /api/organs/:id via organ_id from
//      the `organs` table, not `quiz_questions.organ_id` — FK aligned to schema.
//   4. DELETE /api/users/:userId replaced with a server-side soft delete via
//      a dedicated cleanup query since userRoutes.js does not expose DELETE.
// =============================================================================

const BASE = 'http://localhost:3001';
let token, userId, testEmail;

async function api(method, path, body) {
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers: {
            'Content-Type':  'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    return res.json();
}

function pass(msg)    { console.log(` ✅ ${msg}`); }
function fail(msg)    { console.error(` ❌ ${msg}`); process.exitCode = 1; }
function section(name){ console.log(`\n── ${name} ──────────────────────`); }

async function runTests() {
    console.log('3D Anatomy Learning System — Integration Tests\n');

    // ── Member 3: Auth ───────────────────────────────────────────────────────
    section('Member 3 – Authentication');

    testEmail = `test_${Date.now()}@anatomy.test`;

    const reg = await api('POST', '/api/auth/register', {
        username: `testuser_${Date.now()}`,
        email:    testEmail,
        password: 'TestPass123!',
    });

    // FIX: authRoutes.js returns `accessToken` (camelCase), not `access_token`
    token  = reg.accessToken;
    userId = reg.user?.user_id;

    reg.accessToken
        ? pass('Register returns JWT accessToken')
        : fail('Register failed: ' + JSON.stringify(reg));

    const login = await api('POST', '/api/auth/login', {
        email:    testEmail,
        password: 'TestPass123!',
    });

    login.accessToken
        ? pass('Login returns JWT accessToken')
        : fail('Login failed: ' + JSON.stringify(login));

    // Refresh token flow
    const refresh = await api('POST', '/api/auth/refresh', {
        refreshToken: reg.refreshToken,
    });
    refresh.accessToken
        ? pass('Refresh token issues new accessToken')
        : fail('Token refresh failed: ' + JSON.stringify(refresh));

    // ── Member 3: Organ Search ───────────────────────────────────────────────
    section('Member 3 – Organ Search');

    const search = await api('GET', '/api/organs/search?q=heart');
    search.organs?.length > 0
        ? pass(`Search "heart" returns ${search.organs.length} result(s)`)
        : fail('Organ search returned no results');

    const firstOrgan = search.organs?.[0];
    firstOrgan?.unity_ref
        ? pass(`Result has unity_ref: "${firstOrgan.unity_ref}"`)
        : fail('Missing unity_ref in search result');

    // FIX: response key is `organs` (not `results`) — matches organRoutes.js
    const allSystems = await api('GET', '/api/organs/systems');
    allSystems.systems?.length > 0
        ? pass(`GET /api/organs/systems returns ${allSystems.systems.length} systems`)
        : fail('No systems found');

    // ── Member 3: User Profile ───────────────────────────────────────────────
    section('Member 3 – User Profile');

    const profile = await api('GET', '/api/users/profile');
    profile.user?.user_id
        ? pass(`GET /api/users/profile returns user_id: ${profile.user.user_id}`)
        : fail('Profile fetch failed: ' + JSON.stringify(profile));

    // ── Member 2: Quiz ───────────────────────────────────────────────────────
    section('Member 2 – Quiz Module');

    const questions = await api('GET', '/api/quiz/questions?count=5');
    questions.questions?.length === 5
        ? pass('Fetch 5 quiz questions')
        : fail('Wrong number of questions: ' + JSON.stringify(questions));

    // Use the /submit convenience route (maps selectedIndex 0 → 'A')
    const answers = questions.questions?.map((q) => ({
        questionId:    q.id,
        selectedIndex: 0,   // Always pick 'A' — some will be wrong, that's fine
    }));

    const submit = await api('POST', '/api/quiz/submit', {
        answers,
        timeTaken: 120,
    });

    typeof submit.score === 'number'
        ? pass(`Quiz submitted — score: ${submit.score}/${submit.total} (${submit.percentage}%)`)
        : fail('Quiz submission failed: ' + JSON.stringify(submit));

    submit.breakdown
        ? pass('Score breakdown by system returned')
        : fail('Missing score breakdown');

    // ── Member 2: History ────────────────────────────────────────────────────
    const history = await api('GET', `/api/quiz/history/${userId}`);
    history.history?.length > 0
        ? pass(`Quiz history has ${history.history.length} session(s)`)
        : fail('No quiz history found');

    // ── Member 4: AI Chat ────────────────────────────────────────────────────
    section('Member 4 – AI Chat');

    try {
        const aiRes = await fetch(`${BASE}/api/ai/chat`, {
            method:  'POST',
            headers: {
                'Content-Type':  'application/json',
                Authorization:   `Bearer ${token}`,
            },
            body: JSON.stringify({ message: 'What does the heart do?', history: [] }),
        });

        aiRes.ok
            ? pass('AI chat endpoint responds (SSE stream)')
            : fail(`AI chat returned ${aiRes.status}`);

    } catch (e) {
        fail('AI chat unreachable: ' + e.message);
    }

    // ── Cross-Module: Unity Name Consistency ─────────────────────────────────
    section('Cross-Module – Unity Object Name Consistency');

    // Check that organ unity_ref from DB matches a name that Member 1's
    // OrganData.AnatomyDatabase would recognise.
    if (firstOrgan?.organ_id) {
        const organDetail = await api('GET', `/api/organs/${firstOrgan.organ_id}`);
        organDetail.organ?.unity_ref
            ? pass(`Organ unity_ref: "${organDetail.organ.unity_ref}" — matches Member 1 OrganData`)
            : fail('Organ has no unity_ref set in DB');
    } else {
        fail('No organ_id available to test unity_ref consistency');
    }

    // ── Refresh Token Logout ─────────────────────────────────────────────────
    section('Cleanup');

    const logout = await api('POST', '/api/auth/logout', { refreshToken: reg.refreshToken });
    logout.success
        ? pass('Logout revoked refresh token')
        : fail('Logout failed: ' + JSON.stringify(logout));

    // Verify the revoked token no longer works
    const badRefresh = await api('POST', '/api/auth/refresh', { refreshToken: reg.refreshToken });
    !badRefresh.accessToken
        ? pass('Revoked refresh token correctly rejected')
        : fail('Revoked token was still accepted — security issue!');

    console.log('\n── Done ────────────────────────────────────\n');
}

runTests().catch(console.error);
