# Backend (FastAPI)

## Setup
1. Copy `.env.example` to `.env` and fill your Supabase values.
2. Create and activate a venv.
3. Install deps:

```bash
pip install -r requirements.txt
```

## Run

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Notes
- Auth: frontend uses Supabase Auth; pass `Authorization: Bearer <access_token>` to backend.
- Role comes from `public.profiles.role` (`user` or `authority`).

