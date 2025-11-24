import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken,
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  getDocs,
  doc,
  serverTimestamp,
  writeBatch,
  orderBy,
  limit,
  updateDoc
} from 'firebase/firestore';
import { 
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, Trash2, User, LogOut, Lock, Loader2, 
  LayoutGrid, CheckCircle2, ShieldCheck, Fingerprint, AlertCircle, X, Repeat, CalendarDays, MapPin, 
  Image as ImageIcon, Palette, Sun, Moon, Clock, ShieldAlert, History, Settings, Users, Beaker,
  ListPlus, Plug
} from 'lucide-react';

// --- Firebase Init ---
// ⚠️⚠️⚠️ REMEMBER TO REPLACE THIS WITH YOUR OWN FIREBASE CONFIG!
const firebaseConfig = {
    apiKey: "AIzaSyDxy4M1Rfue4zi_HcR23h7no9nbZUkjB74",
    authDomain: "booking-lab-equipment.firebaseapp.com",
    projectId: "booking-lab-equipment",
    storageBucket: "booking-lab-equipment.firebasestorage.app",
    messagingSenderId: "7360785156",
    appId: "1:7360785156:web:215b80f3d62b592d08fe51",
    measurementId: "G-NQ63WDKB7M"
  };
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "booking-lab";

// --- Helpers ---
const getFormattedDate = (date) => date.toISOString().split('T')[0];
const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};
const getMonday = (d) => {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); 
  return new Date(date.setDate(diff));
};
const formatTime = (timestamp) => {
  if(!timestamp) return '';
  const d = timestamp.toDate();
  // Format: MM/DD HH:MM
  return `${d.getMonth()+1}/${d.getDate()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
};

// --- Colors ---
const COLOR_PALETTE = [
  { id: 'blue', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', darkBg: 'bg-blue-600' },
  { id: 'red', bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', darkBg: 'bg-red-500' },
  { id: 'green', bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', darkBg: 'bg-green-600' },
  { id: 'amber', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', darkBg: 'bg-amber-500' },
  { id: 'purple', bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', darkBg: 'bg-purple-600' },
];
const getColorStyle = (colorId) => COLOR_PALETTE.find(c => c.id === colorId) || COLOR_PALETTE[0];

// --- Logger ---
const addAuditLog = async (labName, action, message, userName) => {
  try {
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'logs'), {
      labName, action, message, userName, timestamp: serverTimestamp()
    });
  } catch (e) { console.error("Log failed", e); }
};

// --- Components ---

// 1. Gate System
const GateScreen = ({ onLoginSuccess }) => {
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
        <div className="flex justify-center mb-6"><div className={`p-4 rounded-full ${isCreating ? 'bg-indigo-100' : role === 'ADMIN' ? 'bg-slate-800' : 'bg-blue-100'}`}>{isCreating ? <Beaker className="w-10 h-10 text-indigo-600"/> : role === 'ADMIN' ? <ShieldAlert className="w-10 h-10 text-white"/> : <Lock className="w-10 h-10 text-blue-600" />}</div></div>
        <h1 className="text-2xl font-bold text-center text-slate-800 mb-2">{isCreating ? 'Create New Lab' : role === 'ADMIN' ? 'Admin Login' : 'Enter Lab'}</h1>
        {!isCreating && (<div className="flex bg-slate-100 p-1 rounded-xl mb-6"><button onClick={()=>setRole('MEMBER')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${role==='MEMBER'?'bg-white shadow text-blue-600':'text-slate-400'}`}>Member</button><button onClick={()=>setRole('ADMIN')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${role==='ADMIN'?'bg-white shadow text-slate-800':'text-slate-400'}`}>Admin</button></div>)}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="text-xs font-bold text-slate-400 uppercase ml-1">Lab Name</label><input type="text" value={labName} onChange={(e) => setLabName(e.target.value)} placeholder={isCreating ? "e.g. BioLab-X" : "Enter Lab Name"} className="w-full p-3 rounded-xl border-2 border-slate-100 focus:border-blue-500 focus:outline-none transition" /></div>
          {isCreating ? (<><div className="p-4 bg-slate-50 rounded-xl border border-slate-100"><label className="text-xs font-bold text-slate-500 uppercase ml-1">Set Admin Password</label><input type="password" value={newAdminPass} onChange={(e) => setNewAdminPass(e.target.value)} className="w-full mt-2 p-3 rounded-lg border border-slate-200 focus:border-slate-800 focus:outline-none transition text-sm" /></div><div className="p-4 bg-blue-50 rounded-xl border border-blue-100"><label className="text-xs font-bold text-blue-600 uppercase ml-1">Set Member Passcode</label><input type="password" value={newMemberPass} onChange={(e) => setNewMemberPass(e.target.value)} className="w-full mt-2 p-3 rounded-lg border border-blue-200 focus:border-blue-500 focus:outline-none transition text-sm" /></div></>) : (<div><label className="text-xs font-bold text-slate-400 uppercase ml-1">{role === 'ADMIN' ? 'Admin Password' : 'Member Passcode'}</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={`w-full p-3 rounded-xl border-2 border-slate-100 focus:outline-none transition ${role==='ADMIN' ? 'focus:border-slate-800' : 'focus:border-blue-500'}`} /></div>)}
          {error && <div className="bg-red-50 text-red-500 p-3 rounded-lg text-xs flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0"/> <span>{error}</span></div>}
          <button type="submit" disabled={loading} className={`w-full text-white font-bold py-4 rounded-xl transition shadow-lg mt-4 flex items-center justify-center gap-2 ${isCreating ? 'bg-indigo-600 hover:bg-indigo-700' : role==='ADMIN'?'bg-slate-800 hover:bg-slate-900':'bg-blue-600 hover:bg-blue-700'}`}>{loading ? <Loader2 className="animate-spin w-5 h-5" /> : isCreating ? "Create Now" : "Login"}</button>
        </form>
        <div className="mt-6 text-center border-t border-slate-100 pt-4"><button onClick={()=>{setIsCreating(!isCreating); setError(''); setPassword('');}} className="text-sm font-bold text-slate-500 hover:text-blue-600 underline">{isCreating ? 'Existing Lab? Login' : 'Create New Lab'}</button></div>
      </div>
    </div>
  );
};

// 2. Admin Dashboard (updated) + EditInstrumentModal + Notes
const EditInstrumentModal = ({ open, onClose, instrument, onSave }) => {
  const [name, setName] = useState(instrument?.name || '');
  const [location, setLocation] = useState(instrument?.location || '');
  const [description, setDescription] = useState(instrument?.description || '');
  const [colorId, setColorId] = useState(instrument?.colorId || 'blue');

  useEffect(() => {
    if (instrument) {
      setName(instrument.name || '');
      setLocation(instrument.location || '');
      setDescription(instrument.description || '');
      setColorId(instrument.colorId || 'blue');
    }
  }, [instrument]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Edit Instrument</h3>
        <div className="space-y-3">
          <div>
            <label className="text-sm text-slate-600">Name</label>
            <input className="w-full border rounded-md px-3 py-2" value={name} onChange={e=>setName(e.target.value)} />
          </div>
          <div>
            <label className="text-sm text-slate-600">Location</label>
            <input className="w-full border rounded-md px-3 py-2" value={location} onChange={e=>setLocation(e.target.value)} />
          </div>
          <div>
            <label className="text-sm text-slate-600">Description</label>
            <textarea className="w-full border rounded-md px-3 py-2" rows={4} value={description} onChange={e=>setDescription(e.target.value)} />
          </div>
          <div>
            <label className="text-sm text-slate-600">Color</label>
            <input className="w-full border rounded-md px-3 py-2" value={colorId} onChange={e=>setColorId(e.target.value)} />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button className="px-4 py-2 rounded-md bg-slate-100" onClick={onClose}>Cancel</button>
          <button className="px-4 py-2 rounded-md bg-blue-600 text-white" onClick={() => onSave({ name, location, description, colorId })}>Save changes</button>
        </div>
      </div>
    </div>
  );
};

const AdminDashboard = ({ labName, onLogout }) => {
  const [instruments, setInstruments] = useState([]);
  const [logs, setLogs] = useState([]);
  const [notes, setNotes] = useState([]);
  const [activeTab, setActiveTab] = useState('INSTRUMENTS');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    // instruments
    const qInst = query(
      collection(db, 'artifacts', appId, 'public', 'data', 'instruments'),
      where('labName', '==', labName)
    );
    const unsubInst = onSnapshot(qInst, (snap) =>
      setInstruments(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );

    // logs (path + index fix)
    const qLogs = query(
      collection(db, 'artifacts', appId, 'public', 'data', 'logs'),
      where('labName', '==', labName),
      orderBy('timestamp', 'desc'),
      limit(200)
    );
    const unsubLogs = onSnapshot(qLogs, (snap) =>
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );

    // condition notes
    const qNotes = query(
      collection(db, 'artifacts', appId, 'public', 'data', 'notes'),
      where('labName', '==', labName),
      orderBy('createdAt', 'desc'),
      limit(200)
    );
    const unsubNotes = onSnapshot(qNotes, (snap) =>
      setNotes(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );

    return () => { unsubInst(); unsubLogs(); unsubNotes(); };
  }, [labName]);

  const handleSaveEdit = async (payload) => {
    if (!editing) return;
    const ref = doc(db, 'artifacts', appId, 'public', 'data', 'instruments', editing.id);
    await updateDoc(ref, { ...payload, updatedAt: serverTimestamp() });
    await addAuditLog(labName, 'instrument.edit', `Edited instrument: ${payload.name}`, 'ADMIN');
    setEditing(null);
  };

  const markNoteResolved = async (note) => {
    const ref = doc(db, 'artifacts', appId, 'public', 'data', 'notes', note.id);
    await updateDoc(ref, { status: 'RESOLVED', resolvedAt: serverTimestamp() });
    await addAuditLog(labName, 'note.resolve', `Resolved note for ${note.instrumentName}`, 'ADMIN');
  };

  return (
    <div className="max-w-6xl mx-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Admin • {labName}</h2>
        <div className="flex gap-2">
          <button className={`px-3 py-1 rounded-md ${activeTab==='INSTRUMENTS'?'bg-slate-900 text-white':'bg-slate-100'}`} onClick={()=>setActiveTab('INSTRUMENTS')}>Instruments</button>
          <button className={`px-3 py-1 rounded-md ${activeTab==='NOTES'?'bg-slate-900 text-white':'bg-slate-100'}`} onClick={()=>setActiveTab('NOTES')}>Notes</button>
          <button className={`px-3 py-1 rounded-md ${activeTab==='LOGS'?'bg-slate-900 text-white':'bg-slate-100'}`} onClick={()=>setActiveTab('LOGS')}>Logs</button>
          <button className="px-3 py-1 rounded-md bg-rose-100" onClick={onLogout}>Log out</button>
        </div>
      </div>

      {activeTab === 'INSTRUMENTS' && (
        <div className="bg-white rounded-xl border">
          <div className="p-3 border-b flex justify-between items-center">
            <div className="font-medium">All Instruments</div>
            <button className="px-3 py-1 rounded-md bg-blue-600 text-white" onClick={()=>setShowAddModal(true)}>Add</button>
          </div>
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-slate-500">
                <th className="p-3">Name</th>
                <th className="p-3">Location</th>
                <th className="p-3">Description</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {instruments.map(inst=>(
                <tr key={inst.id}>
                  <td className="p-3">{inst.name}</td>
                  <td className="p-3">{inst.location}</td>
                  <td className="p-3">{inst.description}</td>
                  <td className="p-3">
                    <button className="px-2 py-1 rounded-md bg-slate-200 mr-2" onClick={()=>setEditing(inst)}>Edit</button>
                    {/* keep your existing Delete if present */}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'NOTES' && (
        <div className="bg-white rounded-xl border">
          <div className="p-3 border-b font-medium">Condition Notes from Users</div>
          <div className="divide-y">
            {notes.length === 0 && <div className="p-4 text-slate-500">No notes yet.</div>}
            {notes.map(n=>(
              <div key={n.id} className="p-4 flex items-start justify-between">
                <div>
                  <div className="font-medium">
                    {n.instrumentName}
                    {n.usedDate?.toDate ? ` — ${n.usedDate.toDate().toLocaleDateString()}` : ''}
                  </div>
                  <div className="text-sm text-slate-500">
                    By {n.userName || 'Unknown'} · {n.createdAt?.toDate ? n.createdAt.toDate().toLocaleString() : ''}
                  </div>
                  <p className="mt-2">{n.content}</p>
                  {n.status === 'RESOLVED' && <span className="mt-2 inline-block text-xs px-2 py-1 bg-emerald-100 rounded">Resolved</span>}
                </div>
                {n.status !== 'RESOLVED' && (
                  <button className="px-3 py-1 rounded-md bg-emerald-600 text-white" onClick={()=>markNoteResolved(n)}>
                    Mark resolved
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'LOGS' && (
        <div className="bg-white rounded-xl border">
          <div className="p-3 border-b font-medium">Operation History</div>
          <div className="divide-y">
            {logs.length === 0 && <div className="p-4 text-slate-500">No logs yet.</div>}
            {logs.map(log=>(
              <div key={log.id} className="p-4">
                <div className="text-sm text-slate-500">{log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString() : ''}</div>
                <div className="font-medium">{log.action}</div>
                <div className="text-sm">{log.message}</div>
                <div className="text-xs text-slate-500">User: {log.userName || 'N/A'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <EditInstrumentModal
        open={!!editing}
        instrument={editing}
        onClose={()=>setEditing(null)}
        onSave={handleSaveEdit}
      />
    </div>
  );
};
const LeaveNoteModal = ({ open, onClose, labName, instruments, userName }) => {
  const [instrumentId, setInstrumentId] = useState('');
  const [usedDate, setUsedDate] = useState(() => new Date().toISOString().slice(0,10));
  const [content, setContent] = useState('');

  useEffect(()=> {
    if (open) {
      setInstrumentId('');
      setUsedDate(new Date().toISOString().slice(0,10));
      setContent('');
    }
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    const inst = instruments.find(i => i.id === instrumentId);
    if (!inst || !content) return;

    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'notes'), {
      labName,
      instrumentId,
      instrumentName: inst.name,
      usedDate: new Date(usedDate),
      content,
      userName: userName || null,
      status: 'OPEN',
      createdAt: serverTimestamp()
    });

    await addAuditLog(labName, 'note.create', `Note on ${inst.name}`, userName || 'MEMBER');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Leave a condition note</h3>
        <div className="space-y-3">
          <div>
            <label className="text-sm text-slate-600">Instrument</label>
            <select className="w-full border rounded-md px-3 py-2" value={instrumentId} onChange={e=>setInstrumentId(e.target.value)}>
              <option value="">Select…</option>
              {instruments.map(i=>(
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm text-slate-600">Day used</label>
            <input type="date" className="w-full border rounded-md px-3 py-2" value={usedDate} onChange={e=>setUsedDate(e.target.value)} />
          </div>
          <div>
            <label className="text-sm text-slate-600">Note</label>
            <textarea className="w-full border rounded-md px-3 py-2" rows={4} placeholder="Condition / issues / damage / cleanliness..."
                      value={content} onChange={e=>setContent(e.target.value)} />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button className="px-4 py-2 rounded-md bg-slate-100" onClick={onClose}>Cancel</button>
          <button className="px-4 py-2 rounded-md bg-blue-600 text-white" onClick={submit}>Submit</button>
        </div>
      </div>
    </div>
  );
};

// 5. Full Feature Member App
const MemberApp = ({ labName, userName, onLogout }) => {
  const [viewMode, setViewMode] = useState('day');
  const [date, setDate] = useState(new Date());
  const [selectedTab, setSelectedTab] = useState('overview');
  const [instruments, setInstruments] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [bookingToDelete, setBookingToDelete] = useState(null);
  const [bookingModal, setBookingModal] = useState({ isOpen: false, date: '', hour: 0, instrument: null });
  const [showLeaveNote, setShowLeaveNote] = useState(false);
  const [isBookingProcess, setIsBookingProcess] = useState(false);
  const hour9Ref = useRef(null);
  const auth = getAuth();
  const currentUserId = auth.currentUser?.uid;
  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);

  useEffect(() => {
    const qInst = query(collection(db, 'artifacts', appId, 'public', 'data', 'instruments'), where('labName', '==', labName));
    const unsubInst = onSnapshot(qInst, (snap) => setInstruments(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const qBook = query(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'), where('labName', '==', labName));
    const unsubBook = onSnapshot(qBook, (snap) => setBookings(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { unsubInst(); unsubBook(); };
  }, [labName]);

  useEffect(() => { if(hour9Ref.current) hour9Ref.current.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [viewMode, selectedTab]);

  const handleConfirmBooking = async (repeatCount, isFullDay, subOption) => {
    if (!bookingModal.instrument) return; setIsBookingProcess(true);
    const { date: startDateStr, hour: startHour, instrument } = bookingModal; const startDate = new Date(startDateStr); const batch = writeBatch(db); const newBookings = []; const targetDates = [];
    for (let i = 0; i <= repeatCount; i++) { const d = new Date(startDate); d.setDate(startDate.getDate() + (i * 7)); targetDates.push(getFormattedDate(d)); }
    targetDates.forEach(dStr => { if (isFullDay) { for (let h = 0; h < 24; h++) newBookings.push({ date: dStr, hour: h }); } else { newBookings.push({ date: dStr, hour: startHour }); } });

    const conflicts = [];
    newBookings.forEach(target => {
       const isTaken = bookings.some(b => b.instrumentId === instrument.id && b.date === target.date && b.hour === target.hour);
       if (isTaken && !conflicts.includes(target.date)) conflicts.push(target.date);
    });

    if (conflicts.length > 0) { alert(`Conflict: ${conflicts.join(', ')}`); setIsBookingProcess(false); return; }

    try {
      newBookings.forEach(target => {
        const ref = doc(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'));
        batch.set(ref, { 
            labName, 
            instrumentId: instrument.id, 
            instrumentName: instrument.name, 
            instrumentColor: instrument.color || 'blue', 
            subOption: subOption || null, 
            date: target.date, 
            hour: target.hour, 
            userName, 
            authUid: currentUserId, 
            createdAt: serverTimestamp() 
        });
      });
      await batch.commit(); 
      await addAuditLog(labName, 'BOOKING', `Booked: ${instrument.name} ${subOption ? `[${subOption}]` : ''} (${isFullDay ? 'Full Day' : startHour+':00'})`, userName); 
      setBookingModal({ ...bookingModal, isOpen: false });
    } catch (e) { alert("Failed"); } finally { setIsBookingProcess(false); }
  };
  
  const handleDeleteBooking = async () => { if(!bookingToDelete) return; await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bookings', bookingToDelete.id)); await addAuditLog(labName, 'CANCEL', `Cancelled: ${bookingToDelete.instrumentName}`, userName); setBookingToDelete(null); };

  const weekDays = useMemo(() => { const m = getMonday(date); return Array.from({ length: 7 }, (_, i) => { const d = new Date(m); d.setDate(m.getDate() + i); return d; }); }, [date]);
  const currentInst = instruments.find(i => i.id === selectedTab);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 animate-fade-in">
      <header className="bg-white px-4 py-3 flex justify-between items-center shadow-sm border-b border-slate-100 z-50 sticky top-0 h-14"><div><h1 className="font-bold text-lg text-slate-800">{labName}</h1><div className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full w-fit"><ShieldCheck className="w-3 h-3"/> {userName}</div></div><div className="flex gap-2"><div className="flex bg-slate-100 rounded-lg p-1"><button onClick={()=>setViewMode('day')} className={`p-1.5 rounded-md transition ${viewMode==='day'?'bg-white shadow text-blue-600':'text-slate-400'}`}><LayoutGrid className="w-4 h-4"/></button><button onClick={()=>setViewMode('week')} className={`p-1.5 rounded-md transition ${viewMode==='week'?'bg-white shadow text-blue-600':'text-slate-400'}`}><CalendarDays className="w-4 h-4"/></button></div><button onClick={onLogout} className="p-2 text-slate-400 hover:text-slate-600 bg-slate-100 rounded-full"><LogOut className="w-5 h-5"/></button></div></header>
      <div className="flex items-center justify-between bg-white p-4 shadow-sm border-b border-slate-100 sticky top-14 z-40 h-16"><button onClick={() => setDate(addDays(date, -1))} className="p-2 hover:bg-slate-100 rounded-full"><ChevronLeft className="w-5 h-5 text-slate-600"/></button><div className="text-center"><span className="font-bold text-slate-800 block">{viewMode === 'day' ? date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', weekday: 'short' }) : `${date.getMonth()+1}/${weekDays[0].getDate()} - ${date.getMonth()+1}/${weekDays[6].getDate()}`}</span></div><button onClick={() => setDate(addDays(date, 1))} className="p-2 hover:bg-slate-100 rounded-full"><ChevronRight className="w-5 h-5 text-slate-600"/></button></div>
      <div className="bg-white border-b border-slate-100 overflow-x-auto no-scrollbar py-2 sticky top-[7.5rem] z-30 h-14 shadow-sm"><div className="flex px-4 gap-2 min-w-max"><button onClick={() => setSelectedTab('overview')} className={`px-4 py-2 rounded-full text-sm font-bold transition flex items-center gap-2 ${selectedTab === 'overview' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'}`}><LayoutGrid className="w-4 h-4"/> Overview</button>{instruments.map(inst => { const styles = getColorStyle(inst.color); return (<button key={inst.id} onClick={() => setSelectedTab(inst.id)} className={`px-4 py-2 rounded-full text-sm font-bold transition flex items-center gap-2 ${selectedTab === inst.id ? `${styles.darkBg} text-white shadow-md` : 'bg-slate-100 text-slate-500'}`}><div className={`w-2 h-2 rounded-full ${selectedTab === inst.id ? 'bg-white' : styles.darkBg}`}></div>{inst.name}</button>); })}</div></div>
      {selectedTab !== 'overview' && currentInst && (
        <div className="bg-white px-4 py-3 border-b border-slate-100 flex justify-between items-start animate-fade-in">
            <div className="flex gap-3">
                {currentInst.image ? <img src={currentInst.image} alt={currentInst.name} className="w-12 h-12 rounded-lg object-cover bg-slate-100" onError={(e) => e.target.style.display='none'} /> : <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${getColorStyle(currentInst.color).bg}`}><span className={`text-lg font-bold uppercase ${getColorStyle(currentInst.color).text}`}>{currentInst.name.slice(0,1)}</span></div>}
                <div><h2 className="font-bold text-slate-800">{currentInst.name}</h2><div className="flex items-center gap-2 text-xs text-slate-500">{currentInst.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3"/> {currentInst.location}</span>}</div></div>
            </div>
        </div>
      )}
      <div className="flex-1 p-4 pb-20 overflow-y-auto">
          {viewMode === 'day' && (<div className="space-y-3">{hours.map(hour => { const currentDateStr = getFormattedDate(date); const relevantBookings = bookings.filter(b => b.date === currentDateStr && b.hour === hour && (selectedTab === 'overview' || b.instrumentId === selectedTab)); const isMyBooking = relevantBookings.some(b => b.userName === userName); const isBooked = relevantBookings.length > 0; const containerStyles = selectedTab !== 'overview' && currentInst ? getColorStyle(currentInst.color) : { bg: 'bg-white', border: 'border-slate-100', text: 'text-slate-700' }; return (
            <div key={hour} ref={hour===9 ? hour9Ref : null} className="flex gap-3"><div className="w-10 pt-3 text-right text-xs font-medium text-slate-400">{hour===0?<Moon className="w-3 h-3 inline opacity-50"/>:hour===12?<Sun className="w-3 h-3 inline opacity-50"/>:`${hour}:00`}</div><div onClick={() => { if (selectedTab === 'overview') return; if (isMyBooking) setBookingToDelete(relevantBookings.find(b => b.userName === userName)); else if (!isBooked) setBookingModal({ isOpen: true, date: currentDateStr, hour, instrument: currentInst }); else alert(`Booked by ${relevantBookings[0].userName}`); }} className={`flex-1 min-h-[3.5rem] rounded-2xl border p-3 relative transition-all ${selectedTab === 'overview' ? 'bg-white border-slate-100' : 'cursor-pointer active:scale-[0.98]'} ${selectedTab !== 'overview' && isMyBooking ? `${containerStyles.bg} ${containerStyles.border}` : ''} ${selectedTab !== 'overview' && !isMyBooking && isBooked ? 'bg-slate-100 border-slate-200 opacity-60' : ''} ${selectedTab !== 'overview' && !isBooked ? 'bg-white border-slate-100 hover:border-slate-300' : ''}`}>{selectedTab === 'overview' ? (<div className="flex flex-wrap gap-2">{relevantBookings.length === 0 ? <span className="text-xs text-slate-300 mt-1">Free</span> : relevantBookings.map(b => { const chipStyle = getColorStyle(b.instrumentColor || 'blue'); return <span key={b.id} className={`text-xs px-2 py-1 rounded-md font-medium border ${chipStyle.bg} ${chipStyle.border} ${chipStyle.text}`}>{b.instrumentName} {b.subOption && <span className="opacity-75 text-[10px] ml-1">({b.subOption})</span>}</span>; })}</div>) : (<div className="flex items-center justify-between h-full">{isBooked ? (<div className="flex items-center gap-2"><div className={`p-1.5 rounded-full ${isMyBooking ? 'bg-white/50' : 'bg-slate-200'}`}><User className={`w-3 h-3 ${isMyBooking ? containerStyles.text : 'text-slate-500'}`} /></div><div><div className={`text-sm font-bold leading-tight ${isMyBooking ? containerStyles.text : 'text-slate-500'}`}>{relevantBookings[0].userName} {isMyBooking && '(Me)'}</div>{relevantBookings[0].subOption && <div className={`text-[10px] leading-tight ${isMyBooking ? containerStyles.text : 'text-slate-400'} opacity-80`}>{relevantBookings[0].subOption}</div>}</div></div>) : (<div className="flex items-center gap-2 opacity-0 hover:opacity-100 transition-opacity"><Plus className="w-4 h-4 text-indigo-400"/> <span className="text-xs text-indigo-400 font-bold">Book</span></div>)}{isMyBooking && <CheckCircle2 className={`w-5 h-5 ${containerStyles.text}`}/>}</div>)}</div></div>
          );})}</div>)}
          
          {viewMode === 'week' && (selectedTab === 'overview' ? (<div className="text-center py-20 text-slate-400"><LayoutGrid className="w-12 h-12 mx-auto mb-4 opacity-20"/><p>Overview not supported in Week View</p></div>) : (<div className="overflow-x-auto pb-4"><div className="min-w-[600px]"><div className="grid grid-cols-8 gap-1 mb-2 sticky top-[11rem] z-20 bg-slate-50 py-2 shadow-sm"><div className="w-10 bg-slate-50"></div>{weekDays.map((d, i) => (<div key={i} className={`text-center p-2 rounded-lg ${getFormattedDate(d) === getFormattedDate(new Date()) ? 'bg-blue-50 text-blue-600 font-bold' : 'text-slate-500'}`}><div className="text-xs">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][d.getDay()===0?6:d.getDay()-1]}</div><div className="text-sm font-bold">{d.getDate()}</div></div>))}</div><div className="space-y-2">{hours.map(hour => (<div key={hour} ref={hour===9?hour9Ref:null} className="grid grid-cols-8 gap-1 h-12"><div className="text-xs text-slate-400 text-right pr-2 pt-4 sticky left-0 bg-slate-50 z-10 border-r border-slate-100">{hour===0?<Moon className="w-3 h-3 inline opacity-50"/>:hour===12?<Sun className="w-3 h-3 inline opacity-50"/>:`${hour}:00`}</div>{weekDays.map((day, i) => {const dateStr = getFormattedDate(day); const booking = bookings.find(b => b.instrumentId === selectedTab && b.date === dateStr && b.hour === hour); const isMyBooking = booking?.userName === userName; const instStyles = getColorStyle(currentInst?.color || 'blue'); return (<div key={i} onClick={() => { if (isMyBooking) setBookingToDelete(booking); else if (!booking && selectedTab !== 'overview') setBookingModal({isOpen:true, date:dateStr, hour, instrument: currentInst}); }} className={`rounded-lg border transition-all cursor-pointer relative ${isMyBooking ? `${instStyles.bg} ${instStyles.border}` : ''} ${!isMyBooking && booking ? 'bg-slate-200 border-slate-300' : 'bg-white border-slate-100 hover:border-indigo-300'}`}>{booking && (<div className="flex flex-col items-center justify-center h-full leading-none">{isMyBooking ? <CheckCircle2 className={`w-3 h-3 ${instStyles.text}`}/> : <span className="text-[10px] text-slate-500 truncate px-1 max-w-full">{booking.userName}</span>}{booking.subOption && <span className={`text-[8px] truncate max-w-full px-0.5 ${isMyBooking ? instStyles.text : 'text-slate-400'}`}>{booking.subOption}</span>}</div>)}</div>); })}</div>))}</div></div></div>))}
      </div>

      {/* Modals */}
      {bookingToDelete && (<div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6 backdrop-blur-sm animate-fade-in"><div className="bg-white w-full max-w-xs rounded-3xl p-6 shadow-2xl text-center relative"><button onClick={()=>setBookingToDelete(null)} className="absolute top-4 right-4 text-slate-300"><X className="w-5 h-5"/></button><div className="bg-red-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"><AlertCircle className="w-8 h-8 text-red-500" /></div><h3 className="text-xl font-bold text-slate-800 mb-2">Cancel Booking?</h3><p className="text-slate-500 text-sm mb-6"><span className="font-bold">{bookingToDelete.instrumentName}</span> <br/> <span className="text-indigo-500 text-xs">{bookingToDelete.subOption ? `(${bookingToDelete.subOption})` : ''}</span></p><div className="flex gap-3"><button onClick={()=>setBookingToDelete(null)} className="flex-1 py-3 text-slate-600 font-bold bg-slate-100 rounded-xl">Keep</button><button onClick={handleDeleteBooking} className="flex-1 py-3 bg-red-500 text-white font-bold rounded-xl shadow-lg shadow-red-200">Confirm Cancel</button></div></div></div>)}
      <BookingModal isOpen={bookingModal.isOpen} onClose={() => setBookingModal({...bookingModal, isOpen: false})} initialDate={bookingModal.date} initialHour={bookingModal.hour} instrument={bookingModal.instrument} onConfirm={handleConfirmBooking} isBooking={isBookingProcess} />
      <style>{`.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}@keyframes fade-in{from{opacity:0}to{opacity:1}}@keyframes slide-up{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}.animate-fade-in{animation:fade-in 0.3s ease-out}.animate-slide-up{animation:slide-up 0.4s cubic-bezier(0.16,1,0.3,1)}`}</style>
      {/* Leave Note action */}
<button
  className="px-3 py-1 rounded-md bg-indigo-600 text-white"
  onClick={()=>setShowLeaveNote(true)}
>
  Leave condition note
</button>

{/* Modal mount */}
<LeaveNoteModal
  open={showLeaveNote}
  onClose={()=>setShowLeaveNote(false)}
  labName={labName}
  instruments={instruments}
  userName={userName}
/>
    </div>
  );
};

const IdentityScreen = ({ labName, onIdentityVerified }) => {
  const [name, setName] = useState(''); const [pin, setPin] = useState(''); const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  const handleIdentity = async (e) => { e.preventDefault(); if (!name.trim() || !pin.trim()) { setError('Please enter name and PIN'); return; } setLoading(true); setError('');
    try { const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'lab_users'); const q = query(usersRef, where('labName', '==', labName), where('userName', '==', name.trim())); const snapshot = await getDocs(q); if (snapshot.empty) { await addDoc(usersRef, { labName, userName: name.trim(), pinCode: pin.trim(), createdAt: serverTimestamp() }); onIdentityVerified(name.trim()); } else { const userData = snapshot.docs[0].data(); if (userData.pinCode === pin.trim()) onIdentityVerified(name.trim()); else setError('Wrong PIN! Name already registered.'); }
    } catch (err) { setError('Verification Failed'); } finally { setLoading(false); }
  };
  return (<div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-6 animate-slide-up"><div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8"><button onClick={() => window.location.reload()} className="text-slate-400 text-sm mb-4 flex items-center gap-1"><ChevronLeft className="w-4 h-4"/> Back</button><div className="flex justify-center mb-6"><div className="bg-indigo-100 p-4 rounded-full"><Fingerprint className="w-10 h-10 text-indigo-600" /></div></div><h1 className="text-2xl font-bold text-center text-slate-800">Identity Verification</h1><p className="text-center text-slate-500 text-sm mb-6">Enter <span className="font-bold">{labName}</span></p><form onSubmit={handleIdentity} className="space-y-4"><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your Name" className="w-full p-3 rounded-xl border-2 border-slate-100 focus:border-indigo-500 outline-none" /><input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Personal PIN" className="w-full p-3 rounded-xl border-2 border-slate-100 focus:border-indigo-500 outline-none" />{error && <div className="text-red-500 text-xs">{error}</div>}<button type="submit" disabled={loading} className="w-full bg-indigo-600 text-white font-bold py-4 rounded-xl mt-6">{loading ? <Loader2 className="animate-spin mx-auto"/> : "Verify & Enter"}</button></form></div></div>);
};

export default function App() {
  const [user, setUser] = useState(null); const [appData, setAppData] = useState({ role: null, labName: null, userName: null }); const [identityStage, setIdentityStage] = useState(false);
  useEffect(() => { const initAuth = async () => { if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) await signInWithCustomToken(auth, __initial_auth_token); else await signInAnonymously(auth); }; initAuth(); onAuthStateChanged(auth, setUser); }, []);
  const handleLoginSuccess = ({ role, labName }) => { if (role === 'ADMIN') { setAppData({ role, labName, userName: 'Administrator' }); } else { setAppData({ role, labName, userName: null }); setIdentityStage(true); } };
  const handleIdentityVerified = (userName) => { setAppData(prev => ({ ...prev, userName })); setIdentityStage(false); };
  if (!user) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="animate-spin text-slate-400"/></div>;
  if (!appData.labName) return <GateScreen onLoginSuccess={handleLoginSuccess} />;
  if (appData.role === 'ADMIN') return <AdminDashboard labName={appData.labName} onLogout={() => setAppData({role:null, labName:null, userName:null})} />;
  if (identityStage) return <IdentityScreen labName={appData.labName} onIdentityVerified={handleIdentityVerified} />;
  return <MemberApp labName={appData.labName} userName={appData.userName} onLogout={() => setAppData({role:null, labName:null, userName:null})} />;
}