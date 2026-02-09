import React, { useState, useEffect, lazy, Suspense } from 'react';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { Loader2 } from 'lucide-react';

// --- 1. Core Config ---
import { auth } from './api/firebase';
import { reportClientError } from './utils/monitoring';

// --- 2. Major Screens ---
const GateScreen = lazy(() =>
  import('./components/GateScreen').then((module) => ({ default: module.GateScreen }))
);
const IdentityScreen = lazy(() => import('./components/auth/IdentityScreen'));
const AdminDashboard = lazy(() => import('./components/admin/AdminDashboard'));
const MemberApp = lazy(() => import('./components/member/MemberApp'));

const preloadMemberRoutes = () => {
  import('./components/member/MemberApp');
  import('./components/auth/IdentityScreen');
};

const preloadAdminRoute = () => {
  import('./components/admin/AdminDashboard');
};

const RouteLoader = () => (
  <div className="flex items-center justify-center min-h-screen bg-slate-50">
    <Loader2 className="animate-spin text-indigo-600 w-8 h-8" />
  </div>
);

export default function App() {
  // --- Global States ---
  const [user, setUser] = useState(null); 
  const [appData, setAppData] = useState({ 
    role: null,      // 'ADMIN' or 'MEMBER'
    labName: null,   
    userName: null   
  }); 
  const [identityStage, setIdentityStage] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true); // Tracks session recovery
  const [initError, setInitError] = useState('');

  // --- Session Persistence Logic (30 Days) ---
  useEffect(() => {
    let isActive = true;
    let attemptedAnonymousSignIn = false;

    const handleInitError = (error, phase) => {
      reportClientError({
        source: 'app-init',
        error,
        stack: error?.stack || '',
        extra: { phase }
      });
      if (!isActive) return;
      setInitError('Unable to initialize secure session. Please check Firebase Authentication settings and try again.');
      setIsInitializing(false);
    };

    // Restore local session immediately to preselect route while auth hydrates.
    try {
      const savedSession = localStorage.getItem('lab_session');
      if (savedSession) {
        try {
          const { role, labName, userName, expiry } = JSON.parse(savedSession);
          if (Date.now() < expiry) {
            setAppData({ role, labName, userName });
            if (role === 'MEMBER' && !userName) setIdentityStage(true);

            if (role === 'ADMIN') preloadAdminRoute();
            if (role === 'MEMBER') preloadMemberRoutes();
          } else {
            localStorage.removeItem('lab_session');
          }
        } catch {
          localStorage.removeItem('lab_session');
        }
      }
    } catch (error) {
      handleInitError(error, 'session-restore');
      return () => {};
    }

    // Wait for auth persistence first; only sign in anonymously if no user exists.
    const unsubscribe = onAuthStateChanged(
      auth,
      async (authUser) => {
        if (!isActive) return;
        setUser(authUser);

        if (authUser) {
          setIsInitializing(false);
          return;
        }

        if (attemptedAnonymousSignIn) return;
        attemptedAnonymousSignIn = true;

        try {
          await signInAnonymously(auth);
          // Success path is handled by the next onAuthStateChanged callback.
        } catch (error) {
          handleInitError(error, 'signInAnonymously');
        }
      },
      (error) => {
        handleInitError(error, 'onAuthStateChanged');
      }
    );

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const handleWindowError = (event) => {
      reportClientError({
        source: 'window.error',
        message: event.message || 'Unhandled window error',
        stack: event.error?.stack || '',
        extra: {
          filename: event.filename || '',
          lineno: event.lineno || null,
          colno: event.colno || null
        }
      });
    };
    const handleUnhandledRejection = (event) => {
      const reason = event.reason;
      reportClientError({
        source: 'window.unhandledrejection',
        message: reason?.message || String(reason || 'Unhandled promise rejection'),
        stack: reason?.stack || '',
        extra: {
          name: reason?.name || ''
        }
      });
    };
    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => {
      window.removeEventListener('error', handleWindowError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  // --- Helper: Save session to local storage ---
  const saveSession = (data) => {
    const sessionRecord = {
      ...data,
      expiry: Date.now() + 30 * 24 * 60 * 60 * 1000 // Current time + 30 days
    };
    localStorage.setItem('lab_session', JSON.stringify(sessionRecord));
  };

  // --- Login Success (GateScreen) ---
  const handleLoginSuccess = ({ role, labName }) => { 
    if (role === 'ADMIN') {
      preloadAdminRoute();
      const data = { role, labName, userName: 'Admin' };
      setAppData(data); 
      saveSession(data); // Remember Admin
    } else { 
      preloadMemberRoutes();
      setAppData({ role, labName, userName: null }); 
      setIdentityStage(true); 
      // We don't save session here yet because we need the userName from the next step
    } 
  };

  // --- Identity Verification Success (IdentityScreen) ---
  const handleIdentityVerified = (userName) => { 
    preloadMemberRoutes();
    const updatedData = { ...appData, userName };
    setAppData(updatedData); 
    saveSession(updatedData); // Remember Member with their name
    setIdentityStage(false); 
  };

  // --- Logout (Clear everything) ---
  const logout = () => {
    localStorage.removeItem('lab_session'); // Wipe local storage
    setAppData({ role: null, labName: null, userName: null });
    setIdentityStage(false);
  };

  // --- Rendering Logic ---

  // A. Loading State (During initial auth and session check)
  if (isInitializing) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <Loader2 className="animate-spin text-indigo-600 w-8 h-8"/>
      </div>
    );
  }

  if (initError) {
    return (
      <div className="min-h-screen ds-page flex items-center justify-center p-4">
        <div className="w-full max-w-md ds-card ds-section-lg text-center">
          <h1 className="text-xl font-bold text-slate-800">Initialization error</h1>
          <p className="text-sm text-slate-500 mt-2">{initError}</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-5 w-full ds-btn ds-btn-primary py-3 text-white">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen ds-page flex items-center justify-center p-4">
        <div className="w-full max-w-md ds-card ds-section-lg text-center">
          <h1 className="text-xl font-bold text-slate-800">Signed out</h1>
          <p className="text-sm text-slate-500 mt-2">Session is unavailable. Please refresh to sign in again.</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-5 w-full ds-btn ds-btn-primary py-3 text-white">
            Refresh
          </button>
        </div>
      </div>
    );
  }

  // B. Step 1: Gate (Choose/Create Lab)
  if (!appData.labName) {
    return (
      <Suspense fallback={<RouteLoader />}>
        <GateScreen onLoginSuccess={handleLoginSuccess} />
      </Suspense>
    );
  }
  
  // C. Admin Route
  if (appData.role === 'ADMIN') {
    return (
      <Suspense fallback={<RouteLoader />}>
        <AdminDashboard labName={appData.labName} onLogout={logout} />
      </Suspense>
    );
  }
  
  // D. Identity Verification Stage
  if (identityStage || (appData.role === 'MEMBER' && !appData.userName)) {
    return (
      <Suspense fallback={<RouteLoader />}>
        <IdentityScreen labName={appData.labName} onIdentityVerified={handleIdentityVerified} />
      </Suspense>
    );
  }
  
  // E. Member Main App
  return (
    <Suspense fallback={<RouteLoader />}>
      <MemberApp labName={appData.labName} userName={appData.userName} onLogout={logout} />
    </Suspense>
  );
}
