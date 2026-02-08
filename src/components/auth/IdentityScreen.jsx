import React, { useState } from 'react';
import { collection, query, where, getDocs, addDoc, serverTimestamp, updateDoc, doc, deleteField } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { db, appId } from '../../api/firebase';
import { createCredentialRecord, verifyCredentialRecord } from '../../utils/security';

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
      const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'lab_users');
      const lookup = query(usersRef, where('labName', '==', labName), where('userName', '==', normalizedName));
      const snapshot = await getDocs(lookup);

      if (snapshot.empty) {
        const credential = await createCredentialRecord(normalizedPassword);
        await addDoc(usersRef, {
          labName,
          userName: normalizedName,
          credential,
          createdAt: serverTimestamp()
        });
        onIdentityVerified(normalizedName);
        return;
      }

      const userDoc = snapshot.docs[0];
      const userData = userDoc.data();
      let isValid = false;

      if (userData.credential) {
        isValid = await verifyCredentialRecord(normalizedPassword, userData.credential);
      } else if (typeof userData.pinCode === 'string') {
        isValid = userData.pinCode === normalizedPassword;
        if (isValid) {
          const upgradedCredential = await createCredentialRecord(normalizedPassword);
          await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'lab_users', userDoc.id), {
            credential: upgradedCredential,
            pinCode: deleteField()
          });
        }
      }

      if (!isValid) {
        setError('Incorrect password.');
        return;
      }

      onIdentityVerified(normalizedName);
    } catch {
      setError('Unable to verify identity.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen ds-page p-4 md:p-6 ds-animate-enter-fast">
      <div className="w-full max-w-md ds-card ds-section-lg">
        <h1 className="text-2xl font-bold text-center mb-2 text-slate-800">Identity verification</h1>
        <p className="text-xs text-slate-500 text-center mb-6">Enter your name and password to continue.</p>
        <form onSubmit={handleIdentity} className="space-y-4">
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
            <div className="bg-red-50 text-red-500 border border-red-200 p-3 rounded-lg text-xs" role="alert" aria-live="assertive">
              {error}
            </div>
          )}
          <button type="submit" disabled={loading} aria-busy={loading} className="w-full ds-btn ds-btn-primary text-white py-4 mt-2">
            {loading ? <Loader2 className="animate-spin mx-auto" /> : 'Verify and continue'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default IdentityScreen;
