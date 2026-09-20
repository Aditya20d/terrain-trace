import { NavLink } from "react-router-dom";
import { useState } from "react";

const navItems = [
  {
    name: "Risk Map",
    path: "/map",
  },
  {
    name: "Road Connectivity",
    path: "/roads",
  },
  {
    name: "Weather Forecast",
    path: "/weather",
  },
  {
    name: "Emergency Response",
    path: "/emergency",
  },
];

const languages = [
  {
    code: "en",
    name: "English",
  },
  {
    code: "hi",
    name: "हिन्दी",
  },
  {
    code: "as",
    name: "অসমীয়া",
  },
  {
    code: "bn",
    name: "বাংলা",
  },
  {
    code: "ne",
    name: "नेपाली",
  },
];

function Navbar() {
  const [
    language,
    setLanguage,
  ] = useState(
    localStorage.getItem(
      "terraintrace-language"
    ) || "en"
  );

  function handleLanguageChange(
    event
  ) {
    const value =
      event.target.value;

    setLanguage(value);

    localStorage.setItem(
      "terraintrace-language",
      value
    );

    /*
     * Full translation state will be connected
     * to the application UI in the next step.
     */
  }

  return (
    <header className="sticky top-0 z-[2000] h-16 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
      <div className="mx-auto flex h-full max-w-[1600px] items-center justify-between gap-4 px-4">
        {/* Brand */}
        <NavLink
          to="/map"
          className="flex shrink-0 items-center gap-3"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold">
            TT
          </div>

          <div className="hidden sm:block">
            <div className="text-lg font-bold">
              TerrainTrace
            </div>

            <div className="text-[9px] uppercase tracking-[0.18em] text-slate-500">
              Landslide Early Warning
            </div>
          </div>
        </NavLink>

        {/* Navigation */}
        <nav className="flex min-w-0 items-center gap-1 overflow-x-auto">
          {navItems.map(
            (item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  [
                    "whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition",
                    isActive
                      ? "bg-blue-600 text-white"
                      : "text-slate-400 hover:bg-slate-800 hover:text-white",
                  ].join(" ")
                }
              >
                {item.name}
              </NavLink>
            )
          )}
        </nav>

        {/* Language */}
        <div className="shrink-0">
          <select
            value={language}
            onChange={
              handleLanguageChange
            }
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500"
            aria-label="Language"
          >
            {languages.map(
              (item) => (
                <option
                  key={item.code}
                  value={item.code}
                >
                  {item.name}
                </option>
              )
            )}
          </select>
        </div>
      </div>
    </header>
  );
}

export default Navbar;