# Backend Dockerfile
FROM python:3.13-slim

WORKDIR /app

# Install system dependencies (libgl1 for OpenCV headless)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc libgl1 libglib2.0-0 curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install MoveNet inference dependencies
RUN pip install --no-cache-dir \
    ai-edge-litert \
    opencv-python-headless \
    numpy

# Download the MoveNet Lightning model. TF Hub answers GET but returns 404 for HEAD,
# so the download must use `-f` plus a flatbuffer magic check: without them a failed
# fetch bakes an unusable file into the image and every analysis request silently fails.
# float16 (not int8) because the runtime parses float keypoint output only.
RUN mkdir -p /app/models && \
    curl -fL --retry 3 --retry-delay 2 -o /app/models/movenet_lightning.tflite \
    "https://tfhub.dev/google/lite-model/movenet/singlepose/lightning/tflite/float16/4?lite-format=tflite" && \
    test "$(head -c 8 /app/models/movenet_lightning.tflite | tr -dc 'A-Za-z0-9')" = "TFL3" && \
    test "$(stat -c %s /app/models/movenet_lightning.tflite)" -gt 1000000

# Copy application code
COPY app/ ./app/
COPY scripts/ ./scripts/
# The exercise catalog is seeded from data/external; without it `scripts.seed_data`
# fails inside the container, so the dataset must ship with the image.
COPY data/ ./data/
COPY alembic.ini ./
COPY alembic/ ./alembic/

# Create directories for uploads and logs
RUN mkdir -p uploads/videos logs

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
