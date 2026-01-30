import React, { useState } from 'react';
import { collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { db, appId } from '../../api/firebase';

const IdentityScreen = ({ labName, onIdentityVerified }) => {
  const [name, setName] = useState(''); const [pin, setPin] = useState(''); const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  const handleIdentity = async (e) => { e.preventDefault(); if (!name.trim() || !pin.trim()) { setError('Please enter name and PIN'); return; } setLoading(true); setError('');
    try { const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'lab_users'); const q = query(usersRef, where('labName', '==', labName), where('userName', '==', name.trim())); const snapshot = await getDocs(q); if (snapshot.empty) { await addDoc(usersRef, { labName, userName: name.trim(), pinCode: pin.trim(), createdAt: serverTimestamp() }); onIdentityVerified(name.trim()); } else { const userData = snapshot.docs[0].data(); if (userData.pinCode === pin.trim()) onIdentityVerified(name.trim()); else setError('Wrong PIN!'); }
    } catch (err) { setError('Failed'); } finally { setLoading(false); }
  };
  return (<div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-6"><div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8"><h1 className="text-2xl font-bold text-center mb-6">Identity Verification</h1><form onSubmit={handleIdentity} className="space-y-4"><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your Name" className="w-full p-3 rounded-xl border-2 border-slate-100 outline-none" /><input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Personal PIN" className="w-full p-3 rounded-xl border-2 border-slate-100 outline-none" />{error && <div className="text-red-500 text-xs">{error}</div>}<button type="submit" disabled={loading} className="w-full bg-indigo-600 text-white font-bold py-4 rounded-xl mt-6">{loading ? <Loader2 className="animate-spin mx-auto"/> : "Verify & Enter"}</button></form></div></div>);
};

export default IdentityScreen;