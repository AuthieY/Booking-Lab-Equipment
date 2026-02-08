import React, { useState } from 'react';
import { collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { db, appId } from '../../api/firebase';

const IdentityScreen = ({ labName, onIdentityVerified }) => {
  const [name, setName] = useState(''); const [pin, setPin] = useState(''); const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  const handleIdentity = async (e) => { e.preventDefault(); if (!name.trim() || !pin.trim()) { setError('Please enter your name and password.'); return; } setLoading(true); setError('');
    try { const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'lab_users'); const q = query(usersRef, where('labName', '==', labName), where('userName', '==', name.trim())); const snapshot = await getDocs(q); if (snapshot.empty) { await addDoc(usersRef, { labName, userName: name.trim(), pinCode: pin.trim(), createdAt: serverTimestamp() }); onIdentityVerified(name.trim()); } else { const userData = snapshot.docs[0].data(); if (userData.pinCode === pin.trim()) onIdentityVerified(name.trim()); else setError('Incorrect password.'); }
    } catch (err) { setError('Unable to verify identity.'); } finally { setLoading(false); }
  };
  return (
    <div className="flex flex-col items-center justify-center min-h-screen ds-page p-4 md:p-6 ds-animate-enter-fast">
      <div className="w-full max-w-md ds-card ds-section-lg">
        <h1 className="text-2xl font-bold text-center mb-2 text-slate-800">Identity verification</h1>
        <p className="text-xs text-slate-500 text-center mb-6">Enter your name and password to continue.</p>
        <form onSubmit={handleIdentity} className="space-y-4">
          <div>
            <label htmlFor="identity-name" className="ds-field-label ml-1">Name</label>
            <input id="identity-name" autoComplete="name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your Name" className="ds-input mt-1 p-3" />
          </div>
          <div>
            <label htmlFor="identity-pin" className="ds-field-label ml-1">Password</label>
            <input id="identity-pin" autoComplete="current-password" type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Password" className="ds-input mt-1 p-3" />
          </div>
          {error && <div className="bg-red-50 text-red-500 border border-red-200 p-3 rounded-lg text-xs" role="alert" aria-live="assertive">{error}</div>}
          <button type="submit" disabled={loading} aria-busy={loading} className="w-full ds-btn ds-btn-primary text-white py-4 mt-2">
            {loading ? <Loader2 className="animate-spin mx-auto"/> : "Verify and continue"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default IdentityScreen;
