using System.Collections.Generic;
using UnityEngine;

/// <summary>
/// SearchManager.cs
/// Attach to your persistent GameManager GameObject.
///
/// Responsibilities:
///   - On Start(), scans every GameObject on the "Organ" layer and builds a
///     Dictionary mapping each organ's display name to its GameObject.
///     The key comes from OrganData.OrganName (the public property we added)
///     or falls back to GameObject.name for organs without OrganData.
///   - FocusOnOrgan(string) — single entry-point called from the Unity/React
///     bridge (window.unityInstance.SendMessage). It:
///       1. Clears the click-based selection via OrganSelector.ClearSelection().
///       2. Clears any previous search highlight.
///       3. Highlights the found organ via OrganHighlighter.SetHighlight(true).
///       4. Populates the info panel via UIManager.DisplayOrganInfo().
///       5. Moves the camera via CameraController.FocusOn(Transform).
///   - OrganMap is publicly readable for autocomplete or debug purposes.
///
/// INTEGRATION BRIDGE (Member 3 → Member 1):
///   React SearchBar.jsx calls:
///     window.unityInstance.SendMessage('GameManager', 'FocusOnOrgan', unityRef)
///   where unityRef = organs.unity_ref from the backend DB (organRoutes.js).
///   unity_ref must match either OrganData.organName or the GameObject name.
/// </summary>
public class SearchManager : MonoBehaviour
{
    // =========================================================================
    // Inspector References
    // =========================================================================

    [Header("Scene References")]
    [Tooltip("The Unity Layer assigned to all organ GameObjects. " +
             "Create it in Edit > Project Settings > Tags and Layers.")]
    [SerializeField] private string organLayerName = "Organ";

    [Tooltip("OrganSelector component — used to clear click-based selection.")]
    [SerializeField] private OrganSelector organSelector;

    [Tooltip("UIManager component — drives the organ info panel.")]
    [SerializeField] private UIManager uiManager;

    [Tooltip("CameraController — flies the camera to the found organ.")]
    [SerializeField] private CameraController cameraController;

    // =========================================================================
    // Public Read-Only Data
    // =========================================================================

    /// <summary>
    /// Full dictionary built during Start().
    /// Keys are lower-cased for case-insensitive lookups.
    /// Values are organ root GameObjects.
    /// </summary>
    public IReadOnlyDictionary<string, GameObject> OrganMap => _organMap;

    // =========================================================================
    // Private State
    // =========================================================================

    private readonly Dictionary<string, GameObject> _organMap =
        new Dictionary<string, GameObject>();

    private OrganHighlighter _searchHighlighted;
    private int              _organLayerIndex = -1;

    // =========================================================================
    // Unity Lifecycle
    // =========================================================================

    private void Awake()
    {
        ValidateReference(organSelector,    "Organ Selector");
        ValidateReference(uiManager,        "UI Manager");
        ValidateReference(cameraController, "Camera Controller");

        _organLayerIndex = LayerMask.NameToLayer(organLayerName);
        if (_organLayerIndex == -1)
            Debug.LogError($"[SearchManager] Layer '{organLayerName}' does not exist. " +
                            "Create it in Edit > Project Settings > Tags and Layers.");
    }

    private void Start()
    {
        BuildOrganDictionary();
    }

    // =========================================================================
    // Dictionary Construction
    // =========================================================================

    private void BuildOrganDictionary()
    {
        _organMap.Clear();

        // FindObjectsByType is the Unity 6 non-deprecated replacement for FindObjectsOfType.
        GameObject[] allObjects = FindObjectsByType<GameObject>(
            FindObjectsInactive.Include,
            FindObjectsSortMode.None
        );

        int registered = 0;

        foreach (GameObject go in allObjects)
        {
            if (go.layer != _organLayerIndex) continue;

            string displayName = go.name;

            // FIX: original used data.OrganName — this required the OrganName
            // public property that we added to OrganData.cs above.
            OrganData data = go.GetComponent<OrganData>();
            if (data != null && !string.IsNullOrWhiteSpace(data.OrganName))
                displayName = data.OrganName;

            string key = displayName.ToLowerInvariant();

            if (_organMap.ContainsKey(key))
            {
                Debug.LogWarning($"[SearchManager] Duplicate organ name '{displayName}' on " +
                                 $"'{go.name}'. Only the first is searchable.");
                continue;
            }

            _organMap[key] = go;
            registered++;
        }

        Debug.Log($"[SearchManager] Dictionary built — {registered} organ(s) registered.");
    }

    // =========================================================================
    // Public API — React/Unity Bridge Entry Point
    // =========================================================================

    /// <summary>
    /// Locate an organ by name, highlight it, populate the info panel,
    /// and move the camera to it.
    ///
    /// Called from the React bridge:
    ///   window.unityInstance.SendMessage('GameManager', 'FocusOnOrgan', unityRef);
    ///
    /// The lookup is case-insensitive.
    /// </summary>
    public void FocusOnOrgan(string organName)
    {
        if (string.IsNullOrWhiteSpace(organName))
        {
            Debug.LogWarning("[SearchManager] FocusOnOrgan called with empty string.");
            return;
        }

        string key = organName.Trim().ToLowerInvariant();

        if (!_organMap.TryGetValue(key, out GameObject target))
        {
            Debug.LogWarning($"[SearchManager] Organ '{organName}' not found. " +
                              "Check spelling or ensure the organ is on the Organ layer.");
            return;
        }

        // Step 1: Clear click-based selection (keeps OrganSelector state consistent)
        organSelector?.ClearSelection();

        // Step 2: Clear previous search highlight
        if (_searchHighlighted != null)
        {
            _searchHighlighted.SetHighlight(false);
            _searchHighlighted = null;
        }

        // Step 3: Highlight the found organ
        OrganHighlighter highlighter = target.GetComponent<OrganHighlighter>();
        if (highlighter != null)
        {
            highlighter.SetHighlight(true);
            _searchHighlighted = highlighter;
        }
        else
        {
            Debug.LogWarning($"[SearchManager] '{target.name}' has no OrganHighlighter. " +
                              "Visual highlight skipped.");
        }

        // Step 4: Populate the info panel
        OrganData organData = target.GetComponent<OrganData>();
        uiManager?.DisplayOrganInfo(organData);   // Accepts null gracefully

        // Step 5: Move the camera (uses the Transform overload we added)
        cameraController?.FocusOn(target.transform);

        Debug.Log($"[SearchManager] Focused on: {target.name}");
    }

    /// <summary>
    /// Clears any active search highlight and closes the info panel.
    /// Can be called from CameraController.HandleReset() on the R key,
    /// or directly from external code.
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
            Debug.LogError($"[SearchManager] '{fieldName}' is not assigned in the Inspector.");
    }
}
