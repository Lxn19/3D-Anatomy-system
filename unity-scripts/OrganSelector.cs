using UnityEngine;

/// <summary>
/// Detects which organ the user clicked using a Physics Raycast,
/// then notifies OrganHighlighter and UIManager.
///
/// Attach to: a Manager GameObject in the scene (not to organs).
///
/// INTEGRATION NOTE (Member 1 + Member 3):
///   ClearSelection() is called by SearchManager.FocusOnOrgan() before it
///   imposes a programmatic search selection, keeping internal state consistent.
/// </summary>
public class OrganSelector : MonoBehaviour       // FIX: was MonoBehavior (typo)
{
    [Header("Dependencies")]
    public OrganHighlighter highlighter;
    public UIManager        uiManager;

    [Header("Settings")]
    [Tooltip("Layer mask – only organs should be on this layer.")]
    public LayerMask organLayerMask = ~0;

    private OrganData _selectedOrgan;

    private void Update()
    {
        if (!Input.GetMouseButtonDown(0)) return;

        if (UnityEngine.EventSystems.EventSystem.current != null &&
            UnityEngine.EventSystems.EventSystem.current.IsPointerOverGameObject())
            return;

        ProcessClick();
    }

    // ── Core Logic ──────────────────────────────────────────────────────────

    private void ProcessClick()
    {
        Ray ray = Camera.main.ScreenPointToRay(Input.mousePosition);

        // FIX: Math.Infinity does not exist in Unity C#. Use Mathf.Infinity.
        if (Physics.Raycast(ray, out RaycastHit hit, Mathf.Infinity, organLayerMask))
        {
            OrganData organ = hit.collider.GetComponentInParent<OrganData>();
            if (organ == null)
                organ = hit.collider.GetComponent<OrganData>();

            if (organ != null)
            {
                SelectOrgan(organ);
                return;
            }
        }

        Deselect();
    }

    private void SelectOrgan(OrganData organ)
    {
        if (_selectedOrgan == organ) return;

        _selectedOrgan = organ;
        highlighter?.Highlight(organ.gameObject);
        uiManager?.ShowOrganPanel(organ);
    }

    private void Deselect()
    {
        if (_selectedOrgan == null) return;

        _selectedOrgan = null;
        highlighter?.ClearHighlight();
        uiManager?.HideOrganPanel();
    }

    // ── Public API ──────────────────────────────────────────────────────────

    /// <summary>
    /// Programmatically selects an organ by name.
    /// Called by UIManager.PerformSearch() when a search result is found.
    /// </summary>
    public void SelectByName(string organName)
    {
        if (OrganData.AnatomyDatabase.TryGetValue(organName, out GameObject obj))
        {
            OrganData organ = obj.GetComponent<OrganData>();
            if (organ != null) SelectOrgan(organ);
        }
        else
        {
            Debug.LogWarning($"OrganSelector: '{organName}' not found in AnatomyDatabase.");
        }
    }

    /// <summary>
    /// Clears the current click-based selection without affecting any
    /// search-based highlight. Called by SearchManager before it applies
    /// its own highlight, so OrganSelector's internal state stays consistent.
    /// </summary>
    public void ClearSelection()
    {
        _selectedOrgan = null;
        // Do NOT call ClearHighlight() here – SearchManager manages its own
        // highlight lifecycle independently via OrganHighlighter.SetHighlight().
        uiManager?.HideOrganPanel();
    }
}
