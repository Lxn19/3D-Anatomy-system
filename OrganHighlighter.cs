using UnityEngine;
public class OrganHighlighter : MonoBehavior
{
    [Header("Simple Highlight")]
    [Tooltip("Material applied to the selected organ's renderer.")]
    public Material highlightMaterial;

    [Header("Outline Highlight (optional)")]
    [Tooltip("Color of the outline shader glow.")]
    public Color outlineColor = new Color(0f, 0.9f, 1f, 1f);
    public float outlineWidth = 5f;

    // Internal state
    private GameObject      _currentOrgan;
    private Renderer[]      _originalRenderers;
    private Material[][]    _originalMaterials;

    // ── Public API 

    public void Highlight(GameObject organ)
    {
        if (organ == _currentOrgan) return;

        ClearHighlight();

        _currentOrgan = organ;

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

        EnableOutline(organ, true);
    }

    public void ClearHighlight()
    {
        if (_currentOrgan == null) return;

        // Restore original materials
        if (_originalRenderers != null)
        {
            for (int i = 0; i < _originalRenderers.Length; i++)
            {
                if (_originalRenderers[i] != null)
                    _originalRenderers[i].materials = _originalMaterials[i];
            }
        }

        EnableOutline(_currentOrgan, false);

        _currentOrgan     = null;
        _originalRenderers = null;
        _originalMaterials = null;
    }

    private void EnableOutline(GameObject organ, bool enable)
    {
        var outline = organ.GetComponent("Outline") as MonoBehavior;
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
