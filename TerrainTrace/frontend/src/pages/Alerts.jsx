function Alerts() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <p className="mb-2 text-sm font-medium uppercase tracking-wider text-orange-400">
          Monitoring
        </p>

        <h1 className="text-3xl font-bold">
          Landslide Alerts
        </h1>

        <p className="mt-3 text-slate-400">
          High-risk locations detected by the TerrainTrace
          prediction system will appear here.
        </p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-800 text-2xl">
          !
        </div>

        <h2 className="mt-4 text-xl font-semibold">
          Alert monitoring ready
        </h2>

        <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
          We will connect this page to the AI prediction
          results after the map and explanation system are
          finalized.
        </p>
      </div>
    </div>
  );
}

export default Alerts;