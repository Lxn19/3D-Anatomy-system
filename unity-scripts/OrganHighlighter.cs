using UnityEngine;

/// <summary>
/// Highlights the selected organ by:
///   1. Swapping its material to a highlight material (simple method).
///   2. Enabling an Outline component if present (better method).
///
/// Attach to: the same Manager GameObject as OrganSelector.
///
/// INTEGRATION NOTE (Member 1 + Member 3):
///   SetHighlight(bool) is added as the method SearchManager calls.
///   The existing Highlight() / ClearHighlight() API is preserved so
///   OrganSelector continues to work without changes.
/// </summary>
public class OrganHighlighter : MonoBehaviour    // FIX: was MonoBehavior (typo)
{
    [Header("Simple Highlight")]
    [Tooltip("Material applied to the selected organ's renderer.")]
    public Material highlightMaterial;

    [Header("Outline Highlight (optional)")]
    public Color outlineColor = new Color(0f, 0.9f, 1f, 1f);
    public float outlineWidth = 5f;

    // Internal state
    private GameObject   _currentOrgan;
    private Renderer[]   _originalRenderers;
    private Material[][] _originalMaterials;

    // ── Public API (OrganSelector interface) ────────────────────────────────

    public void Highlight(GameObject organ)
    {
        if (organ == _currentOrgan) return;

        ClearHighlight();
        _currentOrgan = organ;

        // Method A: swap material on all child renderers
        if (highlightMaterial != null)
        {
            _originalRenderers = organ.GetComponentsInChildren<Renderer>();
            _originalMaterials = new Material[_originalRenderers.Length][];

            for (int i = 0; i < _originalRenderers.Length; i++)
            {
                _originalMaterials[i] = _originalRenderers[i].materials;

                Material[] newMats = new Material[_originalRenderers[i].materials.Length];
                for (int j = 0; j < newMats.Length; j++)
                    newMats[j] = highlightMaterial;

                _originalRenderers[i].materials = newMats;
            }
        }

        // Method B: enable Outline component if present
        EnableOutline(organ, true);
    }

    public void ClearHighlight()
    {
        if (_currentOrgan == null) return;

        if (_originalRenderers != null)
        {
            for (int i = 0; i < _originalRenderers.Length; i++)
            {
                if (_originalRenderers[i] != null)
                    _originalRenderers[i].materials = _originalMaterials[i];
            }
        }

        EnableOutline(_currentOrgan, false);

        _currentOrgan      = null;
        _originalRenderers = null;
        _originalMaterials = null;
    }

    // ── Public API (SearchManager interface) ────────────────────────────────

    /// <summary>
    /// Toggle highlight on/off. SearchManager calls this directly on the
    /// OrganHighlighter attached to a specific organ GameObject (not via
    /// the manager's Highlight/ClearHighlight, which track a single selection).
    /// This allows SearchManager to manage its own highlight lifecycle
    /// independently of click-based selection.
    /// </summary>
    public void SetHighlight(bool enable)
    {
        if (enable)
            Highlight(gameObject);
        else
            ClearHighlight();
    }

    // ── Outline Helper ───────────────────────────────────────────────────────

    /// <summary>
    /// Works with the popular "Quick Outline" asset.
    /// Uses reflection so the project compiles even without that asset.
    /// FIX: cast target to MonoBehaviour (not MonoBehavior).
    /// </summary>
    private void EnableOutline(GameObject organ, bool enable)
    {
        // FIX: was cast to MonoBehavior — correct type is MonoBehaviour
        var outline = organ.GetComponent("Outline") as MonoBehaviour;
        if (outline == null) return;

        if (enable)
        {
            var colorProp = outline.GetType().GetProperty("OutlineColor");
            var widthProp = outline.GetType().GetProperty("OutlineWidth");
            colorProp?.SetValue(outline, outlineColor);
            widthProp?.SetValue(outline, outlineWidth);
        }

        outline.enabled = enable;
    }
}
