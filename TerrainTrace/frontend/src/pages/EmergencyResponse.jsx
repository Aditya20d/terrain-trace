import { useState } from "react";

const EmergencyResponse = () => {
  const [activeTab, setActiveTab] = useState('before');

  const tabs = [
    { id: 'before', label: 'Before' },
    { id: 'during', label: 'During' },
    { id: 'after', label: 'After' },
  ];

  const content = {
    before: {
      icon: '🛡️',
      title: 'Before a Landslide',
      description: 'Preparation and preventative measures to take before a landslide occurs.',
      dotColor: 'bg-green-500',
      items: [
        'Monitor weather forecasts and TerrainTrace risk alerts regularly',
        'Identify safe evacuation routes from your area',
        'Avoid parking or traveling near known unstable slopes',
        'Keep emergency supplies ready (water, food, first aid, flashlight)',
        'Keep phones and power banks fully charged',
        'Know the locations of nearby safe shelters',
        'Follow official weather warnings and advisories',
        'Share emergency plans with family members'
      ]
    },
    during: {
      icon: '⚠️',
      title: 'During a Landslide',
      description: 'Immediate actions to take to stay safe during a landslide.',
      dotColor: 'bg-amber-500',
      items: [
        'Move away from the landslide path immediately',
        'Evacuate to higher ground or a pre-identified safe location',
        'Do not enter the slide area or attempt to cross debris flows',
        'Avoid unstable slopes, bridges, and damaged roads',
        'Stay away from downed power lines and utility infrastructure',
        'Follow official emergency instructions from authorities',
        'Do not attempt rescue in unstable terrain without trained support',
        'Alert neighbours and nearby residents if possible'
      ]
    },
    after: {
      icon: '✅',
      title: 'After a Landslide',
      description: 'Steps to take for recovery and safety after a landslide event.',
      dotColor: 'bg-blue-500',
      items: [
        'Do not return to the affected area until authorities declare it safe',
        'Avoid walking or driving through debris and unstable slopes',
        'Report blocked or damaged roads to local authorities',
        'Check for trapped or injured people only when conditions are safe',
        'Contact emergency services for rescue operations',
        'Document damage for insurance and relief purposes when appropriate',
        'Continue monitoring for secondary landslides and afterslides',
        'Check water supplies for contamination before use'
      ]
    }
  };

  const activeContent = content[activeTab];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8">
        <span className="text-sm font-semibold text-red-400 uppercase tracking-wider">Emergency Preparedness</span>
        <h1 className="text-3xl font-bold text-slate-100 mt-2 mb-4">Landslide Emergency Response</h1>
        <p className="text-slate-400 max-w-3xl">
          Practical guidance and safety measures to protect yourself and your community before, during, and after a landslide event.
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
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 mb-8">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-2xl">{activeContent.icon}</span>
          <h2 className="text-xl font-bold text-slate-100">{activeContent.title}</h2>
        </div>
        <p className="text-slate-400 text-sm mb-6 pb-6 border-b border-slate-800">
          {activeContent.description}
        </p>
        <ul className="space-y-3">
          {activeContent.items.map((item, index) => (
            <li key={index} className="flex items-start gap-3">
              <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${activeContent.dotColor}`}></span>
              <span className="text-slate-300 text-sm">{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Emergency Contacts */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 mb-8">
        <h2 className="text-xl font-bold text-slate-100 mb-1">Emergency Contacts</h2>
        <p className="text-slate-400 text-sm mb-6">Key national emergency numbers for India</p>
        
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">National Emergency</div>
            <div className="text-2xl font-bold text-slate-100">112</div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">NDRF Helpline</div>
            <div className="text-2xl font-bold text-slate-100">1078</div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Disaster Management</div>
            <div className="text-2xl font-bold text-slate-100">108</div>
          </div>
        </div>
        
        <p className="text-xs text-slate-500">
          Contact your local district disaster management authority for region-specific emergency numbers.
        </p>
      </div>

      {/* Disclaimer */}
      <div className="text-xs text-slate-600 mt-4 border-t border-slate-800/50 pt-4">
        This page provides general guidance for landslide emergencies. Always follow official instructions from local authorities and emergency services. TerrainTrace AI predictions are for awareness purposes and do not replace official emergency alerts.
      </div>
    </div>
  );
};

export default EmergencyResponse;