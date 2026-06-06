using System.Collections;
using System.Collections.Generic;
using UnityEngine;

/// <summary>
/// SearchManager.cs
/// Attach this script to your persistent GameManager GameObject.
///
/// Responsibilities:
///   - On Start(), scans every GameObject on the "Organ" layer and builds a
///     Dictionary that maps each organ's display name to its GameObject.
///     The key is sourced from OrganData.OrganName if the component exists,
///     or falls back to GameObject.name so the system works even for organs
///     that haven't been given an OrganData component yet.
///   - FocusOnOrgan(string organName) — the single entry-point for Member 3's
///     backend. Accepts a search string, looks it up in the dictionary
///     (case-insensitive), then:
///       1. Clears any currently active selection.
///       2. Highlights the found organ via its OrganHighlighter.
///       3. Populates the info panel via UIManager.
///       4. Tells CameraController to smoothly pan to that organ's transform.
///   - The dictionary is also publicly readable so Member 3 can query the
///     full organ list (e.g. to populate an autocomplete widget).
///
/// ------------------------------------------------------------------
/// SETUP INSTRUCTIONS: See the companion Setup Guide artifact.
/// ------------------------------------------------------------------
/// </summary>
public class SearchManager : MonoBehaviour
{
    // =========================================================================
    // Inspector-Exposed References
    // =========================================================================

    [Header("Scene References")]
    [Tooltip("The name of the Unity Layer that all organ GameObjects are assigned to. " +
             "Must match exactly what is configured in Edit > Project Settings > Tags and Layers.")]
    [SerializeField] private string organLayerName = "Organ";

    [Tooltip("Reference to the OrganSelector so SearchManager can clear any active " +
             "click-selection before imposing a programmatic search selection.")]
    [SerializeField] private OrganSelector organSelector;

    [Tooltip("Reference to the UIManager that drives the organ info panel.")]
    [SerializeField] private UIManager uiManager;

    [Tooltip("Reference to the CameraController so the camera can fly to the found organ.")]
    [SerializeField] private CameraController cameraController;

    // =========================================================================
    // Public Read-Only Data — Member 3's API
    // =========================================================================

    /// <summary>
    /// The full dictionary built during Start().
    /// Key   = organ display name (lowercased for lookup; use the raw Keys for display).
    /// Value = the organ's root GameObject.
    ///
    /// Member 3 can read this to populate an autocomplete suggestion list, e.g.:
    ///   foreach (string name in SearchManager.Instance.OrganMap.Keys) { ... }
    /// </summary>
    public IReadOnlyDictionary<string, GameObject> OrganMap => _organMap;

    // =========================================================================
    // Private State
    // =========================================================================

    // Internal dictionary — keys are stored lower-case so lookups are
    // case-insensitive without requiring StringComparer boilerplate on every call.
    private readonly Dictionary<string, GameObject> _organMap =
        new Dictionary<string, GameObject>();

    // The OrganHighlighter on whichever organ is currently highlighted via
    // a search action. We keep this so we can clear it before the next search.
    private OrganHighlighter _searchHighlighted;

    // Cached layer index — avoids repeated LayerMask.NameToLayer() calls.
    private int _organLayerIndex = -1;

    // =========================================================================
    // Unity Lifecycle
    // =========================================================================

    private void Awake()
    {
        ValidateReference(organSelector,   "Organ Selector");
        ValidateReference(uiManager,       "UI Manager");
        ValidateReference(cameraController,"Camera Controller");

        // Resolve the layer name to an integer index once.
        _organLayerIndex = LayerMask.NameToLayer(organLayerName);
        if (_organLayerIndex == -1)
            Debug.LogError($"[SearchManager] Layer '{organLayerName}' does not exist! " +
                            "Create it in Edit > Project Settings > Tags and Layers.");
    }

    private void Start()
    {
        // Build the dictionary after all other Awake() calls have completed.
        BuildOrganDictionary();
    }

    // =========================================================================
    // Dictionary Construction
    // =========================================================================

    /// <summary>
    /// Scans every active GameObject in the scene, filters to those on the
    /// Organ layer, and registers them in the dictionary.
    /// </summary>
    private void BuildOrganDictionary()
    {
        _organMap.Clear();

        // FindObjectsByType is the Unity 6 non-deprecated replacement for
        // FindObjectsOfType. We find all GameObjects (not just enabled ones
        // at this stage) and then filter by layer.
        GameObject[] allObjects = FindObjectsByType<GameObject>(
            FindObjectsInactive.Include,   // Include inactive systems (hidden layers)
            FindObjectsSortMode.None
        );

        int registered = 0;

        foreach (GameObject go in allObjects)
        {
            // Skip objects that are not on the Organ layer.
            if (go.layer != _organLayerIndex) continue;

            // Prefer the curated display name from OrganData; fall back to
            // the GameObject name so partially-set-up scenes still work.
            string displayName = go.name;
            OrganData data = go.GetComponent<OrganData>();
            if (data != null && !string.IsNullOrWhiteSpace(data.OrganName))
                displayName = data.OrganName;

            // Store with lower-case key for case-insensitive lookups.
            string key = displayName.ToLowerInvariant();

            if (_organMap.ContainsKey(key))
            {
                Debug.LogWarning($"[SearchManager] Duplicate organ name '{displayName}' detected on " +
                                 $"'{go.name}'. Only the first will be searchable. " +
                                  "Ensure every organ has a unique OrganData.OrganName.");
                continue;
            }

            _organMap[key] = go;
            registered++;
        }

        Debug.Log($"[SearchManager] Dictionary built — {registered} organ(s) registered.");
    }

    // =========================================================================
    // Public API — Member 3's Entry Point
    // =========================================================================

    /// <summary>
    /// Locates an organ by name, highlights it, populates the info panel,
    /// and moves the camera to focus on it.
    ///
    /// Call this from Member 3's backend, e.g.:
    ///   searchManager.FocusOnOrgan("Heart");
    ///
    /// The lookup is case-insensitive ("heart", "HEART", "Heart" all work).
    /// </summary>
    /// <param name="organName">
    /// The display name of the organ to find (matches OrganData.OrganName or
    /// the GameObject name if OrganData is absent).
    /// </param>
    public void FocusOnOrgan(string organName)
    {
        if (string.IsNullOrWhiteSpace(organName))
        {
            Debug.LogWarning("[SearchManager] FocusOnOrgan called with an empty string.");
            return;
        }

        string key = organName.Trim().ToLowerInvariant();

        if (!_organMap.TryGetValue(key, out GameObject target))
        {
            Debug.LogWarning($"[SearchManager] Organ '{organName}' not found in the dictionary. " +
                              "Check the spelling or ensure the organ is on the Organ layer.");
            return;
        }

        // --- Step 1: Clear any existing click-based selection ---
        // We call the public ClearSelection method we added to OrganSelector
        // so its internal state stays consistent.
        organSelector?.ClearSelection();

        // --- Step 2: Clear the previous search highlight (if any) ---
        if (_searchHighlighted != null)
        {
            _searchHighlighted.SetHighlight(false);
            _searchHighlighted = null;
        }

        // --- Step 3: Highlight the found organ ---
        OrganHighlighter highlighter = target.GetComponent<OrganHighlighter>();
        if (highlighter != null)
        {
            highlighter.SetHighlight(true);
            _searchHighlighted = highlighter;
        }
        else
        {
            Debug.LogWarning($"[SearchManager] '{target.name}' has no OrganHighlighter component. " +
                              "Visual highlight skipped.");
        }

        // --- Step 4: Populate the info panel ---
        OrganData data = target.GetComponent<OrganData>();
        uiManager?.DisplayOrganInfo(data);

        // --- Step 5: Move the camera to focus on this organ ---
        cameraController?.FocusOn(target.transform);

        Debug.Log($"[SearchManager] Focused on: {target.name}");
    }

    /// <summary>
    /// Clears any active search highlight and closes the info panel.
    /// Called automatically by CameraController.HandleReset() via the Reset key.
    /// Can also be called directly from Member 3's backend if needed.
    /// </summary>
    public void ClearSearchSelection()
    {
        if (_searchHighlighted != null)
        {
            _searchHighlighted.SetHighlight(false);
            _searchHighlighted = null;
        }

        uiManager?.ClosePanel();
        Debug.Log("[SearchManager] Search selection cleared.");
    }

    // =========================================================================
    // Private Helpers
    // =========================================================================

    private void ValidateReference(Object target, string fieldName)
    {
        if (target == null)
            Debug.LogError($"[SearchManager] '{fieldName}' is not assigned! " +
                           $"Drag the correct object into the '{fieldName}' field in the Inspector.");
    }
}
