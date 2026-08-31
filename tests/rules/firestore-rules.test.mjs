import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, deleteField,
  collection, query, where, writeBatch, serverTimestamp
} from 'firebase/firestore';
import {
  deriveProofBase64,
  generateSaltBase64,
  CREDENTIAL_ITERATIONS
} from '../../src/utils/security.js';

const APP_ID = 'booking-lab';
const DATA = `artifacts/${APP_ID}/public/data`;

const LAB = 'Alpha Lab';
const LAB_ID = 'alpha-lab-id';
const OTHER_LAB = 'Beta Lab';
const OTHER_LAB_ID = 'beta-lab-id';
const LEGACY_LAB = 'Legacy Lab';
const LEGACY_LAB_ID = 'legacy-lab-id';

const ADMIN_UID = 'admin-uid';
const ALICE_UID = 'alice-uid';
const OUTSIDER_UID = 'outsider-uid';
const BETA_UID = 'beta-member-uid';

const ADMIN_PASS = 'admin-secret';
const MEMBER_PASS = 'member-secret';
const ALICE_PASS = 'alice-pass';

let env;
let fixtures;

const dataPath = (...segments) => [DATA, ...segments].join('/');
const membershipId = (labName, uid) => `${labName}__${uid}`;

const makeLegacyCredential = async (password) => {
  const salt = generateSaltBase64();
  const hash = await deriveProofBase64(password, salt, CREDENTIAL_ITERATIONS);
  return { v: 1, algo: 'PBKDF2-SHA256', iterations: CREDENTIAL_ITERATIONS, salt, hash };
};

test.before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'booking-lab-equipment',
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') }
  });

  const adminSalt = generateSaltBase64();
  const memberSalt = generateSaltBase64();
  const adminProof = await deriveProofBase64(ADMIN_PASS, adminSalt, CREDENTIAL_ITERATIONS);
  const memberProof = await deriveProofBase64(MEMBER_PASS, memberSalt, CREDENTIAL_ITERATIONS);

  const aliceSalt = generateSaltBase64();
  const aliceProof = await deriveProofBase64(ALICE_PASS, aliceSalt, CREDENTIAL_ITERATIONS);

  const legacyAdminCred = await makeLegacyCredential('legacy-admin');
  const legacyMemberCred = await makeLegacyCredential('legacy-member');
  const legacyUserCred = await makeLegacyCredential('bob-pass');

  fixtures = {
    adminSalt, memberSalt, adminProof, memberProof,
    aliceSalt, aliceProof,
    legacyAdminCred, legacyMemberCred, legacyUserCred
  };

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const now = new Date();

    await setDoc(doc(db, dataPath('labs', LAB_ID)), {
      name: LAB,
      adminSalt, adminIterations: CREDENTIAL_ITERATIONS,
      memberSalt, memberIterations: CREDENTIAL_ITERATIONS,
      createdAt: now
    });
    await setDoc(doc(db, dataPath('lab_secrets', LAB_ID)), {
      adminProof,
      memberProof,
      updatedAt: now
    });

    await setDoc(doc(db, dataPath('labs', OTHER_LAB_ID)), {
      name: OTHER_LAB,
      adminSalt, adminIterations: CREDENTIAL_ITERATIONS,
      memberSalt, memberIterations: CREDENTIAL_ITERATIONS,
      createdAt: now
    });
    await setDoc(doc(db, dataPath('lab_secrets', OTHER_LAB_ID)), {
      adminProof,
      memberProof,
      updatedAt: now
    });

    await setDoc(doc(db, dataPath('labs', LEGACY_LAB_ID)), {
      name: LEGACY_LAB,
      adminCredential: legacyAdminCred,
      memberCredential: legacyMemberCred,
      createdAt: now
    });

    // Established memberships: Alpha admin, Alice (verified member), Beta member.
    await setDoc(doc(db, dataPath('memberships', membershipId(LAB, ADMIN_UID))), {
      labName: LAB, labId: LAB_ID, uid: ADMIN_UID, role: 'ADMIN',
      userName: 'Admin', labUserId: null, createdAt: now
    });
    await setDoc(doc(db, dataPath('memberships', membershipId(LAB, ALICE_UID))), {
      labName: LAB, labId: LAB_ID, uid: ALICE_UID, role: 'MEMBER',
      userName: 'Alice', labUserId: 'alice-user-id', createdAt: now
    });
    await setDoc(doc(db, dataPath('memberships', membershipId(OTHER_LAB, BETA_UID))), {
      labName: OTHER_LAB, labId: OTHER_LAB_ID, uid: BETA_UID, role: 'MEMBER',
      userName: 'Bea', labUserId: 'bea-user-id', createdAt: now
    });

    await setDoc(doc(db, dataPath('lab_users', 'alice-user-id')), {
      labName: LAB, userName: 'Alice',
      salt: aliceSalt, iterations: CREDENTIAL_ITERATIONS, createdAt: now
    });
    await setDoc(doc(db, dataPath('lab_user_secrets', 'alice-user-id')), {
      proof: aliceProof, updatedAt: now
    });
    await setDoc(doc(db, dataPath('lab_users', 'bob-user-id')), {
      labName: LAB, userName: 'Bob',
      credential: legacyUserCred, createdAt: now
    });

    await setDoc(doc(db, dataPath('instruments', 'inst-1')), {
      labName: LAB, name: 'Mastersizer', location: 'Room 1', maxCapacity: 2,
      color: 'blue', createdAt: now
    });
    await setDoc(doc(db, dataPath('bookings', 'booking-alice')), {
      labName: LAB, instrumentId: 'inst-1', instrumentName: 'Mastersizer',
      date: '2026-09-07', hour: 10, userName: 'Alice', authUid: ALICE_UID,
      selectedUnit: null, requestedQuantity: 1, bookingComment: null,
      bookingGroupId: null, createdAt: now
    });
    await setDoc(doc(db, dataPath('bookings', 'booking-bob')), {
      labName: LAB, instrumentId: 'inst-1', instrumentName: 'Mastersizer',
      date: '2026-09-07', hour: 11, userName: 'Bob', authUid: 'bob-old-uid',
      selectedUnit: null, requestedQuantity: 1, bookingComment: null,
      bookingGroupId: null, createdAt: now
    });
    await setDoc(doc(db, dataPath('notes', 'note-1')), {
      labName: LAB, instrumentId: 'inst-1', instrumentName: 'Mastersizer',
      userName: 'Alice', message: 'Laser misaligned', timestamp: now
    });
  });
});

test.after(async () => {
  await env.cleanup();
});

const asUser = (uid) => env.authenticatedContext(uid).firestore();
const asAnon = () => env.unauthenticatedContext().firestore();

// ---------------------------------------------------------------------------
// Secret protection
// ---------------------------------------------------------------------------

test('lab_secrets and lab_user_secrets are unreadable by anyone', async () => {
  await assertFails(getDoc(doc(asUser(OUTSIDER_UID), dataPath('lab_secrets', LAB_ID))));
  await assertFails(getDoc(doc(asUser(ADMIN_UID), dataPath('lab_secrets', LAB_ID))));
  await assertFails(getDoc(doc(asUser(OUTSIDER_UID), dataPath('lab_user_secrets', 'alice-user-id'))));
});

test('labs are readable for the gate lookup but carry no secrets', async () => {
  const snap = await assertSucceeds(getDoc(doc(asUser(OUTSIDER_UID), dataPath('labs', LAB_ID))));
  assert.equal(snap.data().adminProof, undefined);
  assert.equal(snap.data().adminCredential, undefined);
});

test('unauthenticated requests are rejected everywhere', async () => {
  await assertFails(getDoc(doc(asAnon(), dataPath('labs', LAB_ID))));
});

test('membership docs are readable only by their owner', async () => {
  await assertSucceeds(getDoc(doc(asUser(ALICE_UID), dataPath('memberships', membershipId(LAB, ALICE_UID)))));
  await assertFails(getDoc(doc(asUser(OUTSIDER_UID), dataPath('memberships', membershipId(LAB, ALICE_UID)))));
  await assertFails(getDocs(collection(asUser(OUTSIDER_UID), dataPath('memberships'))));
});

// ---------------------------------------------------------------------------
// Login (membership writes)
// ---------------------------------------------------------------------------

const loginRecord = (uid, role, proof, overrides = {}) => ({
  labName: LAB, labId: LAB_ID, uid, role,
  userName: role === 'ADMIN' ? 'Admin' : null,
  labUserId: null, proof, createdAt: serverTimestamp(),
  ...overrides
});

test('member login succeeds with the correct proof and can strip it after', async () => {
  const db = asUser('fresh-member-uid');
  const ref = doc(db, dataPath('memberships', membershipId(LAB, 'fresh-member-uid')));
  await assertSucceeds(setDoc(ref, loginRecord('fresh-member-uid', 'MEMBER', fixtures.memberProof)));
  await assertSucceeds(updateDoc(ref, { proof: deleteField(), userProof: deleteField() }));
});

test('login fails with a wrong proof', async () => {
  const db = asUser('bad-pass-uid');
  const wrongProof = await deriveProofBase64('wrong-password', fixtures.memberSalt, CREDENTIAL_ITERATIONS);
  await assertFails(setDoc(
    doc(db, dataPath('memberships', membershipId(LAB, 'bad-pass-uid'))),
    loginRecord('bad-pass-uid', 'MEMBER', wrongProof)
  ));
});

test('member proof cannot buy the ADMIN role', async () => {
  const db = asUser('escalate-uid');
  await assertFails(setDoc(
    doc(db, dataPath('memberships', membershipId(LAB, 'escalate-uid'))),
    loginRecord('escalate-uid', 'ADMIN', fixtures.memberProof)
  ));
});

test('membership cannot be written for another uid or another lab id', async () => {
  const db = asUser('mallory-uid');
  await assertFails(setDoc(
    doc(db, dataPath('memberships', membershipId(LAB, ALICE_UID))),
    loginRecord(ALICE_UID, 'MEMBER', fixtures.memberProof)
  ));
  await assertFails(setDoc(
    doc(db, dataPath('memberships', membershipId(LAB, 'mallory-uid'))),
    loginRecord('mallory-uid', 'MEMBER', fixtures.memberProof, { labId: OTHER_LAB_ID })
  ));
});

// ---------------------------------------------------------------------------
// Lab creation and takeover protection
// ---------------------------------------------------------------------------

test('creating a lab requires the full atomic batch and succeeds with it', async () => {
  const uid = 'creator-uid';
  const db = asUser(uid);
  const labRef = doc(collection(db, dataPath('labs')));
  const salt = generateSaltBase64();
  const proof = await deriveProofBase64('new-admin-pass', salt, CREDENTIAL_ITERATIONS);
  const memberSalt2 = generateSaltBase64();
  const memberProof2 = await deriveProofBase64('new-member-pass', memberSalt2, CREDENTIAL_ITERATIONS);

  // Lab doc alone is rejected.
  await assertFails(setDoc(doc(db, dataPath('labs', 'lonely-lab')), {
    name: 'Lonely Lab',
    adminSalt: salt, adminIterations: CREDENTIAL_ITERATIONS,
    memberSalt: memberSalt2, memberIterations: CREDENTIAL_ITERATIONS,
    createdAt: serverTimestamp()
  }));

  const batch = writeBatch(db);
  batch.set(labRef, {
    name: 'Gamma Lab',
    adminSalt: salt, adminIterations: CREDENTIAL_ITERATIONS,
    memberSalt: memberSalt2, memberIterations: CREDENTIAL_ITERATIONS,
    createdAt: serverTimestamp()
  });
  batch.set(doc(db, dataPath('lab_secrets', labRef.id)), {
    adminProof: proof,
    memberProof: memberProof2,
    updatedAt: serverTimestamp()
  });
  batch.set(doc(db, dataPath('memberships', membershipId('Gamma Lab', uid))), {
    labName: 'Gamma Lab', labId: labRef.id, uid, role: 'ADMIN',
    userName: 'Admin', labUserId: null, proof, createdAt: serverTimestamp()
  });
  await assertSucceeds(batch.commit());
});

test('lab names cannot contain "/" or start with "__"', async () => {
  const uid = 'namer-uid';
  const db = asUser(uid);

  // '/' cannot even form a membership doc id — the SDK itself refuses it,
  // and the client validates before writing.
  assert.throws(() => doc(db, dataPath('memberships', `bad/lab__${uid}`)));

  // Names with the reserved '__' prefix are rejected by the rules even in
  // an otherwise fully valid creation batch.
  const badName = '__sneaky';
  const labRef = doc(collection(db, dataPath('labs')));
  const batch = writeBatch(db);
  batch.set(labRef, {
    name: badName,
    adminSalt: fixtures.adminSalt, adminIterations: CREDENTIAL_ITERATIONS,
    memberSalt: fixtures.memberSalt, memberIterations: CREDENTIAL_ITERATIONS,
    createdAt: serverTimestamp()
  });
  batch.set(doc(db, dataPath('lab_secrets', labRef.id)), {
    adminProof: fixtures.adminProof,
    memberProof: fixtures.memberProof,
    updatedAt: serverTimestamp()
  });
  batch.set(doc(db, dataPath('memberships', `${badName}__extra__${uid}`)), {
    labName: badName, labId: labRef.id, uid, role: 'ADMIN',
    userName: 'Admin', labUserId: null, proof: fixtures.adminProof, createdAt: serverTimestamp()
  });
  await assertFails(batch.commit());
});

test('nobody can overwrite an existing lab or its secrets without admin membership', async () => {
  const attacker = asUser(OUTSIDER_UID);
  await assertFails(setDoc(doc(attacker, dataPath('labs', LAB_ID)), {
    name: LAB,
    adminSalt: generateSaltBase64(), adminIterations: CREDENTIAL_ITERATIONS,
    memberSalt: generateSaltBase64(), memberIterations: CREDENTIAL_ITERATIONS,
    createdAt: serverTimestamp()
  }));
  await assertFails(setDoc(doc(attacker, dataPath('lab_secrets', LAB_ID)), {
    adminProof: fixtures.memberProof,
    memberProof: fixtures.memberProof,
    updatedAt: serverTimestamp()
  }));
  // Even a legitimate member of the lab cannot rotate its secrets.
  await assertFails(setDoc(doc(asUser(ALICE_UID), dataPath('lab_secrets', LAB_ID)), {
    adminProof: fixtures.memberProof,
    memberProof: fixtures.memberProof,
    updatedAt: serverTimestamp()
  }));
});

test('labs and lab_users cannot be deleted by clients; secrets never', async () => {
  await assertFails(deleteDoc(doc(asUser(ADMIN_UID), dataPath('labs', LAB_ID))));
  await assertFails(deleteDoc(doc(asUser(ADMIN_UID), dataPath('lab_secrets', LAB_ID))));
});

// ---------------------------------------------------------------------------
// Legacy lab migration
// ---------------------------------------------------------------------------

test('legacy lab migrates only with rule-forced values, then login works', async () => {
  const uid = 'legacy-admin-uid';
  const db = asUser(uid);

  // Attacker-chosen secrets are rejected.
  const evilBatch = writeBatch(db);
  evilBatch.set(doc(db, dataPath('labs', LEGACY_LAB_ID)), {
    name: LEGACY_LAB,
    adminSalt: fixtures.legacyAdminCred.salt,
    adminIterations: fixtures.legacyAdminCred.iterations,
    memberSalt: fixtures.legacyMemberCred.salt,
    memberIterations: fixtures.legacyMemberCred.iterations
  });
  evilBatch.set(doc(db, dataPath('lab_secrets', LEGACY_LAB_ID)), {
    adminProof: fixtures.memberProof,
    memberProof: fixtures.legacyMemberCred.hash,
    updatedAt: serverTimestamp()
  });
  await assertFails(evilBatch.commit());

  // The honest migration (values derived from the stored records) passes.
  const batch = writeBatch(db);
  batch.set(doc(db, dataPath('labs', LEGACY_LAB_ID)), {
    name: LEGACY_LAB,
    adminSalt: fixtures.legacyAdminCred.salt,
    adminIterations: fixtures.legacyAdminCred.iterations,
    memberSalt: fixtures.legacyMemberCred.salt,
    memberIterations: fixtures.legacyMemberCred.iterations
  });
  batch.set(doc(db, dataPath('lab_secrets', LEGACY_LAB_ID)), {
    adminProof: fixtures.legacyAdminCred.hash,
    memberProof: fixtures.legacyMemberCred.hash,
    updatedAt: serverTimestamp()
  });
  batch.set(doc(db, dataPath('memberships', membershipId(LEGACY_LAB, uid))), {
    labName: LEGACY_LAB, labId: LEGACY_LAB_ID, uid, role: 'ADMIN',
    userName: 'Admin', labUserId: null,
    proof: fixtures.legacyAdminCred.hash, createdAt: serverTimestamp()
  });
  await assertSucceeds(batch.commit());
});

// ---------------------------------------------------------------------------
// Identity verification
// ---------------------------------------------------------------------------

test('identity attach requires the correct personal proof', async () => {
  const uid = 'identity-uid';
  const db = asUser(uid);
  const ref = doc(db, dataPath('memberships', membershipId(LAB, uid)));
  await assertSucceeds(setDoc(ref, loginRecord(uid, 'MEMBER', fixtures.memberProof)));

  await assertFails(updateDoc(ref, {
    userName: 'Alice', labUserId: 'alice-user-id',
    userProof: await deriveProofBase64('wrong', fixtures.aliceSalt, CREDENTIAL_ITERATIONS)
  }));
  // Claiming Alice's name with a mismatched lab_users doc also fails.
  await assertFails(updateDoc(ref, {
    userName: 'Alice', labUserId: 'bob-user-id', userProof: fixtures.aliceProof
  }));
  await assertSucceeds(updateDoc(ref, {
    userName: 'Alice', labUserId: 'alice-user-id', userProof: fixtures.aliceProof
  }));
});

test('legacy lab_user migrates during identity attach with forced values only', async () => {
  const uid = 'bob-session-uid';
  const db = asUser(uid);
  const membershipRef = doc(db, dataPath('memberships', membershipId(LAB, uid)));
  await assertSucceeds(setDoc(membershipRef, loginRecord(uid, 'MEMBER', fixtures.memberProof)));

  // Attacker-chosen secret for Bob is rejected.
  const evilBatch = writeBatch(db);
  evilBatch.set(doc(db, dataPath('lab_users', 'bob-user-id')), {
    labName: LAB, userName: 'Bob',
    salt: fixtures.legacyUserCred.salt, iterations: fixtures.legacyUserCred.iterations
  });
  evilBatch.set(doc(db, dataPath('lab_user_secrets', 'bob-user-id')), {
    proof: fixtures.memberProof, updatedAt: serverTimestamp()
  });
  evilBatch.update(membershipRef, {
    userName: 'Bob', labUserId: 'bob-user-id', userProof: fixtures.memberProof
  });
  await assertFails(evilBatch.commit());

  // The honest migration (proof taken verbatim from the legacy record) passes.
  const batch = writeBatch(db);
  batch.set(doc(db, dataPath('lab_users', 'bob-user-id')), {
    labName: LAB, userName: 'Bob',
    salt: fixtures.legacyUserCred.salt, iterations: fixtures.legacyUserCred.iterations
  });
  batch.set(doc(db, dataPath('lab_user_secrets', 'bob-user-id')), {
    proof: fixtures.legacyUserCred.hash, updatedAt: serverTimestamp()
  });
  batch.update(membershipRef, {
    userName: 'Bob', labUserId: 'bob-user-id', userProof: fixtures.legacyUserCred.hash
  });
  await assertSucceeds(batch.commit());
});

test('auto-register batch works for members and is closed to outsiders', async () => {
  const uid = 'register-uid';
  const db = asUser(uid);
  const membershipRef = doc(db, dataPath('memberships', membershipId(LAB, uid)));
  await assertSucceeds(setDoc(membershipRef, loginRecord(uid, 'MEMBER', fixtures.memberProof)));

  const salt = generateSaltBase64();
  const proof = await deriveProofBase64('carol-pass', salt, CREDENTIAL_ITERATIONS);
  const userRef = doc(collection(db, dataPath('lab_users')));
  const batch = writeBatch(db);
  batch.set(userRef, {
    labName: LAB, userName: 'Carol', salt,
    iterations: CREDENTIAL_ITERATIONS, createdAt: serverTimestamp()
  });
  batch.set(doc(db, dataPath('lab_user_secrets', userRef.id)), {
    proof, updatedAt: serverTimestamp()
  });
  batch.update(membershipRef, { userName: 'Carol', labUserId: userRef.id, userProof: proof });
  await assertSucceeds(batch.commit());

  // An outsider without lab membership cannot register identities.
  const outsider = asUser(OUTSIDER_UID);
  const outsiderRef = doc(collection(outsider, dataPath('lab_users')));
  const outsiderBatch = writeBatch(outsider);
  outsiderBatch.set(outsiderRef, {
    labName: LAB, userName: 'Intruder', salt,
    iterations: CREDENTIAL_ITERATIONS, createdAt: serverTimestamp()
  });
  outsiderBatch.set(doc(outsider, dataPath('lab_user_secrets', outsiderRef.id)), {
    proof, updatedAt: serverTimestamp()
  });
  await assertFails(outsiderBatch.commit());
});

// ---------------------------------------------------------------------------
// Data access: instruments, bookings, aggregates, notes, logs
// ---------------------------------------------------------------------------

test('lab data is readable only by that lab members', async () => {
  const memberQuery = (db) => getDocs(query(
    collection(db, dataPath('instruments')), where('labName', '==', LAB)
  ));
  await assertSucceeds(memberQuery(asUser(ALICE_UID)));
  await assertSucceeds(memberQuery(asUser(ADMIN_UID)));
  await assertFails(memberQuery(asUser(OUTSIDER_UID)));
  await assertFails(memberQuery(asUser(BETA_UID)));

  const bookingsQuery = (db) => getDocs(query(
    collection(db, dataPath('bookings')),
    where('labName', '==', LAB), where('date', '>=', '2026-09-01'), where('date', '<=', '2026-09-14')
  ));
  await assertSucceeds(bookingsQuery(asUser(ALICE_UID)));
  await assertFails(bookingsQuery(asUser(OUTSIDER_UID)));

  // Unfiltered collection reads never pass.
  await assertFails(getDocs(collection(asUser(ALICE_UID), dataPath('bookings'))));
});

test('instrument management is admin-only', async () => {
  const instrument = {
    labName: LAB, name: 'New Scope', location: null, maxCapacity: 1,
    color: 'red', createdAt: serverTimestamp()
  };
  await assertFails(setDoc(doc(asUser(ALICE_UID), dataPath('instruments', 'inst-member')), instrument));
  await assertSucceeds(setDoc(doc(asUser(ADMIN_UID), dataPath('instruments', 'inst-admin')), instrument));
  await assertFails(deleteDoc(doc(asUser(ALICE_UID), dataPath('instruments', 'inst-1'))));
  await assertFails(updateDoc(doc(asUser(BETA_UID), dataPath('instruments', 'inst-1')), { name: 'Hijacked', labName: LAB, maxCapacity: 1 }));
});

test('bookings must carry the verified userName and own authUid', async () => {
  const db = asUser(ALICE_UID);
  const base = {
    labName: LAB, instrumentId: 'inst-1', instrumentName: 'Mastersizer',
    date: '2026-09-08', hour: 9, selectedUnit: null, requestedQuantity: 1,
    bookingComment: null, bookingGroupId: null, createdAt: serverTimestamp()
  };
  await assertSucceeds(setDoc(doc(db, dataPath('bookings', 'ok-booking')), {
    ...base, userName: 'Alice', authUid: ALICE_UID
  }));
  await assertFails(setDoc(doc(db, dataPath('bookings', 'spoofed-name')), {
    ...base, hour: 12, userName: 'Bob', authUid: ALICE_UID
  }));
  await assertFails(setDoc(doc(db, dataPath('bookings', 'spoofed-uid')), {
    ...base, hour: 13, userName: 'Alice', authUid: 'someone-else'
  }));
  await assertFails(setDoc(doc(asUser(OUTSIDER_UID), dataPath('bookings', 'outsider-booking')), {
    ...base, hour: 14, userName: 'Alice', authUid: OUTSIDER_UID
  }));
});

test('booking deletes: owner by userName, admin as fallback, others denied', async () => {
  await assertFails(deleteDoc(doc(asUser(ALICE_UID), dataPath('bookings', 'booking-bob'))));
  await assertSucceeds(deleteDoc(doc(asUser(ALICE_UID), dataPath('bookings', 'booking-alice'))));
  await assertSucceeds(deleteDoc(doc(asUser(ADMIN_UID), dataPath('bookings', 'booking-bob'))));
});

test('a full-day booking batch (24 bookings + 24 aggregates) fits the rules limits', async () => {
  const db = asUser(ALICE_UID);
  const batch = writeBatch(db);
  for (let hour = 0; hour < 24; hour += 1) {
    batch.set(doc(db, dataPath('bookings', `full-day-${hour}`)), {
      labName: LAB, instrumentId: 'inst-1', instrumentName: 'Mastersizer',
      date: '2026-09-09', hour, userName: 'Alice', authUid: ALICE_UID,
      selectedUnit: null, requestedQuantity: 1, bookingComment: null,
      bookingGroupId: 'GRP-full-day', createdAt: serverTimestamp()
    });
    batch.set(doc(db, dataPath('booking_slot_aggregates', `${encodeURIComponent(LAB)}__inst-1__2026-09-09__${String(hour).padStart(2, '0')}`)), {
      labName: LAB, instrumentId: 'inst-1', date: '2026-09-09', hour,
      usedQuantity: 1, bookingCount: 1, updatedAt: serverTimestamp()
    });
  }
  await assertSucceeds(batch.commit());
});

test('aggregates: members may read misses and write; outsiders may not write', async () => {
  const missingRef = dataPath('booking_slot_aggregates', 'missing-aggregate');
  await assertSucceeds(getDoc(doc(asUser(ALICE_UID), missingRef)));
  await assertFails(setDoc(doc(asUser(OUTSIDER_UID), dataPath('booking_slot_aggregates', 'outsider-agg')), {
    labName: LAB, instrumentId: 'inst-1', date: '2026-09-09', hour: 1,
    usedQuantity: 5, bookingCount: 1, updatedAt: serverTimestamp()
  }));
});

test('notes: members write as themselves, only admins delete', async () => {
  const db = asUser(ALICE_UID);
  await assertSucceeds(setDoc(doc(db, dataPath('notes', 'note-alice')), {
    labName: LAB, instrumentId: 'inst-1', instrumentName: 'Mastersizer',
    userName: 'Alice', message: 'Pump rattles', timestamp: serverTimestamp()
  }));
  await assertFails(setDoc(doc(db, dataPath('notes', 'note-spoof')), {
    labName: LAB, instrumentId: 'inst-1', instrumentName: 'Mastersizer',
    userName: 'Bob', message: 'Spoofed', timestamp: serverTimestamp()
  }));
  await assertFails(deleteDoc(doc(db, dataPath('notes', 'note-1'))));
  await assertSucceeds(deleteDoc(doc(asUser(ADMIN_UID), dataPath('notes', 'note-1'))));
});

test('logs: verified author only, append-only, lab-scoped reads', async () => {
  await assertSucceeds(setDoc(doc(asUser(ALICE_UID), dataPath('logs', 'log-alice')), {
    labName: LAB, action: 'BOOKING', message: 'Booked: Mastersizer (1 qty)',
    userName: 'Alice', timestamp: serverTimestamp()
  }));
  await assertFails(setDoc(doc(asUser(ALICE_UID), dataPath('logs', 'log-spoof')), {
    labName: LAB, action: 'BOOKING', message: 'Spoofed author',
    userName: 'Bob', timestamp: serverTimestamp()
  }));
  await assertFails(setDoc(doc(asUser(OUTSIDER_UID), dataPath('logs', 'log-outsider')), {
    labName: LAB, action: 'BOOKING', message: 'Outsider spam',
    userName: 'Anyone', timestamp: serverTimestamp()
  }));
  await assertFails(deleteDoc(doc(asUser(ADMIN_UID), dataPath('logs', 'log-alice'))));
  await assertSucceeds(getDocs(query(
    collection(asUser(ADMIN_UID), dataPath('logs')), where('labName', '==', LAB)
  )));
  await assertFails(getDocs(query(
    collection(asUser(OUTSIDER_UID), dataPath('logs')), where('labName', '==', LAB)
  )));
});
