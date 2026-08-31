const ENCODER = new TextEncoder();
const DEFAULT_ITERATIONS = 120000;

const toBase64 = (bytes) => {
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
};

const fromBase64 = (value) => {
  const binary = atob(value);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
};

const subtle = () => {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Secure credential hashing is unavailable in this browser.');
  }
  return globalThis.crypto.subtle;
};

const safeEqual = (a = '', b = '') => {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
};

const deriveHash = async (password, saltBase64, iterations = DEFAULT_ITERATIONS) => {
  const keyMaterial = await subtle().importKey(
    'raw',
    ENCODER.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const derivedBits = await subtle().deriveBits(
    {
      name: 'PBKDF2',
      salt: fromBase64(saltBase64),
      iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );
  return toBase64(new Uint8Array(derivedBits));
};

export const CREDENTIAL_ITERATIONS = DEFAULT_ITERATIONS;

export const generateSaltBase64 = () => (
  toBase64(globalThis.crypto.getRandomValues(new Uint8Array(16)))
);

/**
 * Password proof sent to Firestore rules: base64(PBKDF2-SHA256(password)).
 */
export const deriveProofBase64 = (password, saltBase64, iterations = DEFAULT_ITERATIONS) => (
  deriveHash(password, saltBase64, Number(iterations) || DEFAULT_ITERATIONS)
);

/**
 * Verify password against a legacy client-verified credential record
 * (only used to pre-check before a rules-forced migration batch).
 */
export const verifyCredentialRecord = async (password, record) => {
  if (!record || typeof record !== 'object') return false;
  if (!record.salt || !record.hash) return false;
  const iterations = Number(record.iterations) || DEFAULT_ITERATIONS;
  const derived = await deriveHash(password, record.salt, iterations);
  return safeEqual(derived, record.hash);
};
