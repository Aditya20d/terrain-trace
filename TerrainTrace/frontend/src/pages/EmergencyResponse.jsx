function EmergencyResponse() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8">
        <p className="text-sm font-medium uppercase tracking-wider text-red-400">
          Emergency Management
        </p>

        <h1 className="mt-2 text-3xl font-bold">
          Emergency Response Prioritisation
        </h1>

        <p className="mt-3 max-w-3xl text-slate-400">
          Identify areas requiring attention based on
          landslide risk and accessibility conditions.
        </p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        <div className="flex flex-wrap gap-3">
          <PriorityBadge
            label="Critical"
            className="bg-red-500/10 text-red-400"
          />

          <PriorityBadge
            label="High"
            className="bg-orange-500/10 text-orange-400"
          />

          <PriorityBadge
            label="Moderate"
            className="bg-yellow-500/10 text-yellow-400"
          />
        </div>

        <div className="mt-6 overflow-hidden rounded-lg border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-950 text-slate-400">
              <tr>
                <th className="px-4 py-3">
                  Priority
                </th>

                <th className="px-4 py-3">
                  Location
                </th>

                <th className="px-4 py-3">
                  Risk
                </th>

                <th className="px-4 py-3">
                  Road Status
                </th>

                <th className="px-4 py-3">
                  Action
                </th>
              </tr>
            </thead>

            <tbody>
              <tr className="border-t border-slate-800">
                <td
                  colSpan="5"
                  className="px-4 py-12 text-center text-slate-500"
                >
                  Emergency response priorities will
                  appear here when prediction and road
                  data are connected.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PriorityBadge({
  label,
  className,
}) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold ${className}`}
    >
      {label}
    </span>
  );
}

export default EmergencyResponse;