from pathlib import Path

import joblib

from schemas import (
    build_model_frame,
    build_model_frame_batch,
    load_feature_schema,
    validate_features,
)

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "model.joblib"
SCHEMA_PATH = BASE_DIR / "feature_schema.json"


class ModelPredictor:
    def __init__(self):
        self.schema = load_feature_schema(SCHEMA_PATH)
        package = joblib.load(MODEL_PATH)

        if isinstance(package, dict):
            self.model = package["model"]
            self.model_columns = package.get("feature_columns")
        else:
            self.model = package
            self.model_columns = None

        if not self.model_columns:
            self.model_columns = list(
                getattr(self.model, "feature_names_in_", [])
            )

        if not hasattr(self.model, "predict_proba"):
            raise RuntimeError(
                "Model must provide predict_proba()"
            )

        if not self.model_columns:
            raise RuntimeError(
                "Model feature columns could not be determined"
            )

        classes = list(self.model.classes_)
        if 1 not in classes:
            raise RuntimeError(
                "Model does not contain positive class 1"
            )

        self.positive_index = classes.index(1)

        print("Model loaded successfully")
        print(
            f"Model type: {type(self.model).__name__}"
        )
        print(
            f"Features: {self.model_columns}"
        )

    def predict(self, raw_features):
        features = validate_features(
            raw_features,
            self.schema,
        )
        frame = build_model_frame(
            features,
            self.schema,
            self.model_columns,
        )

        try:
            probabilities = self.model.predict_proba(frame)[0]
            probability = float(
                probabilities[self.positive_index]
            )
        except Exception as error:
            raise RuntimeError(
                f"Model prediction failed: {error}"
            ) from error

        return self._format_prediction(probability)

    def predict_batch(self, raw_features_list):
        if not raw_features_list:
            return []

        validated = [
            validate_features(features, self.schema)
            for features in raw_features_list
        ]

        frame = build_model_frame_batch(
            validated,
            self.schema,
            self.model_columns,
        )

        try:
            probabilities = self.model.predict_proba(frame)
        except Exception as error:
            raise RuntimeError(
                f"Batch model prediction failed: {error}"
            ) from error

        return [
            self._format_prediction(
                float(row[self.positive_index])
            )
            for row in probabilities
        ]

    def _format_prediction(self, probability):
        return {
            "probability": probability,
            "risk_score": int(round(probability * 100)),
            "model_version": self.schema.get(
                "model_version", "v1"
            ),
        }


_predictor = None


def initialize_predictor():
    global _predictor
    if _predictor is None:
        _predictor = ModelPredictor()
    return _predictor


def get_predictor():
    return initialize_predictor()
