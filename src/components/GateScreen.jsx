// src/components/GateScreen.jsx
import React, { useState } from 'react';
import { collection, query, where, getDocs, addDoc, serverTimestamp, updateDoc, doc, deleteField } from 'firebase/firestore';
import { Beaker, ShieldAlert, Lock, AlertCircle, Loader2 } from 'lucide-react';
import { db, appId, addAuditLog } from '../api/firebase';
import { createCredentialRecord, verifyCredentialRecord } from '../utils/security';

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
    if (snap.empty) return null;
    const labDoc = snap.docs[0];
    return { id: labDoc.id, ...labDoc.data() };
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const labData = await checkLabExists(labName.trim());
      if (isCreating) {
        if (labData) throw new Error("Lab name already taken.");
        if (!newAdminPass || !newMemberPass) throw new Error("Please fill in all passwords.");
        const adminCredential = await createCredentialRecord(newAdminPass.trim());
        const memberCredential = await createCredentialRecord(newMemberPass.trim());
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'labs'), {
            name: labName.trim(), adminCredential, memberCredential, createdAt: serverTimestamp()
        });
        await addAuditLog(labName.trim(), 'LAB_CREATE', `Lab Initialized`, 'System');
        onLoginSuccess({ role: 'ADMIN', labName: labName.trim() });
      } else {
        if (!labData) throw new Error("Lab not found.");
        const isAdminRole = role === 'ADMIN';
        const credentialField = isAdminRole ? 'adminCredential' : 'memberCredential';
        const legacyField = isAdminRole ? 'adminPin' : 'memberPin';
        const enteredPassword = password.trim();
        const credential = labData[credentialField];
        let isValid = false;

        if (credential) {
          isValid = await verifyCredentialRecord(enteredPassword, credential);
        } else if (typeof labData[legacyField] === 'string') {
          isValid = labData[legacyField] === enteredPassword;
          if (isValid) {
            const upgradedCredential = await createCredentialRecord(enteredPassword);
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'labs', labData.id), {
              [credentialField]: upgradedCredential,
              [legacyField]: deleteField()
            });
          }
        }

        if (!isValid) {
          throw new Error(isAdminRole ? "Invalid admin password." : "Invalid member password.");
        }

        onLoginSuccess({ role, labName: labName.trim() });
      }
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen ds-page p-4 md:p-6 ds-animate-enter">
      <div className="w-full max-w-md ds-card ds-section-lg">
        <div className="flex justify-center mb-4">
          <div className={`p-4 rounded-full ${isCreating ? 'bg-indigo-100' : role === 'ADMIN' ? 'bg-slate-800' : 'bg-blue-100'}`}>
            {isCreating ? <Beaker className="w-10 h-10 text-indigo-600"/> : role === 'ADMIN' ? <ShieldAlert className="w-10 h-10 text-white"/> : <Lock className="w-10 h-10 text-blue-600" />}
          </div>
        </div>
        <h1 className="text-2xl font-bold text-center text-slate-800 mb-2">{isCreating ? 'Create lab' : role === 'ADMIN' ? 'Admin sign in' : 'Member sign in'}</h1>
        {!isCreating && (
          <div className="flex bg-slate-100 p-1 rounded-[var(--ds-radius-lg)] overflow-hidden mb-6" role="tablist" aria-label="Choose role">
            <button type="button" role="tab" aria-selected={role==='MEMBER'} onClick={()=>setRole('MEMBER')} className={`flex-1 py-2 ds-tab text-xs font-bold ${role==='MEMBER'?'ds-tab-active text-blue-700':'ds-tab-inactive'}`}>Member</button>
            <button type="button" role="tab" aria-selected={role==='ADMIN'} onClick={()=>setRole('ADMIN')} className={`flex-1 py-2 ds-tab text-xs font-bold ${role==='ADMIN'?'ds-tab-active':'ds-tab-inactive'}`}>Admin</button>
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="lab-name" className="ds-field-label ml-1">Lab Name</label>
            <input id="lab-name" autoComplete="organization" type="text" value={labName} onChange={(e) => setLabName(e.target.value)} placeholder={isCreating ? "e.g. BioLab-X" : "Enter Lab Name"} className="ds-input mt-1 p-3" />
          </div>
          {isCreating ? (
            <>
              <div className="p-4 ds-card-muted"><label htmlFor="new-admin-pass" className="ds-field-label ml-1">Set Admin Password</label><input id="new-admin-pass" autoComplete="new-password" type="password" value={newAdminPass} onChange={(e) => setNewAdminPass(e.target.value)} className="ds-input mt-2 p-3 text-sm" /></div>
              <div className="p-4 rounded-xl border border-blue-100 bg-blue-50"><label htmlFor="new-member-pass" className="ds-field-label ml-1 text-blue-600">Set Member Password</label><input id="new-member-pass" autoComplete="new-password" type="password" value={newMemberPass} onChange={(e) => setNewMemberPass(e.target.value)} className="ds-input mt-2 p-3 text-sm border-blue-200 bg-white" /></div>
            </>
          ) : (
            <div>
              <label htmlFor="lab-password" className="ds-field-label ml-1">{role === 'ADMIN' ? 'Admin Password' : 'Member Password'}</label>
              <input id="lab-password" autoComplete="current-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="ds-input mt-1 p-3" />
            </div>
          )}
          {error && <div className="bg-red-50 text-red-500 p-3 rounded-lg text-xs flex items-center gap-2 border border-red-200" role="alert" aria-live="assertive"><AlertCircle className="w-4 h-4 shrink-0"/> <span>{error}</span></div>}
          <button type="submit" disabled={loading} aria-busy={loading} className="w-full ds-btn ds-btn-primary text-white py-4 mt-4 flex items-center justify-center gap-2">{loading ? <Loader2 className="animate-spin w-5 h-5" /> : isCreating ? "Create lab" : "Sign in"}</button>
        </form>
        <div className="mt-6 text-center border-t border-slate-100 pt-4">
          <button type="button" onClick={()=>{setIsCreating(!isCreating); setError(''); setPassword('');}} className="text-sm font-bold text-slate-500 hover:text-[var(--ds-brand-700)] underline">{isCreating ? 'Existing lab? Sign in' : 'Create lab'}</button>
        </div>
      </div>
    </div>
  );
};
