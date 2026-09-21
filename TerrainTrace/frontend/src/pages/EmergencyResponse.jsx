import { useState } from "react";
import { useLanguage } from "../i18n/LanguageContext";

const EmergencyResponse = () => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('before');

  const tabs = [
    { id: 'before', labelKey: 'emergency.before' },
    { id: 'during', labelKey: 'emergency.during' },
    { id: 'after', labelKey: 'emergency.after' },
  ];

  const content = {
    before: {
      icon: '🛡️',
      titleKey: 'emergency.beforeTitle',
      descriptionKey: 'emergency.beforeDesc',
      dotColor: 'bg-green-500',
      itemsKey: 'emergency.beforeItems'
    },
    during: {
      icon: '⚠️',
      titleKey: 'emergency.duringTitle',
      descriptionKey: 'emergency.duringDesc',
      dotColor: 'bg-amber-500',
      itemsKey: 'emergency.duringItems'
    },
    after: {
      icon: '✅',
      titleKey: 'emergency.afterTitle',
      descriptionKey: 'emergency.afterDesc',
      dotColor: 'bg-blue-500',
      itemsKey: 'emergency.afterItems'
    }
  };

  const activeContent = content[activeTab];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8">
        <span className="text-sm font-semibold text-red-400 uppercase tracking-wider">{t("emergency.sectionLabel")}</span>
        <h1 className="text-3xl font-bold text-slate-100 mt-2 mb-4">{t("emergency.title")}</h1>
        <p className="text-slate-400 max-w-3xl">
          {t("emergency.description")}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-3 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-2.5 rounded-full text-sm font-medium border transition-colors ${
              activeTab === tab.id
                ? 'border-cyan-500/60 bg-cyan-500/10 text-cyan-300'
                : 'border-slate-700 bg-slate-950 text-slate-500 hover:border-slate-600 hover:text-slate-300'
            }`}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 mb-8">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-2xl">{activeContent.icon}</span>
          <h2 className="text-xl font-bold text-slate-100">{t(activeContent.titleKey)}</h2>
        </div>
        <p className="text-slate-400 text-sm mb-6 pb-6 border-b border-slate-800">
          {t(activeContent.descriptionKey)}
        </p>
        <ul className="space-y-3">
          {(t(activeContent.itemsKey) || []).map((item, index) => (
            <li key={index} className="flex items-start gap-3">
              <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${activeContent.dotColor}`}></span>
              <span className="text-slate-300 text-sm">{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Emergency Contacts */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 mb-8">
        <h2 className="text-xl font-bold text-slate-100 mb-1">{t("emergency.emergencyContacts")}</h2>
        <p className="text-slate-400 text-sm mb-6">{t("emergency.contactsDesc")}</p>
        
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">{t("emergency.nationalEmergency")}</div>
            <div className="text-2xl font-bold text-slate-100">112</div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">{t("emergency.ndrfHelpline")}</div>
            <div className="text-2xl font-bold text-slate-100">1078</div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">{t("emergency.disasterManagement")}</div>
            <div className="text-2xl font-bold text-slate-100">108</div>
          </div>
        </div>
        
        <p className="text-xs text-slate-500">
          {t("emergency.contactLocal")}
        </p>
      </div>

      {/* Disclaimer */}
      <div className="text-xs text-slate-600 mt-4 border-t border-slate-800/50 pt-4">
        {t("emergency.disclaimer")}
      </div>
    </div>
  );
};

export default EmergencyResponse;