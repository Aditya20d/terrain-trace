# TerrainTrace

Real-time landslide hazard prediction and terrain monitoring system.

## Project Structure

- **`frontend/`**: React + Vite + Leaflet mapping interface.
- **`backend/`**: Node.js / Express API gateway orchestrating environmental data (OpenTopography DEM, GEM fault data, Open-Meteo weather).
- **`ml-service/`**: Python FastAPI microservice running CatBoost inference (`model.joblib`).

---

## Quick Start

You can start all three services together using either the batch file or PowerShell script located in this folder:

### Option 1: Batch File (Double-click or Terminal)
Double-click [`start.bat`](file:///c:/Users/aarus/TerrainTrace3/terrain-trace/TerrainTrace/start.bat) or run:
```cmd
start.bat
```

### Option 2: PowerShell Script
```powershell
.\start.ps1
```
*Tip: Pass `-Install` to force reinstall/update dependencies: `.\start.ps1 -Install`*

---

## Services & Ports

| Service | Port | Local URL |
| :--- | :--- | :--- |
| **Frontend UI** | `5173` | [http://localhost:5173](http://localhost:5173) |
| **Backend API** | `5000` | [http://localhost:5000](http://localhost:5000) (`/api/health`) |
| **ML Service** | `5001` | [http://127.0.0.1:5001](http://127.0.0.1:5001) (`/health`, `/docs`) |

