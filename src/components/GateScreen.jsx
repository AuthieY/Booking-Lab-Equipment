// src/components/GateScreen.jsx
import React, { useState } from 'react';
import { collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { Beaker, ShieldAlert, Lock, AlertCircle, Loader2 } from 'lucide-react';
import { db, appId, addAuditLog } from '../api/firebase'; // 注意这里向上跳了一层文件夹

export const GateScreen = ({ onLoginSuccess }) => {
  const [isCreating, setIsCreating] = useState(false);
  const [role, setRole] = useState('MEMBER');
  const [labName, setLabName] = useState('');
  const [password, setPassword] = useState('');
  const [newAdminPass, setNewAdminPass] = useState('');
  const [newMemberPass, setNewMemberPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const checkLabExists = async (name) => {
    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'labs'), where('name', '==', name));
    const snap = await getDocs(q);
    return !snap.empty ? snap.docs[0].data() : null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const labData = await checkLabExists(labName.trim());
      if (isCreating) {
        if (labData) throw new Error("Lab name already taken.");
        if (!newAdminPass || !newMemberPass) throw new Error("Please fill in all passwords.");
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'labs'), {
            name: labName.trim(), adminPin: newAdminPass, memberPin: newMemberPass, createdAt: serverTimestamp()
        });
        await addAuditLog(labName.trim(), 'LAB_CREATE', `Lab Initialized`, 'System');
        onLoginSuccess({ role: 'ADMIN', labName: labName.trim() });
      } else {
        if (!labData) throw new Error("Lab does not exist.");
        if (role === 'ADMIN') {
            if (labData.adminPin === password) onLoginSuccess({ role: 'ADMIN', labName: labName.trim() });
            else throw new Error("Invalid Admin Password");
        } else {
            if (labData.memberPin === password) onLoginSuccess({ role: 'MEMBER', labName: labName.trim() });
            else throw new Error("Invalid Member Passcode");
        }
      }
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-6 animate-fade-in">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 transition-all">
        <div className="flex justify-center mb-6">
          <div className={`p-4 rounded-full ${isCreating ? 'bg-indigo-100' : role === 'ADMIN' ? 'bg-slate-800' : 'bg-blue-100'}`}>
            {isCreating ? <Beaker className="w-10 h-10 text-indigo-600"/> : role === 'ADMIN' ? <ShieldAlert className="w-10 h-10 text-white"/> : <Lock className="w-10 h-10 text-blue-600" />}
          </div>
        </div>
        <h1 className="text-2xl font-bold text-center text-slate-800 mb-2">{isCreating ? 'Create New Lab' : role === 'ADMIN' ? 'Admin Login' : 'Enter Lab'}</h1>
        {!isCreating && (
          <div className="flex bg-slate-100 p-1 rounded-xl mb-6">
            <button onClick={()=>setRole('MEMBER')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${role==='MEMBER'?'bg-white shadow text-blue-600':'text-slate-400'}`}>Member</button>
            <button onClick={()=>setRole('ADMIN')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${role==='ADMIN'?'bg-white shadow text-slate-800':'text-slate-400'}`}>Admin</button>
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="text-xs font-bold text-slate-400 uppercase ml-1">Lab Name</label><input type="text" value={labName} onChange={(e) => setLabName(e.target.value)} placeholder={isCreating ? "e.g. BioLab-X" : "Enter Lab Name"} className="w-full p-3 rounded-xl border-2 border-slate-100 focus:border-blue-500 focus:outline-none transition" /></div>
          {isCreating ? (
            <>
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100"><label className="text-xs font-bold text-slate-500 uppercase ml-1">Set Admin Password</label><input type="password" value={newAdminPass} onChange={(e) => setNewAdminPass(e.target.value)} className="w-full mt-2 p-3 rounded-lg border border-slate-200 focus:border-slate-800 focus:outline-none transition text-sm" /></div>
              <div className="p-4 bg-blue-50 rounded-xl border border-blue-100"><label className="text-xs font-bold text-blue-600 uppercase ml-1">Set Member Passcode</label><input type="password" value={newMemberPass} onChange={(e) => setNewMemberPass(e.target.value)} className="w-full mt-2 p-3 rounded-lg border border-blue-200 focus:border-blue-500 focus:outline-none transition text-sm" /></div>
            </>
          ) : (
            <div><label className="text-xs font-bold text-slate-400 uppercase ml-1">{role === 'ADMIN' ? 'Admin Password' : 'Member Passcode'}</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={`w-full p-3 rounded-xl border-2 border-slate-100 focus:outline-none transition ${role==='ADMIN' ? 'focus:border-slate-800' : 'focus:border-blue-500'}`} /></div>
          )}
          {error && <div className="bg-red-50 text-red-500 p-3 rounded-lg text-xs flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0"/> <span>{error}</span></div>}
          <button type="submit" disabled={loading} className={`w-full text-white font-bold py-4 rounded-xl transition shadow-lg mt-4 flex items-center justify-center gap-2 ${isCreating ? 'bg-indigo-600 hover:bg-indigo-700' : role==='ADMIN'?'bg-slate-800 hover:bg-slate-900':'bg-blue-600 hover:bg-blue-700'}`}>{loading ? <Loader2 className="animate-spin w-5 h-5" /> : isCreating ? "Create Now" : "Login"}</button>
        </form>
        <div className="mt-6 text-center border-t border-slate-100 pt-4">
          <button onClick={()=>{setIsCreating(!isCreating); setError(''); setPassword('');}} className="text-sm font-bold text-slate-500 hover:text-blue-600 underline">{isCreating ? 'Existing Lab? Login' : 'Create New Lab'}</button>
        </div>
      </div>
    </div>
  );
};