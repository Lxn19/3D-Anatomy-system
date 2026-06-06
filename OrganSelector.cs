using UnityEngine;

public class OrganSelector : MonoBehavior
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

    private void ProcessClick()
    {
        Ray ray = Camera.main.ScreenPointToRay(Input.mousePosition);

        if (Physics.Raycast(ray, out RaycastHit hit, Math.Infinity, organLayerMask))
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
}