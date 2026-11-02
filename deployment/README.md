# StudyMate AI — OCI Deployment Guide

Target Infrastructure:
- **VM**: OCI Always Free Ampere A1 Flex (Ubuntu 24.04 ARM64, 2 OCPUs, 12 GB RAM)
- **Persistent Storage**: `/opt/studymate/storage/{uploads,generated,database}`
- **AI Engine**: Ollama (`127.0.0.1:11434`) running `gemma3:1b`
- **Backend**: FastAPI + Uvicorn (`127.0.0.1:8000`, `--workers 1`)
- **Reverse Proxy**: Caddy (HTTPS on ports 80/443)

## Setup Steps

1. Create persistent directories:
   ```bash
   sudo mkdir -p /opt/studymate/storage/uploads /opt/studymate/storage/generated /opt/studymate/storage/database
   sudo chown -R ubuntu:ubuntu /opt/studymate
   ```
2. Configure Ollama (`sudo systemctl edit ollama.service`):
   ```ini
   [Service]
   Environment="OLLAMA_HOST=127.0.0.1:11434"
   Environment="OLLAMA_NUM_PARALLEL=1"
   Environment="OLLAMA_MAX_LOADED_MODELS=1"
   Environment="OLLAMA_MAX_QUEUE=10"
   Environment="OLLAMA_KEEP_ALIVE=10m"
   ```
   Then run `ollama pull gemma3:1b`.
3. Install `studymate-api.service` to `/etc/systemd/system/studymate-api.service` and enable it.
4. Copy `Caddyfile` to `/etc/caddy/Caddyfile`, replace `YOUR-API-DOMAIN`, and reload Caddy.
