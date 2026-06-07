using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// Controls the visibility of the four anatomical system layers.
///
/// Wire up in the Inspector:
///   skeletonRoot      → HumanBody/Skeleton
///   musclesRoot       → HumanBody/Muscles
///   nervousRoot       → HumanBody/NervousSystem
///   circulatoryRoot   → HumanBody/CirculatorySystem
///
///   skeletonToggle    → UI Toggle for "Skeleton"
///   musclesToggle     → UI Toggle for "Muscles"
///   nervousToggle     → UI Toggle for "Nerves"
///   circulatoryToggle → UI Toggle for "Blood Vessels"
///
/// Attach to: a Manager GameObject.
/// </summary>
public class LayerManager : MonoBehaviour        // FIX: was MonoBehavior (typo)
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
        RegisterToggle(skeletonToggle,    skeletonRoot);
        RegisterToggle(musclesToggle,     musclesRoot);
        RegisterToggle(nervousToggle,     nervousRoot);
        RegisterToggle(circulatoryToggle, circulatoryRoot);

        ApplyAll();
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private void RegisterToggle(Toggle toggle, GameObject root)
    {
        if (toggle == null || root == null) return;
        toggle.onValueChanged.AddListener(isOn => root.SetActive(isOn));
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

    // ── Public API ──────────────────────────────────────────────────────────

    public void ShowSkeleton(bool show)
    {
        if (skeletonRoot)   skeletonRoot.SetActive(show);
        if (skeletonToggle) skeletonToggle.SetIsOnWithoutNotify(show);
    }

    public void ShowMuscles(bool show)
    {
        if (musclesRoot)   musclesRoot.SetActive(show);
        if (musclesToggle) musclesToggle.SetIsOnWithoutNotify(show);
    }

    public void ShowNervous(bool show)
    {
        if (nervousRoot)   nervousRoot.SetActive(show);
        if (nervousToggle) nervousToggle.SetIsOnWithoutNotify(show);
    }

    public void ShowCirculatory(bool show)
    {
        if (circulatoryRoot)   circulatoryRoot.SetActive(show);
        if (circulatoryToggle) circulatoryToggle.SetIsOnWithoutNotify(show);
    }

    /// <summary>Show all layers at once (used by Reset).</summary>
    public void ShowAll()
    {
        ShowSkeleton(true);
        ShowMuscles(true);
        ShowNervous(true);
        ShowCirculatory(true);
    }
}
