import axios from "axios";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:5000/api";

const API = axios.create({
  baseURL: API_BASE_URL,
  timeout: 120000,
});

export async function getRiskPrediction(
  lat,
  lon,
  signal
) {
  const response =
    await API.post(
      "/risk/predict",
      { lat, lon },
      { signal }
    );

  return response.data;
}

export async function getBatchRiskPredictions(
  points,
  signal
) {
  const response =
    await API.post(
      "/risk/predict-batch",
      { points },
      { signal }
    );

  return response.data.results;
}
