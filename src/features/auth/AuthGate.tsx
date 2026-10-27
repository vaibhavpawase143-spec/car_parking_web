import React from 'react';
import { Loader2, Car, ShieldAlert, AlertTriangle, MapPinOff } from 'lucide-react';
import { useAuth } from './AuthContext';
import { AuthPage } from './AuthPage';
import { AccessDeniedScreen } from './AccessDeniedScreen';
import { Button } from '../../components/common/Button';
import { validateEnvironmentConfiguration } from '../../firebase';
import { UserRole } from '../../types';

interface AuthGateProps {
  requiredRole?: UserRole | UserRole[];
  children: React.ReactNode;
  onNavigate?: (tab: string) => void;
}

export const AuthGate: React.FC<AuthGateProps> = ({
  requiredRole,
  children,
  onNavigate,
}) => {
  const { authStatus, guardProfile, userRole, activeLocationId, signOut } = useAuth();
  const envValidation = validateEnvironmentConfiguration();

  // 1. Session verification loading state
  if (authStatus === 'loading') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600 mb-4 shadow-xs">
          <Car className="w-8 h-8" />
        </div>
        <div className="flex items-center gap-2 text-slate-800 font-semibold text-base mb-1">
          <Loader2 className="w-4 h-4 text-brand-600 animate-spin" />
          <span>Verifying Staff Credentials</span>
        </div>
        <p className="text-xs text-slate-500 max-w-xs">
          Checking Firebase Authentication state and querying role permissions in Firestore /guards...
        </p>
      </div>
    );
  }

  // 2. Unauthenticated state -> Show login screen
  if (authStatus === 'unauthenticated') {
    return <AuthPage />;
  }

  // 3. Access denied state (e.g. inactive account, unrecognized role, unassigned manager)
  if (authStatus === 'access_denied') {
    return <AccessDeniedScreen />;
  }

  // 4. Unconfigured environment state or security guard error
  if (authStatus === 'unconfigured' || !envValidation.isValid) {
    return (
      <div className="max-w-lg mx-auto my-12 p-6 bg-white rounded-2xl border border-amber-200 shadow-md text-center">
        <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-3">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-bold text-slate-900 mb-2">
          {envValidation.error ? 'Configuration Error' : 'Firebase Configuration Required'}
        </h3>
        <p className="text-xs text-slate-600 mb-4 leading-relaxed">
          {envValidation.error || (
            <>
              The Web Client SDK environment variables are not yet configured. Please populate <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-800">.env</code> using <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-800">.env.example</code>.
            </>
          )}
        </p>
        {!envValidation.error && (
          <div className="p-3 bg-slate-50 rounded-lg text-left font-mono text-[11px] text-slate-600 space-y-1 mb-4">
            <div>VITE_FIREBASE_API_KEY=...</div>
            <div>VITE_FIREBASE_PROJECT_ID=car-parking-system-2026</div>
            <div>VITE_FIREBASE_APP_ID=...</div>
          </div>
        )}
      </div>
    );
  }

  // 5. Unassigned location gate for staff
  if (userRole !== 'owner' && !activeLocationId) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 bg-white rounded-2xl border border-amber-200 shadow-md text-center">
        <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-3">
          <MapPinOff className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-slate-900">Location Assignment Required</h3>
        <p className="text-xs text-slate-600 mt-2 mb-4 leading-relaxed">
          Your staff account (<strong className="text-slate-800">{guardProfile?.email}</strong>) is active, but you are not currently assigned to any parking location. Please contact the business owner to assign your operating branch.
        </p>
        <Button
          variant="outline"
          className="w-full"
          onClick={async () => {
            await signOut();
            if (onNavigate) onNavigate('auth');
          }}
        >
          Sign Out & Switch Account
        </Button>
      </div>
    );
  }

  // 6. Authenticated state: verify role requirements
  if (requiredRole && guardProfile && userRole) {
    const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];

    // Helper checking if role has administrative access
    const isAdminRole = (r: UserRole) => r === 'admin' || r === 'owner' || r === 'manager';

    const requiresAdmin = roles.includes('admin') || roles.includes('owner') || roles.includes('manager');
    const isUserAdmin = isAdminRole(userRole);

    if (requiresAdmin && !isUserAdmin) {
      return (
        <div className="max-w-md mx-auto my-12 p-6 bg-white rounded-2xl border border-slate-200 shadow-md text-center">
          <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-3">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900">Admin Privileges Required</h3>
          <p className="text-xs text-slate-600 mt-2 mb-4 leading-relaxed">
            Your current account (<strong className="text-slate-800">{guardProfile.email}</strong>) has the <strong className="text-slate-800 font-semibold">Guard</strong> role. The Management Portal is restricted to administrators and managers only.
          </p>
          <div className="flex flex-col gap-2">
            {onNavigate && (
              <Button
                variant="primary"
                className="w-full"
                onClick={() => onNavigate('guard')}
              >
                Go to Guard Terminal
              </Button>
            )}
            <Button
              variant="outline"
              className="w-full"
              onClick={async () => {
                await signOut();
                if (onNavigate) onNavigate('auth');
              }}
            >
              Sign Out & Switch Account
            </Button>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
};
