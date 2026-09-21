import { NavLink } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";

const navItems = [
  {
    key: "nav.riskMap",
    path: "/map",
  },
  {
    key: "nav.roadConnectivity",
    path: "/roads",
  },
  {
    key: "nav.weatherForecast",
    path: "/weather",
  },
  {
    key: "nav.emergencyResponse",
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
  {
    code: "mni",
    name: "মৈতৈলোন্ (Manipuri)",
  },
  {
    code: "lus",
    name: "Mizo ṭawng",
  },
  {
    code: "kha",
    name: "Ka Ktien Khasi",
  },
  {
    code: "grt",
    name: "A·chik (Garo)",
  },
  {
    code: "trp",
    name: "Kokborok",
  },
];

function Navbar() {
  const { language, setLanguage, t } =
    useLanguage();

  function handleLanguageChange(
    event
  ) {
    setLanguage(event.target.value);
  }

  return (
    <header className="sticky top-0 z-[2000] h-16 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
      <div className="mx-auto flex h-full max-w-[1600px] items-center justify-between gap-4 px-4">
        {/* Brand */}
        <NavLink
          to="/map"
          className="flex shrink-0 items-center gap-3"
        >
          <img
            src="/terraintrace-logo.png"
            alt="TerrainTrace"
            className="h-9 w-auto rounded-lg object-contain"
          />
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
                {t(item.key)}
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