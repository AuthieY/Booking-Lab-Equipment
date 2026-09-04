// src/components/GateScreen.jsx
import React, { useState } from 'react';
import { Beaker, ShieldAlert, Lock, Loader2 } from 'lucide-react';
import { addAuditLog } from '../api/firebase';
import { findLabByName, createLab, loginToLab } from '../api/membership';
import ThemeToggle from './common/ThemeToggle';

export const GateScreen = ({ onLoginSuccess }) => {
  const [isCreating, setIsCreating] = useState(false);
  const [role, setRole] = useState('MEMBER');
  const [labName, setLabName] = useState('');
  const [password, setPassword] = useState('');
  const [newAdminPass, setNewAdminPass] = useState('');
  const [newMemberPass, setNewMemberPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const trimmedName = labName.trim();
      const labData = await findLabByName(trimmedName);
      if (isCreating) {
        if (labData) throw new Error("Lab name already taken.");
        if (!newAdminPass || !newMemberPass) throw new Error("Please fill in all passwords.");
        await createLab({
          labName: trimmedName,
          adminPassword: newAdminPass.trim(),
          memberPassword: newMemberPass.trim()
        });
        await addAuditLog(trimmedName, 'LAB_CREATE', `Lab Initialized`, 'Admin');
        onLoginSuccess({ role: 'ADMIN', labName: trimmedName });
      } else {
        if (!labData) throw new Error("Lab not found.");
        await loginToLab({ lab: labData, role, password: password.trim() });
        onLoginSuccess({ role, labName: trimmedName });
      }
    } catch (err) {
      // Firestore/network errors carry a code; show those as a generic
      // message instead of leaking internals.
      setError(err?.code ? 'Unable to sign in. Please check your connection and try again.' : err.message);
    } finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen ds-page p-4 md:p-6 ds-animate-enter">
      <div className="fixed top-3 right-3 z-10">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm ds-card ds-section-lg">
        <div className="flex items-center justify-center gap-2 mb-3">
          {isCreating
            ? <Beaker className="w-5 h-5 text-[color:var(--ds-text-strong)]" aria-hidden="true" />
            : role === 'ADMIN'
              ? <ShieldAlert className="w-5 h-5 text-[color:var(--ds-text-strong)]" aria-hidden="true" />
              : <Lock className="w-5 h-5 text-[color:var(--ds-text-strong)]" aria-hidden="true" />}
          <span className="ds-microcaps text-[color:var(--ds-text-muted)]">Booking-Lab</span>
        </div>
        <h1 className="text-lg font-bold text-center text-[color:var(--ds-text-strong)] mb-2">{isCreating ? 'Create lab' : role === 'ADMIN' ? 'Admin sign in' : 'Member sign in'}</h1>
        {!isCreating && (
          <div className="flex border-b border-[var(--ds-rule-strong)] mb-6" role="tablist" aria-label="Select role">
            <button type="button" role="tab" aria-selected={role==='MEMBER'} onClick={()=>setRole('MEMBER')} className={`flex-1 py-2 ds-tab text-xs font-semibold ${role==='MEMBER'?'ds-tab-active':'ds-tab-inactive'}`}>Member</button>
            <button type="button" role="tab" aria-selected={role==='ADMIN'} onClick={()=>setRole('ADMIN')} className={`flex-1 py-2 ds-tab text-xs font-semibold ${role==='ADMIN'?'ds-tab-active':'ds-tab-inactive'}`}>Admin</button>
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
              <div className="p-4 ds-card-muted"><label htmlFor="new-member-pass" className="ds-field-label ml-1">Set Member Password</label><input id="new-member-pass" autoComplete="new-password" type="password" value={newMemberPass} onChange={(e) => setNewMemberPass(e.target.value)} className="ds-input mt-2 p-3 text-sm" /></div>
            </>
          ) : (
            <div>
              <label htmlFor="lab-password" className="ds-field-label ml-1">{role === 'ADMIN' ? 'Admin Password' : 'Member Password'}</label>
              <input id="lab-password" autoComplete="current-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="ds-input mt-1 p-3" />
            </div>
          )}
          {error && <p className="text-xs text-[color:var(--ds-danger-text)] border-l-2 border-[var(--ds-danger-text)] pl-2" role="alert" aria-live="assertive">{error}</p>}
          <button type="submit" disabled={loading} aria-busy={loading} className="w-full ds-btn ds-btn-primary py-3.5 mt-4 text-[13px] font-semibold uppercase tracking-wide flex items-center justify-center gap-2">{loading ? <Loader2 className="animate-spin w-5 h-5" /> : isCreating ? "Create lab" : "Sign in"}</button>
        </form>
        <div className="mt-6 text-center border-t border-[var(--ds-rule)] pt-4">
          <button type="button" onClick={()=>{setIsCreating(!isCreating); setError(''); setPassword('');}} className="text-xs font-semibold text-[color:var(--ds-text-muted)] underline hover:text-[color:var(--ds-text)]">{isCreating ? 'Existing lab? Sign in' : 'Create lab'}</button>
        </div>
      </div>
    </div>
  );
};
