import React, { useState, useEffect } from 'react';
import {
  Building2,
  MapPin,
  Car,
  Bike,
  CheckCircle2,
  Clock,
  Info,
  ChevronRight,
  ChevronDown,
  Layers,
  Sparkles,
  Plus,
  Edit3,
  PowerOff,
} from 'lucide-react';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { useAuth } from '../auth/AuthContext';
import { ParkingLocationDoc } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { LocationFormModal } from './LocationFormModal';
import { DeactivateLocationModal } from './DeactivateLocationModal';

export const OwnerDashboardView: React.FC = () => {
  const {
    userRole,
    activeLocationId,
    assignedLocations,
    isLegacyMode,
    setActiveLocationId,
  } = useAuth();

  const [locations, setLocations] = useState<ParkingLocationDoc[]>(assignedLocations);
  const [expandedLocationId, setExpandedLocationId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<ParkingLocationDoc | null>(null);
  const [deactivatingLocation, setDeactivatingLocation] = useState<ParkingLocationDoc | null>(null);

  useEffect(() => {
    setLocations(assignedLocations);
  }, [assignedLocations]);

  const toggleExpand = (locId: string) => {
    setExpandedLocationId((prev) => (prev === locId ? null : locId));
  };

  const handleOpenCreate = () => {
    setEditingLocation(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (loc: ParkingLocationDoc) => {
    setEditingLocation(loc);
    setIsFormOpen(true);
  };

  const handleSaveSuccess = (savedDoc: ParkingLocationDoc) => {
    setLocations((prev) => {
      const idx = prev.findIndex((l) => l.id === savedDoc.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = savedDoc;
        return next;
      }
      return [...prev, savedDoc];
    });
  };

  const handleDeactivateSuccess = (locId: string) => {
    setLocations((prev) =>
      prev.map((l) => (l.id === locId ? { ...l, isActive: false } : l))
    );
  };

  // Safe enterprise aggregates derived strictly from authorized location configuration
  const totalLocations = locations.length;
  const activeLocationsCount = locations.filter((l) => l.isActive !== false).length;
  const totalCarCapacity = locations.reduce((sum, l) => sum + (l.capacity?.carTotal || 0), 0);
  const totalTwoWheelerCapacity = locations.reduce((sum, l) => sum + (l.capacity?.twoWheelerTotal || 0), 0);
  const totalFleetCapacity = totalCarCapacity + totalTwoWheelerCapacity;

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Enterprise Location Portfolio</h1>
            <Badge variant="primary" className="font-mono text-[11px]">
              {userRole === 'owner' ? 'OWNER DASHBOARD' : 'LOCATION MANAGER'}
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Authoritative facility configurations, physical capacities, and canonical rate schedules across your enterprise.
          </p>
        </div>

        {/* Actions & Mode Pill */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {userRole === 'owner' && (
            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="w-4 h-4" />}
              onClick={handleOpenCreate}
            >
              Register Facility
            </Button>
          )}

          {isLegacyMode ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-50 text-amber-800 border border-amber-300">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              Legacy Fallback Active (loc_sangamner_01)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Multi-Location Scope Verified
            </span>
          )}
        </div>
      </div>

      {/* 2. Safe Summary Statistics Grid (Strictly Configuration-Derived) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Authorized Facilities</span>
            <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center border border-brand-100">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2">{totalLocations}</div>
          <p className="text-[11px] text-slate-400 mt-1">
            {activeLocationsCount} active • {totalLocations - activeLocationsCount} inactive
          </p>
        </Card>

        <Card className="p-4 border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Active Facilities</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-900 mt-2">{activeLocationsCount}</div>
          <p className="text-[11px] text-slate-400 mt-1">Operational gate counters</p>
        </Card>

        <Card className="p-4 border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Fleet Capacity</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-blue-900 mt-2">{totalFleetCapacity} bays</div>
          <p className="text-[11px] text-slate-400 mt-1">Across all authorized sites</p>
        </Card>

        <Card className="p-4 border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Capacity Breakdown</span>
            <div className="flex items-center gap-1 text-slate-400">
              <Car className="w-3.5 h-3.5" />
              <Bike className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-lg font-bold text-slate-900 mt-2">
            {totalCarCapacity} <span className="text-xs font-normal text-slate-500">Cars</span> • {totalTwoWheelerCapacity} <span className="text-xs font-normal text-slate-500">2W</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Configured physical bays</p>
        </Card>
      </div>

      {/* 3. Authoritative Financial Isolation Notice (Required Data Boundary) */}
      <div className="p-4 rounded-xl bg-slate-900 text-white border border-slate-800 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-500/20 text-brand-400 flex items-center justify-center shrink-0 mt-0.5">
            <Info className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white tracking-wide uppercase">
              Financial & Active Occupancy Boundary
            </h4>
            <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
              Consolidated enterprise revenue, live cash balances, and multi-location active vehicle metrics are withheld by design. Multi-location financial aggregation requires Phase 5E location-scoped database indexing and trusted settlement services.
            </p>
          </div>
        </div>
        <span className="text-[10px] font-mono bg-slate-800 text-slate-300 px-2.5 py-1 rounded-md shrink-0 border border-slate-700">
          STATUS: WITHHELD FOR INTEGRITY
        </span>
      </div>

      {/* 4. Authorized Locations Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Configured Parking Locations</h2>
          <span className="text-xs text-slate-500">{locations.length} locations available</span>
        </div>

        {locations.length === 0 ? (
          <Card className="p-10 text-center border-dashed border-2 border-slate-200">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <Building2 className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">No Authorized Facilities Found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              Your account does not currently have any parking locations assigned. Contact enterprise administration to link facilities.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {locations.map((loc) => {
              const isActiveInContext = loc.id === activeLocationId;
              const isExpanded = expandedLocationId === loc.id;
              const isLocLegacy = loc.id === 'loc_sangamner_01' && isLegacyMode;

              return (
                <Card
                  key={loc.id}
                  className={`p-5 transition-all border ${
                    isActiveInContext
                      ? 'border-brand-500 ring-2 ring-brand-500/10 shadow-sm'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {/* Card Header: Code, Name, Badges */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 font-bold font-mono text-sm flex items-center justify-center shrink-0 border border-slate-200">
                        {loc.code || 'LOC'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-slate-900 text-base leading-snug">
                            {loc.name}
                          </h3>
                          {isActiveInContext && (
                            <Badge variant="primary" className="text-[10px] font-bold">
                              ACTIVE CONTEXT
                            </Badge>
                          )}
                        </div>
                        {loc.marathiName && (
                          <p className="text-xs text-slate-500 font-medium">{loc.marathiName}</p>
                        )}
                        <p className="text-xs text-brand-700 font-medium flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3.5 h-3.5 text-brand-600 shrink-0" />
                          <span>{loc.locationName || 'Main Counter'}</span>
                          {loc.marathiLocationName && (
                            <span className="text-slate-400">({loc.marathiLocationName})</span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1.5">
                      <Badge variant={loc.isActive !== false ? 'success' : 'danger'}>
                        {loc.isActive !== false ? 'Operational' : 'Closed'}
                      </Badge>
                      {isLocLegacy && (
                        <span className="text-[10px] font-mono bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded font-bold">
                          In-Memory Fallback
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Physical Address */}
                  {loc.address && (
                    <div className="mt-3 text-[11px] text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                      <span className="font-semibold text-slate-700">Address: </span>
                      {loc.address}
                    </div>
                  )}

                  {/* Capacity Overview */}
                  <div className="grid grid-cols-2 gap-2 my-3">
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-md bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                        <Car className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-500 block">Car Capacity</span>
                        <span className="text-sm font-bold text-slate-800">{loc.capacity?.carTotal || 0} bays</span>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                        <Bike className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-500 block">2W Capacity</span>
                        <span className="text-sm font-bold text-slate-800">{loc.capacity?.twoWheelerTotal || 0} bays</span>
                      </div>
                    </div>
                  </div>

                  {/* Rate Summary Preview (1st Hour & Monthly) */}
                  <div className="p-2.5 rounded-lg bg-brand-50/50 border border-brand-100/60 text-xs flex justify-between items-center text-slate-700">
                    <div>
                      <span className="text-slate-500 font-medium">1st Hour Rates: </span>
                      <span className="font-semibold text-brand-900">4W: {formatCurrency(loc.rates?.fourWheelerFirstHourRate || 50)}</span>
                      <span className="text-slate-400 mx-1.5">•</span>
                      <span className="font-semibold text-brand-900">2W: {formatCurrency(loc.rates?.twoWheelerFirstHourRate || 20)}</span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Monthly: <span className="font-semibold text-slate-800">{formatCurrency(loc.rates?.twoWheelerMonthlyRate || 600)}</span>
                    </div>
                  </div>

                  {/* Expand / Collapse Full 10-Rate Card Drawer */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-slate-200 space-y-3 animate-in fade-in duration-150">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-brand-600" />
                          Canonical 10-Field Rate Schedule
                        </h4>
                        <span className="text-[10px] font-mono text-slate-400">
                          {isLocLegacy ? 'DEFAULT_LEGACY_RATES' : 'FACILITY_RATES'}
                        </span>
                      </div>

                      {/* 10 Canonical Rate Fields Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
                        <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                          <span className="text-[10px] text-slate-500 block">4W 1st Hr</span>
                          <span className="font-bold text-slate-800">{formatCurrency(loc.rates?.fourWheelerFirstHourRate || 50)}</span>
                        </div>
                        <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                          <span className="text-[10px] text-slate-500 block">4W Addl/Hr</span>
                          <span className="font-bold text-slate-800">{formatCurrency(loc.rates?.fourWheelerAdditionalHourRate || 10)}</span>
                        </div>
                        <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                          <span className="text-[10px] text-slate-500 block">4W 12h Cap</span>
                          <span className="font-bold text-slate-800">{formatCurrency(loc.rates?.fourWheeler12HourCap || 150)}</span>
                        </div>
                        <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                          <span className="text-[10px] text-slate-500 block">4W 24h Cap</span>
                          <span className="font-bold text-slate-800">{formatCurrency(loc.rates?.fourWheeler24HourCap || 250)}</span>
                        </div>
                        <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                          <span className="text-[10px] text-slate-500 block">4W Pass</span>
                          <span className="font-bold text-slate-800">{formatCurrency(loc.rates?.fourWheelerMonthlyRate || 1500)}</span>
                        </div>

                        <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                          <span className="text-[10px] text-slate-500 block">2W 1st Hr</span>
                          <span className="font-bold text-slate-800">{formatCurrency(loc.rates?.twoWheelerFirstHourRate || 20)}</span>
                        </div>
                        <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                          <span className="text-[10px] text-slate-500 block">2W Addl/Hr</span>
                          <span className="font-bold text-slate-800">{formatCurrency(loc.rates?.twoWheelerAdditionalHourRate || 5)}</span>
                        </div>
                        <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                          <span className="text-[10px] text-slate-500 block">2W 12h Cap</span>
                          <span className="font-bold text-slate-800">{formatCurrency(loc.rates?.twoWheeler12HourCap || 60)}</span>
                        </div>
                        <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                          <span className="text-[10px] text-slate-500 block">2W 24h Cap</span>
                          <span className="font-bold text-slate-800">{formatCurrency(loc.rates?.twoWheeler24HourCap || 100)}</span>
                        </div>
                        <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                          <span className="text-[10px] text-slate-500 block">2W Pass</span>
                          <span className="font-bold text-slate-800">{formatCurrency(loc.rates?.twoWheelerMonthlyRate || 600)}</span>
                        </div>
                      </div>

                      {/* Operating Hours & Feature Capabilities */}
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1.5">
                        <div className="flex justify-between">
                          <span className="text-slate-500 flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            Operating Hours:
                          </span>
                          <span className="font-semibold text-slate-800">
                            {loc.operatingHours?.is24Hours
                              ? '24 Hours Open'
                              : `${loc.operatingHours?.openTime || '06:00'} - ${loc.operatingHours?.closeTime || '23:00'}`}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Contact Number:</span>
                          <span className="font-mono text-slate-800">{loc.contactMobile || '9690793434'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Payment Features:</span>
                          <span className="font-medium text-slate-800">
                            Cash {loc.features?.cashEnabled ? '✓' : '✗'} • UPI {loc.features?.upiEnabled ? '✓' : '✗'} • Advance {loc.features?.advanceEnabled ? '✓' : '✗'}
                          </span>
                        </div>
                        {loc.authorityLicenseText && (
                          <div className="pt-1.5 border-t border-slate-200 text-[11px] text-slate-600">
                            <span className="font-medium">Authority: </span>
                            {loc.authorityLicenseText}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Card Actions: Quick Switch, Edit, Deactivate, Expand */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                    <button
                      onClick={() => toggleExpand(loc.id)}
                      className="text-xs font-medium text-brand-600 hover:text-brand-800 flex items-center gap-1"
                    >
                      <span>{isExpanded ? 'Hide Rate Schedule' : 'Inspect Full Rate Card'}</span>
                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenEdit(loc)}
                        className="text-xs"
                        icon={<Edit3 className="w-3.5 h-3.5" />}
                      >
                        Edit
                      </Button>

                      {loc.isActive !== false && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeactivatingLocation(loc)}
                          className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                          icon={<PowerOff className="w-3.5 h-3.5" />}
                        >
                          Deactivate
                        </Button>
                      )}

                      {!isActiveInContext && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setActiveLocationId(loc.id)}
                          className="text-xs"
                        >
                          Set Active
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Location Create & Edit Modal */}
      <LocationFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        locationDoc={editingLocation}
        existingLocations={locations}
        userRole={userRole || 'owner'}
        onSaveSuccess={handleSaveSuccess}
      />

      {/* Safe Deactivation Confirmation Modal */}
      <DeactivateLocationModal
        isOpen={Boolean(deactivatingLocation)}
        onClose={() => setDeactivatingLocation(null)}
        location={deactivatingLocation}
        onSuccess={handleDeactivateSuccess}
      />
    </div>
  );
};
