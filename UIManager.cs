using UnityEngine;
using UnityEngine.UI;
using TMPro;

public class UIManager : MonoBehavior
{
    [Header("Organ Information Panel")]
    public GameObject     organPanel;
    public TMP_Text       organNameText;
    public TMP_Text       systemText;
    public TMP_Text       descriptionText;
    public TMP_Text       factText;

    [Header("Search Bar")]
    public TMP_InputField searchInputField;
    public Button         searchButton;

    [Header("Dependencies")]
    public OrganSelector    organSelector;
    public CameraController cameraController;

    private void Start()
    {
        if (organPanel) organPanel.SetActive(false);

        if (searchButton)
            searchButton.onClick.AddListener(OnSearchButtonClicked);

        if (searchInputField)
            searchInputField.onSubmit.AddListener(OnSearchSubmit);
    }

    public void ShowOrganPanel(OrganData organ)
    {
        if (organPanel == null) return;

        organPanel.SetActive(true);

        if (organNameText)   organNameText.text   = organ.organName;
        if (systemText)      systemText.text      = "System: " + organ.system;
        if (descriptionText) descriptionText.text = organ.description;
        if (factText)        factText.text        = "Fact: " + organ.interestingFact;
    }

    public void HideOrganPanel()
    {
        if (organPanel) organPanel.SetActive(false);
    }

    private void OnSearchButtonClicked()
    {
        if (searchInputField == null) return;
        PerformSearch(searchInputField.text);
    }

    private void OnSearchSubmit(string value)
    {
        PerformSearch(value);
    }

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