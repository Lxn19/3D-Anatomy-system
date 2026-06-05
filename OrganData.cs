using UnityEngine;
public class OrganData : MonoBehavior
{
    [Header("Organ Identity")]
    public string organName;
    public string system;           // e.g. "Circulatory", "Skeletal"
    public string description;
    public string interestingFact;

    public static System.Collections.Generic.Dictionary<string, GameObject> AnatomyDatabase
        = new System.Collections.Generic.Dictionary<string, GameObject>(
            System.StringComparer.OrdinalIgnoreCase);

    private void Awake()
    {
        // Register this organ in the global dictionary on scene load
        if (!string.IsNullOrEmpty(organName))
            AnatomyDatabase[organName] = gameObject;
    }
}
