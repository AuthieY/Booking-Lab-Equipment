import React, { useState, useEffect } from 'react';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { Loader2 } from 'lucide-react';

// --- 1. Core Config ---
import { auth } from './api/firebase';

// --- 2. Major Screens ---
import { GateScreen } from './components/GateScreen';
import IdentityScreen from './components/auth/IdentityScreen';
import AdminDashboard from './components/admin/AdminDashboard';
import MemberApp from './components/member/MemberApp';

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
    const initAuth = async () => { 
      try { 
        // 1. Initial anonymous login
        await signInAnonymously(auth); 
        
        // 2. Try to recover session from localStorage
        const savedSession = localStorage.getItem('lab_session');
        if (savedSession) {
          try {
            const { role, labName, userName, expiry } = JSON.parse(savedSession);
            if (Date.now() < expiry) {
              setAppData({ role, labName, userName });
              if (role === 'MEMBER' && !userName) setIdentityStage(true);
            } else {
              localStorage.removeItem('lab_session');
            }
          } catch {
            localStorage.removeItem('lab_session');
          }
        }
      } catch (e) {
        console.error("Initialization failed", e);
        setInitError('Unable to initialize secure session. Please check Firebase Authentication settings and try again.');
      } finally {
        setIsInitializing(false);
      }
    }; 
    
    initAuth(); 
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u)); 
    return () => unsubscribe();
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
      const data = { role, labName, userName: 'Admin' };
      setAppData(data); 
      saveSession(data); // Remember Admin
    } else { 
      setAppData({ role, labName, userName: null }); 
      setIdentityStage(true); 
      // We don't save session here yet because we need the userName from the next step
    } 
  };

  // --- Identity Verification Success (IdentityScreen) ---
  const handleIdentityVerified = (userName) => { 
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
    return <GateScreen onLoginSuccess={handleLoginSuccess} />;
  }
  
  // C. Admin Route
  if (appData.role === 'ADMIN') {
    return <AdminDashboard labName={appData.labName} onLogout={logout} />;
  }
  
  // D. Identity Verification Stage
  if (identityStage || (appData.role === 'MEMBER' && !appData.userName)) {
    return <IdentityScreen labName={appData.labName} onIdentityVerified={handleIdentityVerified} />;
  }
  
  // E. Member Main App
  return <MemberApp labName={appData.labName} userName={appData.userName} onLogout={logout} />;
}
