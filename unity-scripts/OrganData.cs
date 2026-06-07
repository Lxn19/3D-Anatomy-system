using UnityEngine;
using System.Collections.Generic;

/// <summary>
/// Holds all anatomical data for a single organ.
/// Attach this component to every organ GameObject in the scene.
///
/// INTEGRATION NOTE (Member 1 + Member 3):
///   AnatomyDatabase is keyed by organName (case-insensitive).
///   SearchManager.cs (Member 3) reads OrganName via the public property below,
///   so both systems share the same source of truth for organ name strings.
/// </summary>
public class OrganData : MonoBehaviour           // FIX: was MonoBehavior (typo)
{
    [Header("Organ Identity")]
    public string organName;
    public string system;           // e.g. "Circulatory", "Skeletal"
    public string description;
    public string interestingFact;

    // -----------------------------------------------------------------------
    // Static lookup dictionary – populated automatically at runtime.
    // UIManager.PerformSearch() and SearchManager.FocusOnOrgan() both use this.
    // -----------------------------------------------------------------------
    public static Dictionary<string, GameObject> AnatomyDatabase
        = new Dictionary<string, GameObject>(
            System.StringComparer.OrdinalIgnoreCase);

    // Public property required by SearchManager.BuildOrganDictionary()
    // so it can read the curated display name without accessing the field directly.
    public string OrganName => organName;

    private void Awake()
    {
        if (!string.IsNullOrEmpty(organName))
            AnatomyDatabase[organName] = gameObject;
    }
}
