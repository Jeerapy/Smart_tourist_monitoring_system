# AI server (anomaly detection)

Separate FastAPI service that:
- **Trains** an unsupervised anomaly model (IsolationForest) from recent `user_location_pings`
- Runs **hybrid inference**:
  - a **fast loop** aligned to your ping cadence (default **15s**)
  - a **batch loop** for longer windows (default **3 min**)
- Creates Supabase `alerts` rows of type `ANOMALY` with `source='ai'`

## Run

```bash
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8001
```

## Required env vars
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (service role key; used for batch read/write)

## AI tuning env vars (recommended defaults)
- `AI_ENABLED=true`
- `AI_FAST_INTERVAL_SEC=15`
- `AI_FAST_WINDOW_MINUTES=2`
- `AI_BATCH_INTERVAL_SEC=180`
- `AI_WINDOW_MINUTES=10`
- `AI_ALERT_DEDUP_SEC=180`
- `AI_MODEL_PATH=./model.joblib`
- `AI_MODEL_VERSION=iforest-v1`
- `AI_ANOMALY_THRESHOLD=0.65`

## Train the model (MVP)
Once you have some pings in Supabase, train the model:

```bash
curl -X POST "http://localhost:8001/train" ^
  -H "Content-Type: application/json" ^
  -d "{\"days\":7,\"window_minutes\":10,\"max_samples\":30000}"
```

This writes the model artifact to `AI_MODEL_PATH` (default `./model.joblib`).

## Force a single evaluation run (debug)
- Fast mode:

```bash
curl -X POST "http://localhost:8001/run/once?mode=fast"
```

- Batch mode:

```bash
curl -X POST "http://localhost:8001/run/once?mode=batch"
```

## Manual testing without database pings
If you want to test by directly sending sample ping points (without reading from Supabase),
use:

```bash
curl -X POST "http://localhost:8001/anomaly/check-from-pings" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "manual-test-user",
    "pings": [
      {"lat": 12.9716, "lng": 77.5946, "recorded_at": "2026-04-21T10:00:00Z", "accuracy_m": 8, "heading_deg": 10, "speed_mps": 1.2},
      {"lat": 12.9718, "lng": 77.5950, "recorded_at": "2026-04-21T10:00:15Z", "accuracy_m": 8, "heading_deg": 18, "speed_mps": 1.4},
      {"lat": 12.9721, "lng": 77.5955, "recorded_at": "2026-04-21T10:00:30Z", "accuracy_m": 9, "heading_deg": 20, "speed_mps": 1.8}
    ]
  }'
```

The response includes:
- computed feature vector
- anomaly score
- threshold comparison
- anomaly true/false

## Verify in the UI
Once AI alerts are created, open the authority dashboard and filter by **ANOMALY**. The alert summary will include the anomaly score.

