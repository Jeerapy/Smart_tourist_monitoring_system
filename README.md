# Smart_tourist_monitoring_system

## Folders
- `backend/`: FastAPI backend (core API)
- `ai_server/`: separate FastAPI service (AI stub for now)
- `supabase/`: SQL schema + RLS policies
- `web_smoketest/`: simple HTML page to test backend endpoints
- `frontend/`: Next.js test UI (login/register/dashboards)
- `PROJECT_OVERVIEW.md`: project working/reference

## Quick start (local)

### 1) Backend (FastAPI)
1. In `backend/`, copy `.env.example` to `.env` and fill Supabase URL + anon key.
2. Install Tesseract OCR on Windows and ensure `tesseract --version` works.
3. Run backend:

```bash
pip install -r backend/requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 2) Frontend (Next.js test UI)
1. In `frontend/`, copy `.env.local.example` to `.env.local` and fill values.
2. Install deps and run:

```bash
cd frontend
npm install
npm run dev
```

Open:
- `http://localhost:3000/register` → create user + insert profile row
- `http://localhost:3000/login` → login
- `http://localhost:3000/user/dashboard` → upload document (OCR), ping, SOS, view alerts
- `http://localhost:3000/authority/dashboard` → create zones, fetch nearby alerts, ack/resolve