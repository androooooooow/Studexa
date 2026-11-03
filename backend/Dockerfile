FROM python:3.12-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    AI_PROVIDER=cloudflare \
    CLOUDFLARE_MODEL=@cf/google/gemma-7b-it

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application
COPY app/ ./app/

# Ensure storage directories exist
RUN mkdir -p /opt/studymate/storage/database \
             /opt/studymate/storage/uploads \
             /opt/studymate/storage/generated

EXPOSE 8000

# Run uvicorn binding to Render's dynamic $PORT
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
