using UnityEngine;

/// <summary>
/// Handles all camera interactions around the human body pivot.
///
/// Controls:
///   Rotate  – Left-click + Drag
///   Zoom    – Mouse Scroll Wheel
///   Pan     – Middle Mouse Button + Drag
///   Reset   – R Key
///
/// INTEGRATION NOTE (Member 1 + Member 3):
///   FocusOn(Transform) overload added so SearchManager.cs (Member 3) can pass
///   a Transform directly, while the original FocusOn(Vector3, float) overload
///   used by UIManager.cs is preserved unchanged.
/// </summary>
public class CameraController : MonoBehaviour    // FIX: was MonoBehavior (typo)
{
    [Header("Target")]
    [Tooltip("The pivot point the camera orbits around (HumanBody root).")]
    public Transform target;

    [Header("Orbit Settings")]
    public float orbitSpeed        = 5f;
    public float minVerticalAngle  = -80f;
    public float maxVerticalAngle  = 80f;

    [Header("Zoom Settings")]
    public float zoomSpeed   = 5f;
    public float minDistance = 0.5f;
    public float maxDistance = 10f;

    [Header("Pan Settings")]
    public float panSpeed = 0.3f;

    // ---- internal state ------------------------------------------------
    private float   _currentDistance;
    private float   _currentYaw;
    private float   _currentPitch;
    private Vector3 _targetOffset;

    private float   _defaultDistance;
    private float   _defaultYaw;
    private float   _defaultPitch;
    private Vector3 _defaultOffset;

    private void Start()
    {
        if (target == null)
        {
            Debug.LogWarning("CameraController: No target assigned. Assign the HumanBody root.");
            return;
        }

        Vector3 offset    = transform.position - target.position;
        _currentDistance  = offset.magnitude;

        // FIX: Math.Atan2 / Math.Asin / Math.Rad2Deg do not exist in Unity C#.
        //      The correct Unity API is Mathf.Atan2, Mathf.Asin, Mathf.Rad2Deg.
        _currentYaw   = Mathf.Atan2(offset.x, offset.z) * Mathf.Rad2Deg;
        _currentPitch = Mathf.Asin(offset.y / _currentDistance) * Mathf.Rad2Deg;
        _targetOffset = Vector3.zero;

        _defaultDistance = _currentDistance;
        _defaultYaw      = _currentYaw;
        _defaultPitch    = _currentPitch;
        _defaultOffset   = _targetOffset;
    }

    private void LateUpdate()
    {
        if (target == null) return;

        HandleReset();
        HandleOrbit();
        HandleZoom();
        HandlePan();
        ApplyCameraTransform();
    }

    // ── Input Handlers ──────────────────────────────────────────────────────

    private void HandleOrbit()
    {
        if (!Input.GetMouseButton(0)) return;

        _currentYaw   += Input.GetAxis("Mouse X") * orbitSpeed;
        _currentPitch -= Input.GetAxis("Mouse Y") * orbitSpeed;

        // FIX: Math.Clamp → Mathf.Clamp
        _currentPitch = Mathf.Clamp(_currentPitch, minVerticalAngle, maxVerticalAngle);
    }

    private void HandleZoom()
    {
        float scroll = Input.GetAxis("Mouse ScrollWheel");

        // FIX: Math.Abs → Mathf.Abs
        if (Mathf.Abs(scroll) < 0.001f) return;

        _currentDistance -= scroll * zoomSpeed;

        // FIX: Math.Clamp → Mathf.Clamp
        _currentDistance = Mathf.Clamp(_currentDistance, minDistance, maxDistance);
    }

    private void HandlePan()
    {
        if (!Input.GetMouseButton(2)) return;

        float panX = -Input.GetAxis("Mouse X") * panSpeed;
        float panY = -Input.GetAxis("Mouse Y") * panSpeed;

        _targetOffset += transform.right * panX;
        _targetOffset += transform.up    * panY;
    }

    private void HandleReset()
    {
        if (!Input.GetKeyDown(KeyCode.R)) return;

        _currentDistance = _defaultDistance;
        _currentYaw      = _defaultYaw;
        _currentPitch    = _defaultPitch;
        _targetOffset    = _defaultOffset;
    }

    // ── Apply ───────────────────────────────────────────────────────────────

    private void ApplyCameraTransform()
    {
        Quaternion rotation = Quaternion.Euler(_currentPitch, _currentYaw, 0f);
        Vector3    direction  = rotation * Vector3.forward;
        Vector3    pivotWorld = target.position + _targetOffset;

        transform.position = pivotWorld - direction * _currentDistance;
        transform.LookAt(pivotWorld);
    }

    // ── Public API ──────────────────────────────────────────────────────────

    /// <summary>
    /// Focus on a world-space position (used by UIManager.PerformSearch).
    /// </summary>
    public void FocusOn(Vector3 worldPosition, float distance = 2f)
    {
        _targetOffset    = worldPosition - target.position;
        // FIX: Math.Clamp → Mathf.Clamp
        _currentDistance = Mathf.Clamp(distance, minDistance, maxDistance);
    }

    /// <summary>
    /// Focus on a Transform (used by SearchManager.FocusOnOrgan – Member 3).
    /// Keeps a consistent 2-unit viewing distance by default.
    /// </summary>
    public void FocusOn(Transform organTransform, float distance = 2f)
    {
        if (organTransform == null) return;
        FocusOn(organTransform.position, distance);
    }
}
