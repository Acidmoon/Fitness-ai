"""Property-based test for thread-safe concurrent access.

Feature: pose-analysis-abstraction, Property 11: Thread-Safe Concurrent Access

For any number of concurrent threads calling `get_backend()` simultaneously,
the BackendRegistry SHALL instantiate the factory exactly once, and the backend
SHALL not produce corrupted results or raise unexpected exceptions due to race
conditions.

**Validates: Requirements 2.6, 3.5**
"""

import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from unittest.mock import MagicMock

from hypothesis import given, settings
from hypothesis import strategies as st

from app.services.pose_backends.registry import BackendRegistry


# Strategy for valid backend identifier strings
valid_identifier_st = st.from_regex(r"[a-z][a-z0-9_-]{0,19}", fullmatch=True)

# Strategy for number of concurrent threads (2 to 20)
num_threads_st = st.integers(min_value=2, max_value=20)


@settings(max_examples=20)
@given(identifier=valid_identifier_st, num_threads=num_threads_st)
def test_concurrent_get_backend_instantiates_factory_exactly_once(
    identifier: str, num_threads: int
) -> None:
    """Property 11: Thread-Safe Concurrent Access - Factory called exactly once.

    For any number of concurrent threads calling get_backend() simultaneously,
    the BackendRegistry SHALL instantiate the factory exactly once.

    **Validates: Requirements 2.6, 3.5**
    """
    # Create a fresh registry for each test case
    reg = BackendRegistry()

    # Create a mock backend and a factory with a thread-safe call counter
    mock_backend = MagicMock()
    mock_backend.backend_name = identifier
    mock_backend.is_available.return_value = True
    mock_backend.analyze_frame.return_value = {
        "model": {"name": "test"},
        "keypoints": [],
    }

    call_counter_lock = threading.Lock()
    call_count = {"n": 0}

    def thread_safe_factory():
        with call_counter_lock:
            call_count["n"] += 1
        return mock_backend

    # Register the factory
    reg.register(identifier, thread_safe_factory)

    # Launch N threads that all call get_backend(identifier) concurrently
    results = []
    exceptions = []

    with ThreadPoolExecutor(max_workers=num_threads) as executor:
        futures = [
            executor.submit(reg.get_backend, identifier)
            for _ in range(num_threads)
        ]
        for future in as_completed(futures):
            try:
                results.append(future.result())
            except Exception as exc:
                exceptions.append(exc)

    # Assert no unexpected exceptions occurred
    assert exceptions == [], (
        f"Unexpected exceptions during concurrent access: {exceptions}"
    )

    # Assert the factory was called exactly once
    assert call_count["n"] == 1, (
        f"Factory was called {call_count['n']} times, expected exactly 1"
    )

    # Assert all threads received the same instance
    assert len(results) == num_threads
    for i, result in enumerate(results):
        assert result is mock_backend, (
            f"Thread {i} received a different instance than expected"
        )


@settings(max_examples=20)
@given(identifier=valid_identifier_st, num_threads=num_threads_st)
def test_concurrent_get_backend_returns_same_instance_to_all_threads(
    identifier: str, num_threads: int
) -> None:
    """Property 11: Thread-Safe Concurrent Access - Same instance returned.

    For any number of concurrent threads calling get_backend() simultaneously,
    all threads SHALL receive the same backend instance.

    **Validates: Requirements 2.6, 3.5**
    """
    reg = BackendRegistry()

    mock_backend = MagicMock()
    mock_backend.backend_name = identifier

    reg.register(identifier, lambda: mock_backend)

    # Use a barrier to maximize concurrency (all threads start at the same time)
    barrier = threading.Barrier(num_threads)
    results = [None] * num_threads
    exceptions_list = [None] * num_threads

    def worker(index: int) -> None:
        try:
            barrier.wait(timeout=5)
            results[index] = reg.get_backend(identifier)
        except Exception as exc:
            exceptions_list[index] = exc

    threads = [
        threading.Thread(target=worker, args=(i,))
        for i in range(num_threads)
    ]

    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=10)

    # Check no exceptions
    actual_exceptions = [e for e in exceptions_list if e is not None]
    assert actual_exceptions == [], (
        f"Unexpected exceptions: {actual_exceptions}"
    )

    # All results should be the same instance
    assert all(r is mock_backend for r in results), (
        "Not all threads received the same backend instance"
    )


@settings(max_examples=20)
@given(identifier=valid_identifier_st, num_threads=num_threads_st)
def test_concurrent_analyze_frame_no_corruption(
    identifier: str, num_threads: int
) -> None:
    """Property 11: Thread-Safe Concurrent Access - No corrupted results.

    For any number of concurrent threads calling analyze_frame() simultaneously,
    the backend SHALL not produce corrupted results or raise unexpected exceptions
    due to race conditions.

    **Validates: Requirements 2.6, 3.5**
    """
    reg = BackendRegistry()

    # Create a backend that returns a deterministic result
    expected_result = {
        "model": {"name": "test-model"},
        "keypoints": [
            {"name": "nose", "x": 0.5, "y": 0.5, "score": 0.9},
        ],
    }
    mock_backend = MagicMock()
    mock_backend.backend_name = identifier
    mock_backend.is_available.return_value = True
    mock_backend.analyze_frame.return_value = expected_result

    reg.register(identifier, lambda: mock_backend)

    # Get the backend first (to separate instantiation from usage)
    backend = reg.get_backend(identifier)

    # Launch N threads that all call analyze_frame concurrently
    frame_data = MagicMock()  # Simulated frame
    results = [None] * num_threads
    exceptions_list = [None] * num_threads

    barrier = threading.Barrier(num_threads)

    def worker(index: int) -> None:
        try:
            barrier.wait(timeout=5)
            results[index] = backend.analyze_frame(frame_data)
        except Exception as exc:
            exceptions_list[index] = exc

    threads = [
        threading.Thread(target=worker, args=(i,))
        for i in range(num_threads)
    ]

    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=10)

    # No unexpected exceptions
    actual_exceptions = [e for e in exceptions_list if e is not None]
    assert actual_exceptions == [], (
        f"Unexpected exceptions during concurrent analyze_frame: {actual_exceptions}"
    )

    # All results should match expected (no corruption)
    for i, result in enumerate(results):
        assert result == expected_result, (
            f"Thread {i} got corrupted result: {result}"
        )


def test_movenet_backend_concurrent_analyze_frame_creates_single_runtime():
    """Verify MoveNetBackend's RLock ensures only one MoveNetRuntime is created
    even when multiple threads call analyze_frame() concurrently for the first time.

    **Validates: Requirement 2.6 — thread-safe lazy initialization**
    """
    from unittest.mock import patch, MagicMock as Mock

    from app.services.pose_analysis_runtime import PoseRuntimeConfig
    from app.services.pose_backends.movenet_backend import MoveNetBackend

    config = PoseRuntimeConfig(
        enabled=True,
        model_path="/fake/model.tflite",
        model_variant="thunder",
        min_confidence=0.3,
        sample_fps=5,
    )
    backend = MoveNetBackend(config=config)

    # Track how many times MoveNetRuntime is instantiated
    runtime_instance = Mock()
    runtime_instance.analyze_frame.return_value = {
        "model": {"name": "thunder", "input_size": 256},
        "keypoints": [{"name": "nose", "x": 0.5, "y": 0.5, "score": 0.9}],
    }
    instantiation_count = {"n": 0}
    instantiation_lock = threading.Lock()

    def mock_runtime_factory(*args, **kwargs):
        with instantiation_lock:
            instantiation_count["n"] += 1
        return runtime_instance

    num_threads = 10
    barrier = threading.Barrier(num_threads)
    exceptions_list = []

    def worker():
        try:
            barrier.wait(timeout=5)
            backend.analyze_frame(Mock())
        except Exception as exc:
            exceptions_list.append(exc)

    with patch(
        "app.services.pose_backends.movenet_backend.MoveNetRuntime",
        side_effect=mock_runtime_factory,
    ):
        threads = [threading.Thread(target=worker) for _ in range(num_threads)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)

    assert exceptions_list == [], f"Unexpected exceptions: {exceptions_list}"
    assert instantiation_count["n"] == 1, (
        f"MoveNetRuntime was instantiated {instantiation_count['n']} times, "
        f"expected exactly 1 (thread-safe lazy init)"
    )
