using UnityEngine;

public class OrganData : MonoBehavior
{
    [Header("Organ Identity")]
    public string organName;
    public string system;
    public string description;
    public string interestingFact;

    public static System.Collections.Generic.Dictionary<string, GameObject> AnatomyDatabase
        = new System.Collections.Generic.Dictionary<string, GameObject>(
            System.StringComparer.OrdinalIgnoreCase);

    private void Awake()
    {
        if (!string.IsNullOrEmpty(organName))
            AnatomyDatabase[organName] = gameObject;
    }
}