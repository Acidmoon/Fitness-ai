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

# Download MoveNet Lightning model (~7MB, optimized for low-resource servers)
RUN mkdir -p /app/models && \
    curl -L -o /app/models/movenet_lightning.tflite \
    "https://tfhub.dev/google/lite-model/movenet/singlepose/lightning/tflite/int8/4?lite-format=tflite"

# Copy application code
COPY app/ ./app/
COPY scripts/ ./scripts/

# Create directories for uploads and logs
RUN mkdir -p uploads/videos logs

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
