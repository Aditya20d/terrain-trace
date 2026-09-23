import { useState, useEffect, useRef } from "react";
import { useLanguage } from "../i18n/LanguageContext";

const STORAGE_KEY = "terraintrace-landslide-reports";

function loadReports() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveReports(reports) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
}

const SEVERITY_OPTIONS = ["low", "moderate", "high", "veryHigh"];

function ReportLandslide() {
  const { t } = useLanguage();
  const fileInputRef = useRef(null);

  const [reports, setReports] = useState(() => loadReports());
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState("");

  // Form fields
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [severity, setSeverity] = useState("high");
  const [description, setDescription] = useState("");
  const [reporterName, setReporterName] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [images, setImages] = useState([]);
  const [formError, setFormError] = useState("");

  // Expanded report
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    saveReports(reports);
  }, [reports]);

  function handleImageChange(event) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const maxFiles = 5;
    const currentCount = images.length;
    const allowed = files.slice(0, maxFiles - currentCount);

    allowed.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImages((prev) => {
          if (prev.length >= maxFiles) return prev;
          return [...prev, { name: file.name, dataUrl: e.target.result }];
        });
      };
      reader.readAsDataURL(file);
    });
  }

  function removeImage(index) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  function handleGetLocation() {
    if (!navigator.geolocation) {
      setFormError(t("report.geolocationUnavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude.toFixed(6));
        setLongitude(position.coords.longitude.toFixed(6));
        setFormError("");
      },
      () => {
        setFormError(t("report.geolocationDenied"));
      }
    );
  }

  function handleSubmit(event) {
    event.preventDefault();
    setFormError("");

    const lat = Number(latitude);
    const lon = Number(longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      setFormError(t("report.invalidCoords"));
      return;
    }

    if (!description.trim()) {
      setFormError(t("report.descriptionRequired"));
      return;
    }

    setSubmitting(true);

    const report = {
      id: `report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      latitude: lat,
      longitude: lon,
      severity,
      description: description.trim(),
      reporterName: reporterName.trim() || null,
      contactInfo: contactInfo.trim() || null,
      images: images.map((img) => ({ name: img.name, dataUrl: img.dataUrl })),
      createdAt: new Date().toISOString(),
    };

    setTimeout(() => {
      setReports((prev) => [report, ...prev]);
      setSubmitting(false);
      setSuccess(t("report.submitSuccess"));
      resetForm();
      setTimeout(() => setSuccess(""), 4000);
    }, 400);
  }

  function resetForm() {
    setLatitude("");
    setLongitude("");
    setSeverity("high");
    setDescription("");
    setReporterName("");
    setContactInfo("");
    setImages([]);
    setFormError("");
    setShowForm(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function deleteReport(id) {
    setReports((prev) => prev.filter((r) => r.id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }

  function getSeverityColor(sev) {
    switch (sev) {
      case "low": return "text-emerald-400 border-emerald-500/40 bg-emerald-500/10";
      case "moderate": return "text-yellow-400 border-yellow-500/40 bg-yellow-500/10";
      case "high": return "text-orange-400 border-orange-500/40 bg-orange-500/10";
      case "veryHigh": return "text-red-400 border-red-500/40 bg-red-500/10";
      default: return "text-slate-400 border-slate-600 bg-slate-800";
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <p className="text-sm font-medium uppercase tracking-wider text-cyan-400">
          {t("report.sectionLabel")}
        </p>
        <h1 className="mt-2 text-3xl font-bold text-white">
          {t("report.title")}
        </h1>
        <p className="mt-3 max-w-3xl text-slate-400">
          {t("report.description")}
        </p>
      </div>

      {/* Success banner */}
      {success && (
        <div className="mb-6 rounded-xl border border-emerald-800/60 bg-emerald-950/30 p-4 text-sm text-emerald-300">
          ✅ {success}
        </div>
      )}

      {/* New Report Button / Form */}
      {!showForm ? (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="mb-8 rounded-xl border-2 border-dashed border-slate-700 bg-slate-900/50 px-8 py-6 text-base font-medium text-cyan-400 transition hover:border-cyan-500/50 hover:bg-slate-900"
        >
          + {t("report.newReport")}
        </button>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="mb-8 rounded-xl border border-slate-800 bg-slate-900 p-6"
        >
          <h2 className="mb-6 text-xl font-semibold text-white">
            {t("report.newReport")}
          </h2>

          {formError && (
            <div className="mb-4 rounded-lg border border-red-800/60 bg-red-950/30 p-3 text-sm text-red-300">
              {formError}
            </div>
          )}

          {/* Location */}
          <div className="mb-6">
            <label className="mb-2 block text-sm font-medium text-slate-300">
              {t("report.location")} *
            </label>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="mb-1 block text-xs text-slate-500">{t("report.latitude")}</label>
                <input
                  type="number"
                  step="any"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  placeholder="e.g. 26.1445"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-2.5 text-white outline-none transition focus:border-cyan-400"
                  required
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs text-slate-500">{t("report.longitude")}</label>
                <input
                  type="number"
                  step="any"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  placeholder="e.g. 91.7362"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-2.5 text-white outline-none transition focus:border-cyan-400"
                  required
                />
              </div>
              <button
                type="button"
                onClick={handleGetLocation}
                className="shrink-0 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-slate-300 transition hover:border-cyan-500/50 hover:text-cyan-300"
              >
                📍 {t("report.useMyLocation")}
              </button>
            </div>
          </div>

          {/* Severity */}
          <div className="mb-6">
            <label className="mb-2 block text-sm font-medium text-slate-300">
              {t("report.severity")} *
            </label>
            <div className="flex flex-wrap gap-2">
              {SEVERITY_OPTIONS.map((sev) => (
                <button
                  key={sev}
                  type="button"
                  onClick={() => setSeverity(sev)}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
                    severity === sev
                      ? getSeverityColor(sev)
                      : "border-slate-700 bg-slate-950 text-slate-500 hover:border-slate-600 hover:text-slate-300"
                  }`}
                >
                  {t(`risk.${sev}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="mb-6">
            <label className="mb-2 block text-sm font-medium text-slate-300">
              {t("report.detailsLabel")} *
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder={t("report.detailsPlaceholder")}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
              required
            />
          </div>

          {/* Images */}
          <div className="mb-6">
            <label className="mb-2 block text-sm font-medium text-slate-300">
              {t("report.images")}
              <span className="ml-2 text-xs font-normal text-slate-500">
                ({t("report.maxImages")})
              </span>
            </label>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageChange}
              className="block w-full text-sm text-slate-400 file:mr-4 file:rounded-lg file:border file:border-slate-700 file:bg-slate-800 file:px-4 file:py-2 file:text-sm file:text-slate-300 file:transition hover:file:bg-slate-700"
            />

            {images.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-3">
                {images.map((img, index) => (
                  <div key={index} className="group relative">
                    <img
                      src={img.dataUrl}
                      alt={img.name}
                      className="h-20 w-20 rounded-lg border border-slate-700 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs text-white opacity-0 transition group-hover:opacity-100"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Reporter info */}
          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                {t("report.reporterName")}
                <span className="ml-2 text-xs font-normal text-slate-500">({t("report.optional")})</span>
              </label>
              <input
                type="text"
                value={reporterName}
                onChange={(e) => setReporterName(e.target.value)}
                placeholder={t("report.namePlaceholder")}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-2.5 text-white outline-none transition focus:border-cyan-400"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                {t("report.contactInfo")}
                <span className="ml-2 text-xs font-normal text-slate-500">({t("report.optional")})</span>
              </label>
              <input
                type="text"
                value={contactInfo}
                onChange={(e) => setContactInfo(e.target.value)}
                placeholder={t("report.contactPlaceholder")}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-2.5 text-white outline-none transition focus:border-cyan-400"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-cyan-500 px-6 py-2.5 font-medium text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? t("report.submitting") : t("report.submit")}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-slate-700 bg-slate-800 px-6 py-2.5 font-medium text-slate-300 transition hover:bg-slate-700"
            >
              {t("report.cancel")}
            </button>
          </div>
        </form>
      )}

      {/* Reports list */}
      <div>
        <h2 className="mb-4 text-xl font-semibold text-white">
          {t("report.pastReports")}
          {reports.length > 0 && (
            <span className="ml-2 text-base font-normal text-slate-500">
              ({reports.length})
            </span>
          )}
        </h2>

        {reports.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-10 text-center text-slate-500">
            {t("report.noReports")}
          </div>
        ) : (
          <div className="space-y-4">
            {reports.map((report) => {
              const isExpanded = expandedId === report.id;

              return (
                <div
                  key={report.id}
                  className="rounded-xl border border-slate-800 bg-slate-900 transition hover:border-slate-700"
                >
                  {/* Summary row */}
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedId(isExpanded ? null : report.id)
                    }
                    className="flex w-full items-center justify-between gap-4 p-5 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3">
                        <span
                          className={`inline-block rounded-full border px-3 py-0.5 text-xs font-semibold ${getSeverityColor(report.severity)}`}
                        >
                          {t(`risk.${report.severity}`)}
                        </span>
                        <span className="text-xs text-slate-500">
                          {formatDate(report.createdAt)}
                        </span>
                      </div>
                      <p className="mt-2 truncate text-sm text-slate-300">
                        {report.description}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        📍 {report.latitude.toFixed(4)}, {report.longitude.toFixed(4)}
                        {report.reporterName && ` • ${report.reporterName}`}
                      </p>
                    </div>
                    <div className="shrink-0 text-slate-500">
                      {isExpanded ? "▲" : "▼"}
                    </div>
                  </button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="border-t border-slate-800 p-5">
                      <div className="space-y-3 text-sm">
                        <div>
                          <span className="text-slate-500">{t("report.latitude")}:</span>{" "}
                          <span className="text-white">{report.latitude}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">{t("report.longitude")}:</span>{" "}
                          <span className="text-white">{report.longitude}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">{t("report.severity")}:</span>{" "}
                          <span className={`font-medium ${getSeverityColor(report.severity).split(" ")[0]}`}>
                            {t(`risk.${report.severity}`)}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">{t("report.detailsLabel")}:</span>
                          <p className="mt-1 whitespace-pre-wrap text-slate-300">
                            {report.description}
                          </p>
                        </div>
                        {report.reporterName && (
                          <div>
                            <span className="text-slate-500">{t("report.reporterName")}:</span>{" "}
                            <span className="text-white">{report.reporterName}</span>
                          </div>
                        )}
                        {report.contactInfo && (
                          <div>
                            <span className="text-slate-500">{t("report.contactInfo")}:</span>{" "}
                            <span className="text-white">{report.contactInfo}</span>
                          </div>
                        )}
                      </div>

                      {/* Images */}
                      {report.images && report.images.length > 0 && (
                        <div className="mt-4">
                          <p className="mb-2 text-sm text-slate-500">{t("report.images")}:</p>
                          <div className="flex flex-wrap gap-3">
                            {report.images.map((img, index) => (
                              <a
                                key={index}
                                href={img.dataUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <img
                                  src={img.dataUrl}
                                  alt={img.name}
                                  className="h-32 w-32 rounded-lg border border-slate-700 object-cover transition hover:border-cyan-500"
                                />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Delete */}
                      <div className="mt-5 border-t border-slate-800 pt-4">
                        <button
                          type="button"
                          onClick={() => deleteReport(report.id)}
                          className="rounded-lg border border-red-800/60 bg-red-950/20 px-4 py-2 text-sm text-red-400 transition hover:bg-red-950/40"
                        >
                          {t("report.delete")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Disclaimer */}
      <p className="mt-6 text-xs leading-5 text-slate-600">
        {t("report.disclaimer")}
      </p>
    </div>
  );
}

export default ReportLandslide;

