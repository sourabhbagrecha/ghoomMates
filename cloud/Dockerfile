# One image for both Cloud Run services; SERVICE=indexer or SERVICE=search picks the app.
# Python 3.12: supported by TensorFlow 2.21, tf-keras 2.21 and deepface 0.0.103 (pins in requirements.txt).
FROM python:3.12-slim-bookworm AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    # Model weights live in the image: $DEEPFACE_HOME/.deepface/weights
    DEEPFACE_HOME=/opt/deepface \
    # deepface 0.0.103 can run on TensorFlow, PyTorch or ONNX. Force TensorFlow: same engine as the notebook.
    DEEPFACE_BACKEND_ENGINE=tensorflow \
    TF_CPP_MIN_LOG_LEVEL=2 \
    TF_ENABLE_ONEDNN_OPTS=0 \
    PORT=8080

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY faces ./faces

# Download and load both models once at build time, so cold starts don't fetch about 215 MB.
RUN python -m faces.warmup \
    && chmod -R a+rX "$DEEPFACE_HOME" \
    && useradd --system --uid 10001 --home-dir /app app

USER app
EXPOSE 8080

# One worker, one thread: Cloud Run concurrency is 1 and TensorFlow uses the CPUs itself.
# --timeout 0 leaves request timeouts to Cloud Run. No --preload: TensorFlow must not be loaded before a fork.
CMD exec gunicorn --bind ":${PORT}" --workers 1 --threads 1 --timeout 0 --graceful-timeout 20 faces.main:app


# Test image: runtime plus pytest, tests and scripts. Used by docker compose; never deployed.
FROM runtime AS test
USER root
COPY requirements-dev.txt .
RUN pip install --no-cache-dir -r requirements-dev.txt
COPY tests ./tests
COPY scripts ./scripts
COPY pytest.ini .
USER app
CMD ["pytest", "-v"]
