from pathlib import Path

import joblib
from catboost import Pool

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
        self.schema = load_feature_schema(
            SCHEMA_PATH
        )

        package = joblib.load(
            MODEL_PATH
        )

        if isinstance(package, dict):
            self.model = package["model"]
            self.model_columns = package.get(
                "feature_columns"
            )
        else:
            self.model = package
            self.model_columns = None

        if not self.model_columns:
            self.model_columns = list(
                getattr(
                    self.model,
                    "feature_names_in_",
                    []
                )
            )

        if not hasattr(
            self.model,
            "predict_proba"
        ):
            raise RuntimeError(
                "Model must provide predict_proba()"
            )

        if not self.model_columns:
            raise RuntimeError(
                "Model feature columns could not be determined"
            )

        classes = list(
            self.model.classes_
        )

        if 1 not in classes:
            raise RuntimeError(
                "Model does not contain positive class 1"
            )

        self.positive_index = classes.index(
            1
        )

        print(
            "Model loaded successfully"
        )

        print(
            f"Model type: {type(self.model).__name__}"
        )

        print(
            f"Features: {self.model_columns}"
        )

        if hasattr(
            self.model,
            "get_feature_importance"
        ):
            print(
                "SHAP explanations: enabled"
            )
        else:
            print(
                "SHAP explanations: unavailable for this model"
            )

    # =========================================================
    # PREDICTION
    # =========================================================

    def predict(
        self,
        raw_features
    ):
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
            probabilities = (
                self.model.predict_proba(
                    frame
                )[0]
            )

            probability = float(
                probabilities[
                    self.positive_index
                ]
            )

        except Exception as error:
            raise RuntimeError(
                f"Model prediction failed: {error}"
            ) from error

        result = self._format_prediction(
            probability
        )

        result["factors"] = (
            self._get_feature_contributions(
                frame,
                features
            )
        )

        return result

    def predict_batch(
        self,
        raw_features_list
    ):
        if not raw_features_list:
            return []

        validated = [
            validate_features(
                features,
                self.schema
            )
            for features in raw_features_list
        ]

        frame = build_model_frame_batch(
            validated,
            self.schema,
            self.model_columns,
        )

        try:
            probabilities = (
                self.model.predict_proba(
                    frame
                )
            )

        except Exception as error:
            raise RuntimeError(
                f"Batch model prediction failed: {error}"
            ) from error

        explanations = (
            self._get_feature_contributions_batch(
                frame,
                validated
            )
        )

        results = []

        for index, row in enumerate(
            probabilities
        ):
            probability = float(
                row[
                    self.positive_index
                ]
            )

            result = self._format_prediction(
                probability
            )

            result["factors"] = (
                explanations[index]
            )

            results.append(
                result
            )

        return results

    # =========================================================
    # BASIC PREDICTION FORMAT
    # =========================================================

    def _format_prediction(
        self,
        probability
    ):
        return {
            "probability": probability,
            "risk_score": int(
                round(
                    probability * 100
                )
            ),
            "model_version": self.schema.get(
                "model_version",
                "v1"
            ),
        }

    # =========================================================
    # CREATE CATBOOST POOL FOR SHAP
    # =========================================================

    def _build_shap_pool(
        self,
        frame
    ):
        """
        Build a CatBoost Pool specifically for SHAP.

        CatBoost requires Pool input for this
        get_feature_importance(..., type="ShapValues")
        operation.
        """

        categorical_columns = []

        for definition in self.schema["features"]:
            if (
                definition["type"]
                != "categorical"
            ):
                continue

            model_column = definition.get(
                "model_column"
            )

            if (
                model_column and
                model_column in self.model_columns
            ):
                categorical_columns.append(
                    model_column
                )

        categorical_indices = [
            self.model_columns.index(
                column
            )
            for column in categorical_columns
        ]

        return Pool(
            data=frame,
            cat_features=categorical_indices,
        )

    # =========================================================
    # SHAP CONTRIBUTIONS
    # =========================================================

    def _get_feature_contributions(
        self,
        frame,
        raw_features
    ):
        results = (
            self._get_feature_contributions_batch(
                frame,
                [raw_features]
            )
        )

        if not results:
            return []

        return results[0]

    def _get_feature_contributions_batch(
        self,
        frame,
        raw_features_list
    ):
        """
        Return the strongest feature contributions
        for every prediction.

        Positive SHAP contribution:
            pushes prediction toward higher risk.

        Negative SHAP contribution:
            pushes prediction toward lower risk.

        The final SHAP column is CatBoost's expected/base
        value, so it is intentionally excluded.
        """

        if not hasattr(
            self.model,
            "get_feature_importance"
        ):
            return [
                []
                for _ in raw_features_list
            ]

        try:
            shap_pool = (
                self._build_shap_pool(
                    frame
                )
            )

            shap_values = (
                self.model.get_feature_importance(
                    data=shap_pool,
                    type="ShapValues"
                )
            )

        except Exception as error:
            print(
                f"SHAP explanation failed: {error}"
            )

            return [
                []
                for _ in raw_features_list
            ]

        if shap_values is None:
            return [
                []
                for _ in raw_features_list
            ]

        results = []

        feature_count = len(
            self.model_columns
        )

        for (
            row_index,
            raw_features
        ) in enumerate(
            raw_features_list
        ):
            row_values = shap_values[
                row_index
            ]

            factors = []

            absolute_total = 0.0

            for feature_index in range(
                min(
                    feature_count,
                    len(row_values)
                )
            ):
                absolute_total += abs(
                    float(
                        row_values[
                            feature_index
                        ]
                    )
                )

            for (
                feature_index,
                feature_name
            ) in enumerate(
                self.model_columns
            ):
                if (
                    feature_index >=
                    len(row_values)
                ):
                    continue

                contribution = float(
                    row_values[
                        feature_index
                    ]
                )

                raw_value = (
                    self._get_raw_feature_value(
                        raw_features,
                        feature_name
                    )
                )

                if contribution > 0:
                    direction = (
                        "increases_risk"
                    )
                elif contribution < 0:
                    direction = (
                        "decreases_risk"
                    )
                else:
                    direction = "neutral"

                relative_contribution_pct = (
                    (
                        abs(
                            contribution
                        )
                        /
                        absolute_total
                        *
                        100
                    )
                    if absolute_total > 0
                    else 0
                )

                factors.append(
                    {
                        "key": feature_name,
                        "name": self._pretty_feature_name(
                            feature_name
                        ),
                        "value": raw_value,
                        "contribution": round(
                            contribution,
                            6
                        ),
                        "direction": direction,
                        "relative_contribution_pct": round(
                            relative_contribution_pct,
                            2
                        ),
                        "unit": self._feature_unit(
                            feature_name
                        ),
                    }
                )

            # Strongest model contributors first.
            factors.sort(
                key=lambda item: abs(
                    item["contribution"]
                ),
                reverse=True
            )

            # Return the strongest five factors.
            results.append(
                factors[:5]
            )

        return results

    # =========================================================
    # RAW FEATURE VALUE
    # =========================================================

    def _get_raw_feature_value(
        self,
        raw_features,
        feature_name
    ):
        """
        Convert model column names back to the API
        feature names used by Node.
        """

        aliases = {
            "rainfall_24h_intensity":
                "rainfall_24h_mm",
        }

        raw_name = aliases.get(
            feature_name,
            feature_name
        )

        value = raw_features.get(
            raw_name
        )

        if value is None:
            return None

        if isinstance(
            value,
            bool
        ):
            return value

        if isinstance(
            value,
            (int, float)
        ):
            return float(value)

        return value

    # =========================================================
    # DISPLAY NAMES
    # =========================================================

    def _pretty_feature_name(
        self,
        feature_name
    ):
        names = {
            "elevation_m":
                "Elevation",

            "slope_deg":
                "Slope",

            "fault_distance_m":
                "Fault Distance",

            "rainfall_3d_mm":
                "3-Day Rainfall",

            "rainfall_24h_intensity":
                "24-Hour Rainfall",

            "rainfall_24h_mm":
                "24-Hour Rainfall",

            "soil_moisture_pct":
                "Soil Moisture",

            "lithology":
                "Lithology",
        }

        return names.get(
            feature_name,
            feature_name.replace(
                "_",
                " "
            ).title()
        )

    # =========================================================
    # UNITS
    # =========================================================

    def _feature_unit(
        self,
        feature_name
    ):
        units = {
            "elevation_m":
                "m",

            "slope_deg":
                "°",

            "fault_distance_m":
                "m",

            "rainfall_3d_mm":
                "mm",

            "rainfall_24h_intensity":
                "mm",

            "rainfall_24h_mm":
                "mm",

            "soil_moisture_pct":
                "%",

            "lithology":
                "",
        }

        return units.get(
            feature_name,
            ""
        )


# =============================================================
# SINGLETON PREDICTOR
# =============================================================

_predictor = None


def initialize_predictor():
    global _predictor

    if _predictor is None:
        _predictor = ModelPredictor()

    return _predictor


def get_predictor():
    return initialize_predictor()