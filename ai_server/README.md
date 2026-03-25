# AI server (stub)

Separate FastAPI service intended to host the anomaly detection model later.

## Run

```bash
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8001
```

