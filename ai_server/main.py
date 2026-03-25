from __future__ import annotations

from typing import Any, Optional

from fastapi import FastAPI
from pydantic import BaseModel


app = FastAPI(title="Smart Tourist Monitoring - AI Server (stub)", version="0.1.0")


class AnomalyCheckIn(BaseModel):
    user_id: str
    features: dict[str, Any]


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/anomaly/check")
async def anomaly_check(body: AnomalyCheckIn) -> dict[str, Any]:
    # Placeholder for future model inference.
    return {
        "user_id": body.user_id,
        "anomaly": False,
        "score": 0.0,
        "reason": "stub",
    }

