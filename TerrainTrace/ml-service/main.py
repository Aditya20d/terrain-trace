from typing import Any, Dict, List

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from predictor import initialize_predictor, get_predictor

app = FastAPI(
    title="TerrainTrace ML Service",
    version="1.0.0",
)


class PredictionRequest(BaseModel):
    features: Dict[str, Any]


class BatchPredictionRequest(BaseModel):
    points: List[Dict[str, Any]]


@app.on_event("startup")
def startup_event():
    # Load CatBoost once at service startup rather than on the first request.
    initialize_predictor()


@app.get("/health")
def health():
    try:
        predictor = get_predictor()
        return {
            "status": "ok",
            "model_ready": True,
            "model_version": predictor.schema.get(
                "model_version", "v1"
            ),
        }
    except Exception as error:
        return {
            "status": "error",
            "model_ready": False,
            "error": str(error),
        }


@app.post("/predict")
def predict(request: PredictionRequest):
    try:
        return get_predictor().predict(
            request.features
        )
    except Exception as error:
        raise HTTPException(
            status_code=422,
            detail=str(error),
        ) from error


@app.post("/predict_batch")
def predict_batch(request: BatchPredictionRequest):
    if not request.points:
        raise HTTPException(
            status_code=400,
            detail="points cannot be empty",
        )

    if len(request.points) > 200:
        raise HTTPException(
            status_code=400,
            detail="maximum 200 points per request",
        )

    try:
        results = get_predictor().predict_batch(
            request.points
        )
        return {"results": results}
    except Exception as error:
        raise HTTPException(
            status_code=422,
            detail=str(error),
        ) from error
