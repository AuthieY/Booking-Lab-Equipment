import React, { useState } from 'react';
import { Loader2, User } from 'lucide-react';
import { verifyMemberIdentity } from '../../api/membership';

// Fixed avatar hue set — deterministic per name, theme-invariant by design.
const AVATAR_HUES = ['#4f7086', '#6c6280', '#5e7a5c', '#85603f', '#40706f', '#7b5c54'];

const avatarHueFor = (trimmedName) => {
  let hash = 0;
  for (let i = 0; i < trimmedName.length; i += 1) {
    hash = (hash * 31 + trimmedName.charCodeAt(i)) % 9973;
  }
  return AVATAR_HUES[hash % AVATAR_HUES.length];
};

const initialsFor = (trimmedName) => trimmedName
  .split(/\s+/)
  .slice(0, 2)
  .map((word) => word[0])
  .join('')
  .toUpperCase();

const IdentityScreen = ({ labName, onIdentityVerified }) => {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleIdentity = async (event) => {
    event.preventDefault();

    const normalizedName = name.trim();
    const normalizedPassword = password.trim();
    if (!normalizedName || !normalizedPassword) {
      setError('Please enter your name and password.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await verifyMemberIdentity({
        labName,
        userName: normalizedName,
        password: normalizedPassword
      });
      onIdentityVerified(normalizedName);
    } catch (err) {
      setError(err?.isAuthMessage ? err.message : 'Unable to verify identity.');
    } finally {
      setLoading(false);
    }
  };

  // Render-only avatar derived from the typed name; no persistence.
  const trimmedName = name.trim();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen ds-page p-4 md:p-6 ds-animate-enter-fast">
      <div className="w-full max-w-sm ds-card ds-section-lg">
        <div className="flex items-center justify-center mb-3">
          <span className="ds-microcaps text-[color:var(--ds-text-muted)]">Booking-Lab</span>
        </div>
        <h1 className="text-lg font-bold text-center mb-2 text-[color:var(--ds-text-strong)]">Identity verification</h1>
        <p className="text-xs text-[color:var(--ds-text-muted)] text-center mb-6">Enter your name and password to continue.</p>
        <form onSubmit={handleIdentity} className="space-y-4">
          <div className="flex justify-center" aria-hidden="true">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold text-white"
              style={{ background: trimmedName ? avatarHueFor(trimmedName) : 'var(--ds-surface-muted)' }}
            >
              {trimmedName
                ? initialsFor(trimmedName)
                : <User className="w-4 h-4 text-[color:var(--ds-text-soft)]" />}
            </div>
          </div>
          <div>
            <label htmlFor="identity-name" className="ds-field-label ml-1">Name</label>
            <input
              id="identity-name"
              autoComplete="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your Name"
              className="ds-input mt-1 p-3"
            />
          </div>
          <div>
            <label htmlFor="identity-password" className="ds-field-label ml-1">Password</label>
            <input
              id="identity-password"
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="ds-input mt-1 p-3"
            />
          </div>
          {error && (
            <p className="text-xs text-[color:var(--ds-danger-text)] border-l-2 border-[var(--ds-danger-text)] pl-2" role="alert" aria-live="assertive">
              {error}
            </p>
          )}
          <button type="submit" disabled={loading} aria-busy={loading} className="w-full ds-btn ds-btn-primary py-3.5 mt-2 text-[13px] font-semibold uppercase tracking-wide flex items-center justify-center gap-2">
            {loading ? <Loader2 className="animate-spin w-5 h-5" /> : 'Verify and continue'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default IdentityScreen;
