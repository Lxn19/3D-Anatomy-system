using UnityEngine;
using UnityEngine.UI;

public class LayerManager : MonoBehavior
{
    [Header("Anatomy Root GameObjects")]
    public GameObject skeletonRoot;
    public GameObject musclesRoot;
    public GameObject nervousRoot;
    public GameObject circulatoryRoot;

    [Header("UI Toggles")]
    public Toggle skeletonToggle;
    public Toggle musclesToggle;
    public Toggle nervousToggle;
    public Toggle circulatoryToggle;

    private void Start()
    {
        // Register listeners – each toggle drives its corresponding layer
        RegisterToggle(skeletonToggle,    skeletonRoot);
        RegisterToggle(musclesToggle,     musclesRoot);
        RegisterToggle(nervousToggle,     nervousRoot);
        RegisterToggle(circulatoryToggle, circulatoryRoot);

        // Sync initial visual state with toggle defaults (all on)
        ApplyAll();
    }

    private void RegisterToggle(Toggle toggle, GameObject root)
    {
        if (toggle == null || root == null) return;

        toggle.onValueChanged.AddListener(isOn =>
        {
            root.SetActive(isOn);
        });
    }

    private void ApplyAll()
    {
        SetLayer(skeletonRoot,    skeletonToggle);
        SetLayer(musclesRoot,     musclesToggle);
        SetLayer(nervousRoot,     nervousToggle);
        SetLayer(circulatoryRoot, circulatoryToggle);
    }

    private void SetLayer(GameObject root, Toggle toggle)
    {
        if (root == null) return;
        bool isOn = toggle != null ? toggle.isOn : true;
        root.SetActive(isOn);
    }

    // ── Public API (called from code if needed) ───────────────────

    public void ShowSkeleton(bool show)
    {
        if (skeletonRoot) skeletonRoot.SetActive(show);
        if (skeletonToggle) skeletonToggle.SetIsOnWithoutNotify(show);
    }

    public void ShowMuscles(bool show)
    {
        if (musclesRoot) musclesRoot.SetActive(show);
        if (musclesToggle) musclesToggle.SetIsOnWithoutNotify(show);
    }

    public void ShowNervous(bool show)
    {
        if (nervousRoot) nervousRoot.SetActive(show);
        if (nervousToggle) nervousToggle.SetIsOnWithoutNotify(show);
    }

    public void ShowCirculatory(bool show)
    {
        if (circulatoryRoot) circulatoryRoot.SetActive(show);
        if (circulatoryToggle) circulatoryToggle.SetIsOnWithoutNotify(show);
    }

    public void ShowAll()
    {
        ShowSkeleton(true);
        ShowMuscles(true);
        ShowNervous(true);
        ShowCirculatory(true);
    }
}
