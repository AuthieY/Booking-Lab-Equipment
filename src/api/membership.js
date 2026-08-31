import {
  collection, doc, getDocs, query, where, writeBatch, setDoc, updateDoc,
  serverTimestamp, deleteField
} from 'firebase/firestore';
import { auth, db, appId } from './firebase';
import {
  CREDENTIAL_ITERATIONS,
  deriveProofBase64,
  generateSaltBase64,
  verifyCredentialRecord
} from '../utils/security';

// Login is a write: the client derives a PBKDF2 proof and writes a
// membership doc; Firestore rules accept it only when the proof matches
// the lab's stored (never-readable) secret. Every other rule authorizes
// against that membership doc.

const dataDoc = (...segments) => doc(db, 'artifacts', appId, 'public', 'data', ...segments);
const dataCollection = (name) => collection(db, 'artifacts', appId, 'public', 'data', name);

export const membershipDocId = (labName, uid) => `${labName}__${uid}`;

const authError = (message) => {
  const error = new Error(message);
  error.isAuthMessage = true;
  return error;
};

const isPermissionDenied = (error) => error?.code === 'permission-denied';

const requireUid = () => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw authError('Secure session unavailable. Please refresh and try again.');
  return uid;
};

export const findLabByName = async (name) => {
  const snap = await getDocs(query(dataCollection('labs'), where('name', '==', name)));
  if (snap.empty) return null;
  const labDoc = snap.docs[0];
  return { id: labDoc.id, ...labDoc.data() };
};

// Proofs are transient: rules validate them on write, then this removes them.
const stripTransientProofs = async (labName, uid) => {
  try {
    await updateDoc(dataDoc('memberships', membershipDocId(labName, uid)), {
      proof: deleteField(),
      userProof: deleteField()
    });
  } catch {
    // Best effort; a leftover proof is only readable by this uid.
  }
};

export const createLab = async ({ labName, adminPassword, memberPassword }) => {
  const uid = requireUid();
  if (labName.includes('/') || labName.startsWith('__')) {
    throw authError('Lab name cannot contain "/" or start with "__".');
  }
  const adminSalt = generateSaltBase64();
  const memberSalt = generateSaltBase64();
  const [adminProof, memberProof] = await Promise.all([
    deriveProofBase64(adminPassword, adminSalt, CREDENTIAL_ITERATIONS),
    deriveProofBase64(memberPassword, memberSalt, CREDENTIAL_ITERATIONS)
  ]);
  const labRef = doc(dataCollection('labs'));
  const batch = writeBatch(db);
  batch.set(labRef, {
    name: labName,
    adminSalt,
    adminIterations: CREDENTIAL_ITERATIONS,
    memberSalt,
    memberIterations: CREDENTIAL_ITERATIONS,
    createdAt: serverTimestamp()
  });
  batch.set(dataDoc('lab_secrets', labRef.id), {
    adminProof,
    memberProof,
    updatedAt: serverTimestamp()
  });
  batch.set(dataDoc('memberships', membershipDocId(labName, uid)), {
    labName,
    labId: labRef.id,
    uid,
    role: 'ADMIN',
    userName: 'Admin',
    labUserId: null,
    proof: adminProof,
    createdAt: serverTimestamp()
  });
  await batch.commit();
  await stripTransientProofs(labName, uid);
};

export const loginToLab = async ({ lab, role, password }) => {
  const uid = requireUid();
  const roleKey = role === 'ADMIN' ? 'admin' : 'member';
  const invalidMessage = role === 'ADMIN' ? 'Invalid admin password.' : 'Invalid member password.';
  const membershipRef = dataDoc('memberships', membershipDocId(lab.name, uid));

  const commitMembership = async (proof, addMigrationWrites) => {
    const record = {
      labName: lab.name,
      labId: lab.id,
      uid,
      role,
      userName: role === 'ADMIN' ? 'Admin' : null,
      labUserId: null,
      proof,
      createdAt: serverTimestamp()
    };
    if (addMigrationWrites) {
      const batch = writeBatch(db);
      addMigrationWrites(batch);
      batch.set(membershipRef, record);
      await batch.commit();
    } else {
      await setDoc(membershipRef, record);
    }
  };

  // Current format: salts are public, secrets live in lab_secrets and are
  // verified by rules on the membership write.
  if (typeof lab[`${roleKey}Salt`] === 'string') {
    const proof = await deriveProofBase64(password, lab[`${roleKey}Salt`], lab[`${roleKey}Iterations`]);
    try {
      await commitMembership(proof, null);
    } catch (error) {
      if (isPermissionDenied(error)) throw authError(invalidMessage);
      throw error;
    }
    await stripTransientProofs(lab.name, uid);
    return;
  }

  // Legacy format: credential records readable in the lab doc. Verify
  // locally, then migrate to the split format in the same batch as the
  // login. Rules force every migrated value from the stored records.
  const credential = lab[`${roleKey}Credential`];
  if (credential && typeof credential === 'object') {
    const isValid = await verifyCredentialRecord(password, credential);
    if (!isValid) throw authError(invalidMessage);

    if (!lab.adminCredential?.hash || !lab.memberCredential?.hash) {
      throw authError('This lab still uses an outdated password format for one role. Each role must sign in once on the previous app version before migrating.');
    }
    try {
      // The verified password derives exactly credential.hash, which is the
      // proof the migrated lab_secrets doc expects.
      await commitMembership(credential.hash, (batch) => {
        batch.set(dataDoc('labs', lab.id), {
          name: lab.name,
          adminSalt: lab.adminCredential.salt,
          adminIterations: lab.adminCredential.iterations,
          memberSalt: lab.memberCredential.salt,
          memberIterations: lab.memberCredential.iterations,
          ...(lab.createdAt ? { createdAt: lab.createdAt } : {})
        });
        batch.set(dataDoc('lab_secrets', lab.id), {
          adminProof: lab.adminCredential.hash,
          memberProof: lab.memberCredential.hash,
          updatedAt: serverTimestamp()
        });
      });
    } catch (error) {
      if (isPermissionDenied(error)) {
        throw authError('Unable to upgrade this lab to the new security format. Please try again.');
      }
      throw error;
    }
    await stripTransientProofs(lab.name, uid);
    return;
  }

  throw authError('This lab uses an outdated password format. Sign in once on the previous app version to upgrade it, or recreate the lab.');
};

export const verifyMemberIdentity = async ({ labName, userName, password }) => {
  const uid = requireUid();
  const membershipRef = dataDoc('memberships', membershipDocId(labName, uid));
  const lookup = await getDocs(query(
    dataCollection('lab_users'),
    where('labName', '==', labName),
    where('userName', '==', userName)
  ));

  // First use of this name in the lab: self-register identity + secret and
  // attach it to the membership, atomically.
  if (lookup.empty) {
    const salt = generateSaltBase64();
    const proof = await deriveProofBase64(password, salt, CREDENTIAL_ITERATIONS);
    const userRef = doc(dataCollection('lab_users'));
    const batch = writeBatch(db);
    batch.set(userRef, {
      labName,
      userName,
      salt,
      iterations: CREDENTIAL_ITERATIONS,
      createdAt: serverTimestamp()
    });
    batch.set(dataDoc('lab_user_secrets', userRef.id), {
      proof,
      updatedAt: serverTimestamp()
    });
    batch.update(membershipRef, { userName, labUserId: userRef.id, userProof: proof });
    await batch.commit();
    await stripTransientProofs(labName, uid);
    return { registered: true };
  }

  const userDoc = lookup.docs[0];
  const userData = userDoc.data();

  // Current format: derive the proof and let rules verify it.
  if (typeof userData.salt === 'string') {
    const proof = await deriveProofBase64(password, userData.salt, userData.iterations);
    try {
      await updateDoc(membershipRef, { userName, labUserId: userDoc.id, userProof: proof });
    } catch (error) {
      if (isPermissionDenied(error)) throw authError('Incorrect password.');
      throw error;
    }
    await stripTransientProofs(labName, uid);
    return { registered: false };
  }

  // Legacy record: verify locally, migrate to the split format in the same
  // batch as the identity attach (values forced by rules).
  if (userData.credential && typeof userData.credential === 'object') {
    const isValid = await verifyCredentialRecord(password, userData.credential);
    if (!isValid) throw authError('Incorrect password.');
    const batch = writeBatch(db);
    batch.set(doc(dataCollection('lab_users'), userDoc.id), {
      labName,
      userName,
      salt: userData.credential.salt,
      iterations: userData.credential.iterations,
      ...(userData.createdAt ? { createdAt: userData.createdAt } : {})
    });
    batch.set(dataDoc('lab_user_secrets', userDoc.id), {
      proof: userData.credential.hash,
      updatedAt: serverTimestamp()
    });
    batch.update(membershipRef, { userName, labUserId: userDoc.id, userProof: userData.credential.hash });
    await batch.commit();
    await stripTransientProofs(labName, uid);
    return { registered: false };
  }

  throw authError('This account uses an outdated password format. Ask your lab admin to delete it, then register again with a new password.');
};
