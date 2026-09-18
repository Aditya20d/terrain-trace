const axios = require("axios");

const ML_SERVICE_URL =
  process.env.ML_SERVICE_URL ||
  "http://127.0.0.1:5001";

async function predict(features) {
  const response = await axios.post(
    `${ML_SERVICE_URL}/predict`,
    { features },
    { timeout: 30000 }
  );

  return response.data;
}

async function predictBatch(featuresList) {
  const response = await axios.post(
    `${ML_SERVICE_URL}/predict_batch`,
    { points: featuresList },
    { timeout: 60000 }
  );

  return response.data.results;
}

module.exports = {
  predict,
  predictBatch,
};
