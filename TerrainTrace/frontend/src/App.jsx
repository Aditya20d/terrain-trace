import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import Navbar from "./components/Navbar";

import MapPage from "./pages/MapPage";
import RoadConnectivity from "./pages/RoadConnectivity";
import WeatherForecast from "./pages/WeatherForecast";
import EmergencyResponse from "./pages/EmergencyResponse";

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-950 text-white">
        <Navbar />

        <main className="min-h-[calc(100vh-64px)]">
          <Routes>
            <Route
              path="/"
              element={
                <Navigate
                  to="/map"
                  replace
                />
              }
            />

            <Route
              path="/map"
              element={<MapPage />}
            />

            <Route
              path="/roads"
              element={
                <RoadConnectivity />
              }
            />

            <Route
              path="/weather"
              element={
                <WeatherForecast />
              }
            />

            <Route
              path="/emergency"
              element={
                <EmergencyResponse />
              }
            />

            <Route
              path="*"
              element={
                <Navigate
                  to="/map"
                  replace
                />
              }
            />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;