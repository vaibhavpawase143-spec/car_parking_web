import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { 
  User, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut, 
  sendPasswordResetEmail 
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  onSnapshot, 
  Unsubscribe 
} from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from '../../firebase';
import { AuthContextType, AuthStatus, GuardProfile, ParkingLocationDoc, UserRole } from '../../types';
import { 
  DEFAULT_LEGACY_LOCATION_ID, 
  DEFAULT_LEGACY_LOCATION, 
  resolveStaffLocations, 
  fetchLocationById, 
  fetchLocationsByIds 
} from '../../services/locationService';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [guardProfile, setGuardProfile] = useState<GuardProfile | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>(() => 
    isFirebaseConfigured() ? 'loading' : 'unconfigured'
  );
  const [accessDeniedReason, setAccessDeniedReason] = useState<string | null>(null);

  // Phase 5C: Multi-Location Context States
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [activeLocationId, setActiveLocationIdState] = useState<string | null>(null);
  const [assignedLocationIds, setAssignedLocationIds] = useState<string[]>([]);
  const [assignedLocations, setAssignedLocations] = useState<ParkingLocationDoc[]>([]);
  const [activeLocation, setActiveLocation] = useState<ParkingLocationDoc | null>(null);
  const [isLegacyMode, setIsLegacyMode] = useState<boolean>(false);

  // Helper to fetch guard document either by doc ID or by uid/email fields
  const fetchGuardProfileDoc = useCallback(async (user: User): Promise<{ id: string; data: any } | null> => {
    if (!db) return null;

    try {
      // 1. Direct document lookup by Firebase Auth UID
      const directRef = doc(db, 'guards', user.uid);
      const directSnap = await getDoc(directRef);
      if (directSnap.exists() && directSnap.data()) {
        return { id: directSnap.id, data: directSnap.data() };
      }

      // 2. Fallback query by 'uid' field
      const guardsRef = collection(db, 'guards');
      const uidQuery = query(guardsRef, where('uid', '==', user.uid));
      const uidSnap = await getDocs(uidQuery);
      if (!uidSnap.empty) {
        const firstDoc = uidSnap.docs[0];
        return { id: firstDoc.id, data: firstDoc.data() };
      }

      // 3. Fallback query by lowercase email
      if (user.email) {
        const emailQuery = query(guardsRef, where('email', '==', user.email.trim().toLowerCase()));
        const emailSnap = await getDocs(emailQuery);
        if (!emailSnap.empty) {
          const firstDoc = emailSnap.docs[0];
          return { id: firstDoc.id, data: firstDoc.data() };
        }
      }

      return null;
    } catch (err) {
      console.error('[AuthContext] Error fetching guard profile:', err);
      return null;
    }
  }, []);

  const resetState = useCallback(() => {
    setCurrentUser(null);
    setGuardProfile(null);
    setUserRole(null);
    setActiveLocationIdState(null);
    setAssignedLocationIds([]);
    setAssignedLocations([]);
    setActiveLocation(null);
    setIsLegacyMode(false);
    setAccessDeniedReason(null);
  }, []);

  const evaluateProfileData = useCallback(async (user: User, docId: string, data: any) => {
    const rawRole = String(data?.role || '').trim().toLowerCase();
    const isActive = Boolean(data?.isActive);

    if (!isActive) {
      setGuardProfile(null);
      setUserRole(null);
      setActiveLocationIdState(null);
      setAssignedLocationIds([]);
      setAssignedLocations([]);
      setActiveLocation(null);
      setAuthStatus('access_denied');
      setAccessDeniedReason(`Account for ${data?.name || user.email} is inactive. Contact the administrator.`);
      return;
    }

    if (rawRole !== 'owner' && rawRole !== 'manager' && rawRole !== 'admin' && rawRole !== 'guard') {
      setGuardProfile(null);
      setUserRole(null);
      setActiveLocationIdState(null);
      setAssignedLocationIds([]);
      setAssignedLocations([]);
      setActiveLocation(null);
      setAuthStatus('access_denied');
      setAccessDeniedReason(`Role "${rawRole}" is unauthorized. Must be one of: "owner", "manager", "admin", or "guard".`);
      return;
    }

    // Resolve multi-location assignments with non-mutating legacy fallback
    const resolved = resolveStaffLocations(data);

    if (!resolved.hasValidAssignment && resolved.role === 'manager') {
      setGuardProfile(null);
      setUserRole('manager');
      setActiveLocationIdState(null);
      setAssignedLocationIds([]);
      setAssignedLocations([]);
      setActiveLocation(null);
      setAuthStatus('access_denied');
      setAccessDeniedReason('No parking locations are currently assigned to this manager account. Contact the business owner.');
      return;
    }

    const defaultRoleName = 
      resolved.role === 'owner' ? 'Owner' :
      resolved.role === 'manager' ? 'Location Manager' :
      resolved.role === 'admin' ? 'Administrator' : 'Guard';

    const profile: GuardProfile = {
      uid: data.uid || docId,
      name: data.name || defaultRoleName,
      email: data.email || user.email || '',
      mobile: data.mobile || '',
      role: resolved.role,
      isActive: true,
      ownerUid: data.ownerUid || undefined,
      assignedLocationId: resolved.assignedLocationId || undefined,
      assignedLocationIds: resolved.assignedLocationIds,
      currentShift: data.currentShift || undefined,
      currentShiftId: data.currentShiftId || undefined,
      shiftStatus: data.shiftStatus || undefined,
      shiftStartTime: data.shiftStartTime || undefined,
      shiftLocationId: data.shiftLocationId || resolved.assignedLocationId || undefined,
      outstandingFloat: data.outstandingFloat ? {
        cash: Number(data.outstandingFloat.cash) || 0,
        upi: Number(data.outstandingFloat.upi) || 0,
        lastReconciledAt: data.outstandingFloat.lastReconciledAt?.toDate ? data.outstandingFloat.lastReconciledAt.toDate() : null,
      } : undefined,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : undefined,
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : undefined,
    };

    setGuardProfile(profile);
    setUserRole(resolved.role);
    setAssignedLocationIds(resolved.assignedLocationIds);
    setIsLegacyMode(resolved.isLegacyMode);

    // Initial chosen active location
    const chosenLocId = resolved.assignedLocationId || resolved.assignedLocationIds[0] || DEFAULT_LEGACY_LOCATION_ID;
    setActiveLocationIdState(chosenLocId);

    // Load full location objects
    const locDocs = await fetchLocationsByIds(resolved.assignedLocationIds);
    setAssignedLocations(locDocs.length > 0 ? locDocs : [DEFAULT_LEGACY_LOCATION]);

    const activeDoc = locDocs.find((l) => l.id === chosenLocId) || await fetchLocationById(chosenLocId) || DEFAULT_LEGACY_LOCATION;
    setActiveLocation(activeDoc);

    setAuthStatus('authenticated');
    setAccessDeniedReason(null);
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured() || !auth || !db) {
      setAuthStatus('unconfigured');
      return;
    }

    const firestoreInstance = db;
    let profileDocUnsubscribe: Unsubscribe | null = null;

    const authUnsubscribe = onAuthStateChanged(auth, async (user) => {
      // Clean up previous profile listener
      if (profileDocUnsubscribe) {
        profileDocUnsubscribe();
        profileDocUnsubscribe = null;
      }

      if (!user) {
        resetState();
        setAuthStatus('unauthenticated');
        return;
      }

      setCurrentUser(user);
      setAuthStatus('loading');

      // Fetch profile
      const found = await fetchGuardProfileDoc(user);

      if (!found) {
        resetState();
        setAuthStatus('access_denied');
        setAccessDeniedReason('No staff record found in the guards registry. Contact the administrator.');
        return;
      }

      // Initial evaluation
      await evaluateProfileData(user, found.id, found.data);

      // Listen for real-time profile updates (e.g. role update, location change, deactivation)
      try {
        const docRef = doc(firestoreInstance, 'guards', found.id);
        profileDocUnsubscribe = onSnapshot(docRef, async (snap) => {
          if (!snap.exists()) {
            resetState();
            setAuthStatus('access_denied');
            setAccessDeniedReason('Staff record was removed from the guards registry.');
            return;
          }
          await evaluateProfileData(user, snap.id, snap.data());
        });
      } catch (subErr) {
        console.warn('[AuthContext] Snapshot listener could not be established:', subErr);
      }
    });

    return () => {
      authUnsubscribe();
      if (profileDocUnsubscribe) {
        profileDocUnsubscribe();
      }
    };
  }, [fetchGuardProfileDoc, evaluateProfileData, resetState]);

  const setActiveLocationId = useCallback(async (locationId: string) => {
    const cleanId = String(locationId || '').trim();
    if (!cleanId) return;

    // Boundary check for Manager
    if (userRole === 'manager' && !assignedLocationIds.includes(cleanId)) {
      console.warn(`[AuthContext] Location Manager is not assigned to location: ${cleanId}`);
      return;
    }

    // Boundary check for Guard
    if (userRole === 'guard' && guardProfile?.assignedLocationId && guardProfile.assignedLocationId !== cleanId) {
      console.warn(`[AuthContext] Guard cannot switch outside active assigned location: ${guardProfile.assignedLocationId}`);
      return;
    }

    setActiveLocationIdState(cleanId);
    const locDoc = assignedLocations.find((l) => l.id === cleanId) || await fetchLocationById(cleanId);
    if (locDoc) {
      setActiveLocation(locDoc);
    }
  }, [userRole, assignedLocationIds, guardProfile, assignedLocations]);

  const signIn = useCallback(async (email: string, pass: string) => {
    if (!auth) {
      throw new Error('Firebase Auth is not initialized. Please configure .env');
    }
    await signInWithEmailAndPassword(auth, email.trim(), pass);
  }, []);

  const signOut = useCallback(async () => {
    if (!auth) return;
    await firebaseSignOut(auth);
    resetState();
    setAuthStatus('unauthenticated');
  }, [resetState]);

  const sendPasswordReset = useCallback(async (email: string) => {
    if (!auth) {
      throw new Error('Firebase Auth is not initialized. Please configure .env');
    }
    await sendPasswordResetEmail(auth, email.trim());
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!currentUser) return;
    setAuthStatus('loading');
    const found = await fetchGuardProfileDoc(currentUser);
    if (!found) {
      resetState();
      setAuthStatus('access_denied');
      setAccessDeniedReason('No staff record found in the guards registry.');
      return;
    }
    await evaluateProfileData(currentUser, found.id, found.data);
  }, [currentUser, fetchGuardProfileDoc, evaluateProfileData, resetState]);

  const value = useMemo<AuthContextType>(() => ({
    currentUser,
    guardProfile,
    authStatus,
    accessDeniedReason,
    userRole,
    activeLocationId,
    assignedLocationIds,
    assignedLocations,
    activeLocation,
    isLegacyMode,
    setActiveLocationId,
    signIn,
    signOut,
    sendPasswordReset,
    refreshProfile,
  }), [
    currentUser,
    guardProfile,
    authStatus,
    accessDeniedReason,
    userRole,
    activeLocationId,
    assignedLocationIds,
    assignedLocations,
    activeLocation,
    isLegacyMode,
    setActiveLocationId,
    signIn,
    signOut,
    sendPasswordReset,
    refreshProfile,
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
