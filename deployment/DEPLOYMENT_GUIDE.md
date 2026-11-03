# Studexa AI — Cloud Deployment Guide

This guide details how to deploy **Studexa AI** across:
1. **Frontend**: [Vercel](https://vercel.com) (React 19 + Vite + Tailwind CSS)
2. **Backend**: [Render](https://render.com) (FastAPI + SQLite + PyMuPDF)
3. **AI Engine**: [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/) running **Google Gemma** (`@cf/google/gemma-7b-it`)

---

## Architecture Overview

```
┌──────────────────────────┐          ┌──────────────────────────┐
│     Vercel Frontend      │  HTTPS   │      Render Backend      │
│  (React 19 + Vite SPA)   ├─────────►│    (FastAPI + SQLite)    │
│  studexa.vercel.app      │  REST    │  studexa-api.onrender.com│
└──────────────────────────┘          └────────────┬─────────────┘
                                                   │
                                                   │ Workers AI REST API
                                                   ▼
                                      ┌──────────────────────────┐
                                      │   Cloudflare Workers AI  │
                                      │    Google Gemma Models   │
                                      │   (@cf/google/gemma-*)   │
                                      └──────────────────────────┘
```

---

## 1. Cloudflare Workers AI Setup (Google Gemma)

Cloudflare Workers AI provides serverless GPU inference for open-weights models, eliminating the need to run heavy local Ollama instances on your Render server.

### Steps to get credentials:
1. Log in to your [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. In the right-hand sidebar or URL, copy your **Account ID** (a 32-character hex string).
3. Go to **Manage Account** > **API Tokens** > **Create Token**.
4. Select the **Workers AI** template (Read/Run permissions on Workers AI) or create a custom token with:
   - Account: `Workers AI` -> `Read`, `Edit`
5. Copy the generated **API Token**.

### Supported Google Gemma Models:
- `@cf/google/gemma-7b-it` *(Default: balanced speed, accuracy, and reasoning)*
- `@cf/google/gemma-2-9b-it` *(Gemma 2 instruction tuned)*
- `@cf/google/gemma-2-27b-it` *(High reasoning fidelity)*
- `@cf/google/gemma-4-26b-a4b-it` *(Latest MoE reasoning model)*

---

## 2. Backend Deployment on Render

### Method A: Deploy via Blueprint (`render.yaml`) — Recommended
1. Push your repository to GitHub.
2. In Render Dashboard, click **New +** > **Blueprint**.
3. Connect your GitHub repository. Render reads `render.yaml` automatically.
4. Fill in the sensitive environment variables when prompted:
   - `CLOUDFLARE_ACCOUNT_ID`: Your Cloudflare Account ID
   - `CLOUDFLARE_API_TOKEN`: Your Cloudflare API Token
5. Click **Apply**.

### Method B: Deploy as a Web Service Manually
1. In Render Dashboard, click **New +** > **Web Service**.
2. Connect your GitHub repository.
3. Select **Docker** environment:
   - **Root Directory**: leave blank (or `backend`)
   - **Dockerfile Path**: `backend/Dockerfile`
   - **Docker Context**: `backend`
4. Choose your Plan (Free or Starter).
   - *Note: On Starter plan ($7/mo), you can attach a Persistent Disk (`/opt/studymate/storage`) to persist SQLite database and documents across deploys.*
5. In **Environment Variables**, add:
   | Variable | Value | Notes |
   |---|---|---|
   | `ENVIRONMENT` | `production` | Production mode |
   | `AI_PROVIDER` | `cloudflare` | Routes AI calls to Cloudflare |
   | `CLOUDFLARE_ACCOUNT_ID` | `<your-account-id>` | Cloudflare 32-character ID |
   | `CLOUDFLARE_API_TOKEN` | `<your-api-token>` | Cloudflare Workers AI Token |
   | `CLOUDFLARE_MODEL` | `@cf/google/gemma-7b-it` | Google Gemma model |
   | `CORS_ORIGINS` | `https://*.vercel.app,http://localhost:5173` | Allowed frontend origins |
   | `DATABASE_URL` | `sqlite:////opt/studymate/storage/database/studymate.db` | SQLite DB path |
   | `UPLOAD_DIR` | `/opt/studymate/storage/uploads` | Document uploads |
   | `GENERATED_DIR` | `/opt/studymate/storage/generated` | Exported PDFs |
   | `AI_MAX_CONCURRENT` | `2` | Concurrent AI worker jobs |
   | `AI_MAX_QUEUE` | `20` | Max queued jobs |
6. Click **Deploy Web Service**.
7. Once deployed, test the health check:
   ```bash
   curl https://<your-render-app>.onrender.com/api/health
   ```
   Expected response:
   ```json
   {
     "status": "ok",
     "app_name": "Studexa AI",
     "environment": "production",
     "database": "connected",
     "ai_provider": "cloudflare",
     "ai_model": "@cf/google/gemma-7b-it"
   }
   ```

---

## 3. Frontend Deployment on Vercel

### Steps to Deploy:
1. Log in to [Vercel](https://vercel.com) and click **Add New...** > **Project**.
2. Import your GitHub repository.
3. Configure Project Settings:
   - **Framework Preset**: `Vite`
   - **Root Directory**: Click `Edit` and select `frontend` (or leave as root, root `vercel.json` will build frontend).
   - **Build Command**: `npm run build` (or leave default `vite build`)
   - **Output Directory**: `dist`
4. In **Environment Variables**, add:
   | Name | Value |
   |---|---|
   | `VITE_API_BASE_URL` | `https://<your-render-app>.onrender.com` |
   *(Do NOT include a trailing slash in `VITE_API_BASE_URL`)*
5. Click **Deploy**.

### Verification Checklist:
- [ ] Visit `https://<your-project>.vercel.app/`
- [ ] Upload a PDF/DOCX lecture file or paste study text.
- [ ] Generate a Summary, Quiz, Reviewer, or Flashcards.
- [ ] The Render backend receives the request, processes chunks via SQLite FTS5, calls Cloudflare Workers AI Gemma, and delivers the validated output back to the student!
