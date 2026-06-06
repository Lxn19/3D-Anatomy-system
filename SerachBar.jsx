import React, { useState, useEffect, useRef, useCallback } from 'react';

// =============================================================================
// SearchBar.jsx
// Anatomy Search Component
//
// Features:
//   - Controlled text input with live suggestions dropdown
//   - 350 ms debounce on the API call to avoid spamming the server
//   - System filter dropdown (populated from GET /api/organs/systems)
//   - Keyboard navigation: ArrowUp / ArrowDown / Enter / Escape
//   - Clicking a suggestion:
//       1. Fills the input with the organ name
//       2. Closes the dropdown
//       3. ← UNITY BRIDGE HOOK → calls the Unity WebGL instance to focus the organ
//   - Accessible (aria-* attributes for screen readers)
//
// Props:
//   apiBaseUrl  {string}  Base URL of the backend API (default: http://localhost:5000)
// =============================================================================

const DEBOUNCE_MS    = 350;   // Milliseconds to wait after typing before firing the API call.
const MIN_QUERY_LENGTH = 2;    // Minimum trimmed characters required before searching.
const MAX_SUGGESTIONS = 8;    // Maximum suggestion rows shown in the dropdown.

/**
 * @param {{ apiBaseUrl?: string }} props
 */
const SearchBar = ({ apiBaseUrl = 'http://localhost:5000' }) => {

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    const [inputValue,    setInputValue]    = useState('');       // The raw text the user typed.
    const [suggestions,   setSuggestions]   = useState([]);       // Organ rows from the API.
    const [systems,       setSystems]       = useState([]);       // Available system filter options.
    const [selectedSystem, setSelectedSystem] = useState('');     // Active system filter.
    const [isLoading,     setIsLoading]     = useState(false);    // Shows a spinner in the input.
    const [isOpen,        setIsOpen]        = useState(false);    // Dropdown visibility.
    const [activeIndex,   setActiveIndex]   = useState(-1);       // Keyboard-highlighted row index.
    const [error,         setError]         = useState(null);     // API error message.

    // -------------------------------------------------------------------------
    // Refs
    // -------------------------------------------------------------------------

    const inputRef       = useRef(null);    // For focusing the input on mount.
    const containerRef   = useRef(null);    // For detecting outside clicks.
    const debounceTimer  = useRef(null);    // Holds the setTimeout id for debouncing.
    const abortController = useRef(null);  // Cancels in-flight fetch requests.

    // -------------------------------------------------------------------------
    // Fetch system filter options once on mount
    // -------------------------------------------------------------------------

    useEffect(() => {
        const fetchSystems = async () => {
            try {
                const res  = await fetch(`${apiBaseUrl}/api/organs/systems`);
                const data = await res.json();
                if (data.success) setSystems(data.systems);
            } catch {
                // Non-critical — the search still works without the system filter.
                console.warn('[SearchBar] Could not load system filter list.');
            }
        };

        fetchSystems();
        inputRef.current?.focus();
    }, [apiBaseUrl]);

    // -------------------------------------------------------------------------
    // Close dropdown on outside click
    // -------------------------------------------------------------------------

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setIsOpen(false);
                setActiveIndex(-1);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Clear pending async search work when the component unmounts.
    useEffect(() => {
        return () => {
            clearTimeout(debounceTimer.current);
            abortController.current?.abort();
        };
    }, []);

    // -------------------------------------------------------------------------
    // Core: debounced search fetch
    // -------------------------------------------------------------------------

    /**
     * Fires the GET /api/organs/search request.
     * Wrapped in useCallback so its identity is stable across renders.
     */
    const fetchSuggestions = useCallback(async (query, system) => {
        if (query.trim().length < MIN_QUERY_LENGTH) {
            if (abortController.current) abortController.current.abort();
            setSuggestions([]);
            setIsOpen(false);
            setIsLoading(false);
            return;
        }

        // Cancel any previous in-flight request.
        if (abortController.current) abortController.current.abort();
        const controller = new AbortController();
        abortController.current = controller;

        setIsLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams({
                q:     query,
                limit: MAX_SUGGESTIONS,
                ...(system && { system }),
            });

            const res  = await fetch(`${apiBaseUrl}/api/organs/search?${params}`, {
                method:  'GET',
                signal:  controller.signal,
            });

            if (!res.ok) throw new Error(`API responded with status ${res.status}`);

            const data = await res.json();
            setSuggestions(data.organs ?? []);
            setIsOpen((data.organs ?? []).length > 0);
            setActiveIndex(-1);

        } catch (err) {
            if (err.name === 'AbortError') return;  // Intentional cancellation — ignore.
            console.error('[SearchBar] Search fetch failed:', err.message);
            setError('Could not reach the search server. Please try again.');
            setSuggestions([]);
            setIsOpen(false);
        } finally {
            if (abortController.current === controller) {
                setIsLoading(false);
            }
        }
    }, [apiBaseUrl]);

    // -------------------------------------------------------------------------
    // Input change handler — applies debounce
    // -------------------------------------------------------------------------

    const handleInputChange = (e) => {
        const value = e.target.value;
        setInputValue(value);

        clearTimeout(debounceTimer.current);

        if (value.trim().length < MIN_QUERY_LENGTH) {
            if (abortController.current) abortController.current.abort();
            setSuggestions([]);
            setIsOpen(false);
            setIsLoading(false);
            return;
        }

        // Wait DEBOUNCE_MS ms after the user stops typing before fetching.
        debounceTimer.current = setTimeout(() => {
            fetchSuggestions(value.trim(), selectedSystem);
        }, DEBOUNCE_MS);
    };

    // -------------------------------------------------------------------------
    // System filter change handler
    // -------------------------------------------------------------------------

    const handleSystemChange = (e) => {
        const system = e.target.value;
        setSelectedSystem(system);

        if (inputValue.trim().length >= MIN_QUERY_LENGTH) {
            clearTimeout(debounceTimer.current);
            fetchSuggestions(inputValue.trim(), system);
        }
    };

    // -------------------------------------------------------------------------
    // Suggestion selection
    // -------------------------------------------------------------------------

    /**
     * Called when the user clicks a suggestion row OR presses Enter on one.
     * Fills the input, closes the dropdown, and triggers the Unity bridge.
     *
     * organ shape from API (matches your schema column names):
     *   { organ_id: number, name: string, system: string, description: string,
     *     fact: string, unity_ref: string }
     *
     * @param {{ organ_id: number, name: string, unity_ref: string, system: string }} organ
     */
    const handleSelectOrgan = (organ) => {
        setInputValue(organ.name);
        setSuggestions([]);
        setIsOpen(false);
        setActiveIndex(-1);

        // =====================================================================
        // UNITY BRIDGE — Trigger camera focus in the Unity 3D scene.
        //
        // When the Unity app is embedded as a WebGL build in this React page,
        // `window.unityInstance` is the object returned by createUnityInstance().
        //
        // The call below invokes SearchManager.FocusOnOrgan(unityRef) in Unity
        // via the Unity-JS bridge (SendMessage).
        //
        // Arguments:
        //   1st  — The exact name of the Unity GameObject that has the SearchManager component.
        //   2nd  — The exact public method name on that component.
        //   3rd  — The string argument to pass (unity_ref, falling back to organ name).
        //
        // SETUP REQUIRED:
        //   • In Unity: Edit > Project Settings > Player > Publishing Settings
        //     → enable "Allow 'unsafe' code" if using SendMessage.
        //   • In your HTML template: expose the Unity instance as window.unityInstance.
        //   • Replace 'GameManager' below with the exact name of your SearchManager GameObject.
        // =====================================================================
        const unityTarget = organ.unity_ref || organ.name;

        if (window.unityInstance) {
            window.unityInstance.SendMessage(
                'GameManager',           // Unity GameObject name holding SearchManager.
                'FocusOnOrgan',          // Public method on SearchManager.
                unityTarget              // Prefer organs.unity_ref; fall back to display name.
            );
            console.log(`[SearchBar] → Unity: FocusOnOrgan("${unityTarget}")`);
        } else {
            // Unity is not loaded (e.g. during standalone React development).
            // Log the intended call so you can verify the correct data is flowing.
            // unity_ref is the organs.unity_ref column from your schema —
            // it stores the exact Unity GameObject name/path for SearchManager.FocusOnOrgan().
            console.warn(
                `[SearchBar] Unity instance not found. Would have called: ` +
                `FocusOnOrgan("${unityTarget}") | organ name: "${organ.name}"`
            );
        }
    };

    // -------------------------------------------------------------------------
    // Keyboard navigation
    // -------------------------------------------------------------------------

    const handleKeyDown = (e) => {
        if (!isOpen || suggestions.length === 0) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setActiveIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
                break;

            case 'ArrowUp':
                e.preventDefault();
                setActiveIndex((prev) => Math.max(prev - 1, 0));
                break;

            case 'Enter':
                e.preventDefault();
                if (activeIndex >= 0 && suggestions[activeIndex]) {
                    handleSelectOrgan(suggestions[activeIndex]);
                }
                break;

            case 'Escape':
                setIsOpen(false);
                setActiveIndex(-1);
                inputRef.current?.blur();
                break;

            default:
                break;
        }
    };

    // -------------------------------------------------------------------------
    // Render
    // -------------------------------------------------------------------------

    const systemColors = {
        Skeletal:     '#a78bfa',   // Violet
        Muscular:     '#f87171',   // Red
        Nervous:      '#facc15',   // Yellow
        Circulatory:  '#34d399',   // Green
    };

    return (
        <div
            ref={containerRef}
            style={styles.wrapper}
            role="combobox"
            aria-expanded={isOpen}
            aria-haspopup="listbox"
            aria-owns="organ-suggestions"
        >
            {/* ----------------------------------------------------------------
                Search Row: input + system filter dropdown
            ---------------------------------------------------------------- */}
            <div style={styles.searchRow}>

                {/* Search icon */}
                <span style={styles.searchIcon} aria-hidden="true">🔍</span>

                {/* Text input */}
                <input
                    ref={inputRef}
                    type="text"
                    id="organ-search-input"
                    value={inputValue}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Search organs… (e.g. Heart, Femur)"
                    autoComplete="off"
                    aria-autocomplete="list"
                    aria-controls="organ-suggestions"
                    aria-activedescendant={activeIndex >= 0 ? `suggestion-${activeIndex}` : undefined}
                    style={styles.input}
                />

                {/* Loading spinner */}
                {isLoading && <span style={styles.spinner} aria-label="Loading…" />}

                {/* System filter */}
                <select
                    value={selectedSystem}
                    onChange={handleSystemChange}
                    style={styles.systemFilter}
                    aria-label="Filter by anatomical system"
                >
                    <option value="">All Systems</option>
                    {systems.map((sys) => (
                        <option key={sys} value={sys}>{sys}</option>
                    ))}
                </select>
            </div>

            {/* ----------------------------------------------------------------
                Error message
            ---------------------------------------------------------------- */}
            {error && <p style={styles.errorText} role="alert">{error}</p>}

            {/* ----------------------------------------------------------------
                Suggestions dropdown
            ---------------------------------------------------------------- */}
            {isOpen && suggestions.length > 0 && (
                <ul
                    id="organ-suggestions"
                    role="listbox"
                    style={styles.dropdown}
                    aria-label="Organ suggestions"
                >
                    {suggestions.map((organ, index) => (
                        <li
                            key={organ.organ_id}
                            id={`suggestion-${index}`}
                            role="option"
                            aria-selected={index === activeIndex}
                            onMouseDown={() => handleSelectOrgan(organ)}   // mouseDown fires before input blur.
                            onMouseEnter={() => setActiveIndex(index)}
                            style={{
                                ...styles.suggestionItem,
                                ...(index === activeIndex ? styles.suggestionItemActive : {}),
                            }}
                        >
                            {/* Organ name */}
                            <span style={styles.organName}>{organ.name}</span>

                            {/* System badge */}
                            <span
                                style={{
                                    ...styles.systemBadge,
                                    backgroundColor: `${systemColors[organ.system] ?? '#94a3b8'}22`,
                                    color:            systemColors[organ.system] ?? '#94a3b8',
                                    borderColor:      systemColors[organ.system] ?? '#94a3b8',
                                }}
                            >
                                {organ.system}
                            </span>
                        </li>
                    ))}
                </ul>
            )}

            {/* No-results message */}
            {isOpen && !isLoading && suggestions.length === 0 && inputValue.trim() && (
                <div style={styles.noResults} role="status">
                    No organs found matching "<strong>{inputValue}</strong>".
                </div>
            )}
        </div>
    );
};

// =============================================================================
// Inline styles — self-contained, no external CSS required.
// Replace with your CSS-in-JS / Tailwind / CSS module solution as preferred.
// =============================================================================

const styles = {
    wrapper: {
        position:   'relative',
        width:      '100%',
        maxWidth:   '640px',
        fontFamily: '"Inter", "Segoe UI", sans-serif',
    },
    searchRow: {
        display:        'flex',
        alignItems:     'center',
        background:     '#1e293b',
        border:         '1px solid #334155',
        borderRadius:   '12px',
        padding:        '0 12px',
        gap:            '8px',
        boxShadow:      '0 4px 24px rgba(0,0,0,0.3)',
        transition:     'border-color 0.2s',
    },
    searchIcon: {
        fontSize: '16px',
        flexShrink: 0,
    },
    input: {
        flex:            1,
        border:          'none',
        outline:         'none',
        background:      'transparent',
        color:           '#f1f5f9',
        fontSize:        '16px',
        padding:         '14px 0',
        caretColor:      '#818cf8',
    },
    spinner: {
        display:        'inline-block',
        width:          '16px',
        height:         '16px',
        border:         '2px solid #334155',
        borderTop:      '2px solid #818cf8',
        borderRadius:   '50%',
        animation:      'spin 0.7s linear infinite',
        flexShrink:     0,
    },
    systemFilter: {
        background:     '#0f172a',
        border:         '1px solid #334155',
        borderRadius:   '8px',
        color:          '#94a3b8',
        fontSize:       '13px',
        padding:        '6px 8px',
        cursor:         'pointer',
        outline:        'none',
        flexShrink:     0,
    },
    dropdown: {
        position:       'absolute',
        top:            'calc(100% + 6px)',
        left:           0,
        right:          0,
        background:     '#1e293b',
        border:         '1px solid #334155',
        borderRadius:   '12px',
        boxShadow:      '0 8px 32px rgba(0,0,0,0.4)',
        listStyle:      'none',
        margin:         0,
        padding:        '6px',
        zIndex:         1000,
        maxHeight:      '320px',
        overflowY:      'auto',
    },
    suggestionItem: {
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '10px 12px',
        borderRadius:   '8px',
        cursor:         'pointer',
        transition:     'background 0.15s',
    },
    suggestionItemActive: {
        background:     '#334155',
    },
    organName: {
        color:          '#f1f5f9',
        fontSize:       '15px',
        fontWeight:     500,
    },
    systemBadge: {
        fontSize:       '11px',
        fontWeight:     600,
        padding:        '2px 8px',
        borderRadius:   '20px',
        border:         '1px solid',
        letterSpacing:  '0.03em',
        textTransform:  'uppercase',
    },
    errorText: {
        color:          '#f87171',
        fontSize:       '13px',
        marginTop:      '6px',
        paddingLeft:    '4px',
    },
    noResults: {
        position:       'absolute',
        top:            'calc(100% + 6px)',
        left:           0,
        right:          0,
        background:     '#1e293b',
        border:         '1px solid #334155',
        borderRadius:   '12px',
        padding:        '14px 16px',
        color:          '#64748b',
        fontSize:       '14px',
        zIndex:         1000,
    },
};

// Inject the spinner keyframe animation once.
if (typeof document !== 'undefined' && !document.getElementById('searchbar-styles')) {
    const styleTag = document.createElement('style');
    styleTag.id = 'searchbar-styles';
    styleTag.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
    document.head.appendChild(styleTag);
}

export default SearchBar;
