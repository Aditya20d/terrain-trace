import axios from "axios";

const API = axios.create({
  baseURL: "http://localhost:5000/api",
  timeout: 120000,
});

export async function getRiskPrediction(lat, lon, signal) {
  const response = await API.post(
    "/risk/predict",
    { lat, lon },
    { signal }
  );

  return response.data;
}

export async function getBatchRiskPredictions(points, signal) {
  const response = await API.post(
    "/risk/predict-batch",
    { points },
    { signal }
  );

  return response.data.results;
}
