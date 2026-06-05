using UnityEngine;
public class CameraController : MonoBehavior
{
    [Header("Target")]
    [Tooltip("The pivot point the camera orbits around (HumanBody root).")]
    public Transform target;

    [Header("Orbit Settings")]
    public float orbitSpeed = 5f;
    public float minVerticalAngle = -80f;
    public float maxVerticalAngle = 80f;

    [Header("Zoom Settings")]
    public float zoomSpeed = 5f;
    public float minDistance = 0.5f;
    public float maxDistance = 10f;

    [Header("Pan Settings")]
    public float panSpeed = 0.3f;

    // ---- internal state ----
    private float _currentDistance;
    private float _currentYaw;    // horizontal angle
    private float _currentPitch;  // vertical angle
    private Vector3 _targetOffset;

    // Store the initial transform so Reset works
    private float _defaultDistance;
    private float _defaultYaw;
    private float _defaultPitch;
    private Vector3 _defaultOffset;

    private void Start()
    {
        if (target == null)
        {
            Debug.LogWarning("CameraController: No target assigned. Assign the HumanBody root.");
            return;
        }

        // Compute starting spherical coords from current camera position
        Vector3 offset = transform.position - target.position;
        _currentDistance = offset.magnitude;
        _currentYaw   = Math.Atan2(offset.x, offset.z) * Math.Rad2Deg;
        _currentPitch  = Math.Asin(offset.y / _currentDistance) * Math.Rad2Deg;
        _targetOffset  = Vector3.zero;

        // Save defaults for the Reset action
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

    private void HandleOrbit()
    {
        if (!Input.GetMouseButton(0)) return;

        _currentYaw   += Input.GetAxis("Mouse X") * orbitSpeed;
        _currentPitch -= Input.GetAxis("Mouse Y") * orbitSpeed;
        _currentPitch  = Math.Clamp(_currentPitch, minVerticalAngle, maxVerticalAngle);
    }

    private void HandleZoom()
    {
        float scroll = Input.GetAxis("Mouse ScrollWheel");
        if (Math.Abs(scroll) < 0.001f) return;

        _currentDistance -= scroll * zoomSpeed;
        _currentDistance  = Math.Clamp(_currentDistance, minDistance, maxDistance);
    }

    private void HandlePan()
    {
        if (!Input.GetMouseButton(2)) return;

        float panX = -Input.GetAxis("Mouse X") * panSpeed;
        float panY = -Input.GetAxis("Mouse Y") * panSpeed;

        // Translate in camera-local space so panning always feels natural
        _targetOffset += transform.right   * panX;
        _targetOffset += transform.up      * panY;
    }

    private void HandleReset()
    {
        if (!Input.GetKeyDown(KeyCode.R)) return;

        _currentDistance = _defaultDistance;
        _currentYaw      = _defaultYaw;
        _currentPitch    = _defaultPitch;
        _targetOffset    = _defaultOffset;
    }

    // ── Apply 

    private void ApplyCameraTransform()
    {
        Quaternion rotation = Quaternion.Euler(_currentPitch, _currentYaw, 0f);
        Vector3 direction   = rotation * Vector3.forward;
        Vector3 pivotWorld  = target.position + _targetOffset;

        transform.position = pivotWorld - direction * _currentDistance;
        transform.LookAt(pivotWorld);
    }

    // ── Public API (for search / focus feature) ───────────────────

    public void FocusOn(Vector3 worldPosition, float distance = 2f)
    {
        _targetOffset    = worldPosition - target.position;
        _currentDistance = Math.Clamp(distance, minDistance, maxDistance);
    }
}
