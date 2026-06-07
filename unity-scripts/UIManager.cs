using UnityEngine;
using UnityEngine.UI;
using TMPro;

/// <summary>
/// Manages all UI elements:
///   • Organ Information Panel (name, system, description, fact)
///   • Search Bar input handling (triggers OrganSelector)
///
/// Wire up every field in the Inspector.
/// Attach to: a Manager or Canvas GameObject.
///
/// INTEGRATION NOTE (Member 1 + Member 3):
///   DisplayOrganInfo() and ClosePanel() are alias methods added so
///   SearchManager (Member 3) can call a consistent API without touching
///   OrganSelector's internal state. The original ShowOrganPanel() /
///   HideOrganPanel() methods remain for OrganSelector's use.
/// </summary>
public class UIManager : MonoBehaviour           // FIX: was MonoBehavior (typo)
{
    // ---- Organ Panel --------------------------------------------------------
    [Header("Organ Information Panel")]
    public GameObject     organPanel;
    public TMP_Text       organNameText;
    public TMP_Text       systemText;
    public TMP_Text       descriptionText;
    public TMP_Text       factText;

    // ---- Search Bar ---------------------------------------------------------
    [Header("Search Bar")]
    public TMP_InputField searchInputField;
    public Button         searchButton;

    // ---- Dependencies -------------------------------------------------------
    [Header("Dependencies")]
    public OrganSelector    organSelector;
    public CameraController cameraController;

    // -------------------------------------------------------------------------

    private void Start()
    {
        if (organPanel) organPanel.SetActive(false);

        if (searchButton)
            searchButton.onClick.AddListener(OnSearchButtonClicked);

        if (searchInputField)
            searchInputField.onSubmit.AddListener(OnSearchSubmit);
    }

    // ── Organ Panel (OrganSelector interface) ────────────────────────────────

    /// <summary>Populates and shows the info panel. Called by OrganSelector.</summary>
    public void ShowOrganPanel(OrganData organ)
    {
        if (organPanel == null) return;

        organPanel.SetActive(true);

        if (organNameText)   organNameText.text   = organ.organName;
        if (systemText)      systemText.text      = "System: " + organ.system;
        if (descriptionText) descriptionText.text = organ.description;

        // FIX: original had a missing semicolon on this line
        if (factText)        factText.text        = "Fact: " + organ.interestingFact;
    }

    /// <summary>Hides the panel. Called by OrganSelector on empty-space click.</summary>
    public void HideOrganPanel()
    {
        if (organPanel) organPanel.SetActive(false);
    }

    // ── Organ Panel (SearchManager interface) ────────────────────────────────

    /// <summary>
    /// Alias for ShowOrganPanel — accepts a nullable OrganData so SearchManager
    /// can call this even when OrganData is absent (organ has no data component).
    /// </summary>
    public void DisplayOrganInfo(OrganData organ)
    {
        if (organ == null)
        {
            HideOrganPanel();
            return;
        }
        ShowOrganPanel(organ);
    }

    /// <summary>Alias for HideOrganPanel — called by SearchManager.ClearSearchSelection().</summary>
    public void ClosePanel() => HideOrganPanel();

    // ── Search ───────────────────────────────────────────────────────────────

    private void OnSearchButtonClicked()
    {
        if (searchInputField == null) return;
        PerformSearch(searchInputField.text);
    }

    private void OnSearchSubmit(string value) => PerformSearch(value);

    private void PerformSearch(string query)
    {
        if (string.IsNullOrWhiteSpace(query)) return;

        query = query.Trim();

        if (OrganData.AnatomyDatabase.TryGetValue(query, out GameObject obj))
        {
            organSelector?.SelectByName(query);
            cameraController?.FocusOn(obj.transform.position, distance: 2f);
        }
        else
        {
            Debug.Log($"UIManager: Organ '{query}' not found.");
        }
    }
}
