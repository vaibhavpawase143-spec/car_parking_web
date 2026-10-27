import React from 'react';
import { MapPin, ChevronDown } from 'lucide-react';
import { useAuth } from '../../features/auth/AuthContext';

export const LocationSwitcher: React.FC = () => {
  const {
    userRole,
    activeLocationId,
    assignedLocations,
    activeLocation,
    isLegacyMode,
    setActiveLocationId,
  } = useAuth();

  // If no active location or unassigned, render nothing
  if (!activeLocationId && assignedLocations.length === 0) {
    return null;
  }

  const isMultiLocation = (userRole === 'owner' || userRole === 'manager') && assignedLocations.length > 1;
  const currentLocation = activeLocation || assignedLocations.find((l) => l.id === activeLocationId) || assignedLocations[0];

  const handleLocationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLocationId = e.target.value;
    if (newLocationId && newLocationId !== activeLocationId) {
      setActiveLocationId(newLocationId);
    }
  };

  // If single location or guard, render a clean static indicator pill
  if (!isMultiLocation || !currentLocation) {
    return (
      <div
        className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-100 text-slate-700 border border-slate-200"
        title={isLegacyMode ? 'Operating under legacy compatibility mode (loc_sangamner_01)' : 'Current assigned location'}
      >
        <MapPin className="w-3.5 h-3.5 text-brand-600 shrink-0" />
        <span className="font-semibold text-slate-900">{currentLocation?.code || 'SMR'}</span>
        <span className="text-slate-400">•</span>
        <span className="text-slate-600 truncate max-w-[130px]">
          {currentLocation?.locationName || currentLocation?.name || 'Sangamner'}
        </span>
        {isLegacyMode && (
          <span className="ml-1 text-[9px] font-mono px-1 py-0.2 rounded bg-amber-100 text-amber-800 font-bold">
            LEGACY
          </span>
        )}
      </div>
    );
  }

  // Interactive location switcher for Owner and multi-location Managers
  return (
    <div className="relative inline-flex items-center">
      <div className="relative inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-brand-50/80 hover:bg-brand-100/80 text-brand-900 border border-brand-200 transition-colors shadow-2xs">
        <MapPin className="w-3.5 h-3.5 text-brand-600 shrink-0" />
        <span className="font-bold text-brand-950">{currentLocation.code}</span>
        <span className="text-brand-300">•</span>
        <span className="text-brand-800 truncate max-w-[140px]">
          {currentLocation.locationName || currentLocation.name}
        </span>
        <ChevronDown className="w-3 h-3 text-brand-500 pointer-events-none shrink-0" />

        {/* Native accessible select element overlay */}
        <select
          id="global-location-switcher-select"
          aria-label="Switch active parking location"
          value={activeLocationId || ''}
          onChange={handleLocationChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer text-xs"
          title="Switch active operating location (in-memory context)"
        >
          {assignedLocations.map((loc) => (
            <option key={loc.id} value={loc.id} className="text-slate-900 py-1">
              {loc.code} — {loc.locationName || loc.name} {loc.id === 'loc_sangamner_01' && isLegacyMode ? '(Legacy)' : ''}
            </option>
          ))}
        </select>
      </div>

      {isLegacyMode && (
        <span
          className="hidden lg:inline-block ml-1.5 text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 font-bold"
          title="In-memory dual-read fallback active"
        >
          FALLBACK
        </span>
      )}
    </div>
  );
};
