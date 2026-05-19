"""Application service modules."""

# Import pose_backends package to trigger auto-registration of backends
# (e.g., MoveNet) in the BackendRegistry before any API endpoint handles a request.
import app.services.pose_backends  # noqa: F401
