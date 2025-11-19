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
  limit
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

// 2. Admin Dashboard
const AdminDashboard = ({ labName, onLogout }) => {
  const [instruments, setInstruments] = useState([]);
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('INSTRUMENTS'); 
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    const qInst = query(collection(db, 'artifacts', appId, 'public', 'data', 'instruments'), where('labName', '==', labName));
    const unsubInst = onSnapshot(qInst, (snap) => setInstruments(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const qLogs = query(collection(db, 'artifacts', appId, 'public', 'data', 'logs'), where('labName', '==', labName), orderBy('timestamp', 'desc'), limit(50));
    const unsubLogs = onSnapshot(qLogs, (snap) => setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { unsubInst(); unsubLogs(); };
  }, [labName]);

  const handleAddInstrument = async (data) => {
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'instruments'), { labName, ...data, createdAt: serverTimestamp() });
    await addAuditLog(labName, 'ADD_INST', `Add Device: ${data.name}`, 'Admin');
    setShowAddModal(false);
  };
  const handleDeleteInstrument = async (id, name) => {
    if(!confirm(`Delete ${name}?`)) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'instruments', id));
    await addAuditLog(labName, 'DEL_INST', `Delete Device: ${name}`, 'Admin');
  };

  return (
    <div className="min-h-screen bg-slate-100 font-sans">
        <header className="bg-slate-800 text-white px-6 py-4 flex justify-between items-center sticky top-0 z-50 shadow-md">
            <div className="flex items-center gap-3"><div className="bg-slate-700 p-2 rounded-lg"><ShieldCheck className="w-6 h-6 text-yellow-400"/></div><div><h1 className="font-bold text-lg leading-tight">{labName}</h1><p className="text-xs text-slate-400">Admin Dashboard</p></div></div>
            <button onClick={onLogout} className="text-slate-300 hover:text-white flex items-center gap-2 text-sm"><LogOut className="w-4 h-4"/> Logout</button>
        </header>
        <div className="p-6 max-w-5xl mx-auto">
            <div className="flex gap-4 mb-6">
                <button onClick={()=>setActiveTab('INSTRUMENTS')} className={`flex-1 p-4 rounded-2xl flex items-center justify-center gap-3 transition font-bold ${activeTab==='INSTRUMENTS'?'bg-white shadow-lg text-slate-800':'bg-slate-200 text-slate-500 hover:bg-slate-300'}`}><Settings className="w-5 h-5"/> Instruments</button>
                <button onClick={()=>setActiveTab('LOGS')} className={`flex-1 p-4 rounded-2xl flex items-center justify-center gap-3 transition font-bold ${activeTab==='LOGS'?'bg-white shadow-lg text-slate-800':'bg-slate-200 text-slate-500 hover:bg-slate-300'}`}><History className="w-5 h-5"/> Audit Logs</button>
            </div>
            {activeTab === 'INSTRUMENTS' ? (
                <div className="bg-white rounded-3xl p-6 shadow-sm">
                    <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-bold text-slate-800">Instrument List ({instruments.length})</h2><button onClick={()=>setShowAddModal(true)} className="bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-700 flex items-center gap-2"><Plus className="w-4 h-4"/> Add Device</button></div>
                    <div className="space-y-3">{instruments.map(inst => (<div key={inst.id} className="flex items-center justify-between p-4 border border-slate-100 rounded-xl hover:border-slate-300 transition bg-slate-50"><div className="flex items-center gap-4"><div className={`w-12 h-12 rounded-lg flex items-center justify-center ${getColorStyle(inst.color).bg} ${getColorStyle(inst.color).text} font-bold text-xl`}>{inst.name[0]}</div><div><div className="font-bold text-slate-800">{inst.name}</div><div className="text-xs text-slate-500 flex items-center gap-1"><MapPin className="w-3 h-3"/> {inst.location || 'No Location'}</div><div className="text-[10px] text-slate-400 mt-1 flex flex-wrap gap-1">{inst.subOptions?.map(o=><span key={o} className="bg-slate-100 px-1 rounded">{o}</span>)}</div></div></div><button onClick={()=>handleDeleteInstrument(inst.id, inst.name)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"><Trash2 className="w-5 h-5"/></button></div>))}</div>
                </div>
            ) : (
                <div className="bg-white rounded-3xl p-6 shadow-sm"><h2 className="text-xl font-bold text-slate-800 mb-6">Activity Logs</h2><div className="overflow-hidden rounded-xl border border-slate-100"><table className="w-full text-sm text-left"><thead className="bg-slate-50 text-slate-500 font-medium"><tr><th className="p-4">Time</th><th className="p-4">User</th><th className="p-4">Action</th><th className="p-4">Details</th></tr></thead><tbody className="divide-y divide-slate-100">{logs.map(log => (<tr key={log.id} className="hover:bg-slate-50"><td className="p-4 text-slate-400 font-mono text-xs">{formatTime(log.timestamp)}</td><td className="p-4 font-bold text-slate-700">{log.userName}</td><td className="p-4"><span className={`px-2 py-1 rounded text-xs font-bold ${log.action.includes('DEL') || log.action.includes('CANCEL') ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>{log.action}</span></td><td className="p-4 text-slate-600">{log.message}</td></tr>))}</tbody></table></div></div>
            )}
        </div>
        <AddInstrumentModal isOpen={showAddModal} onClose={()=>setShowAddModal(false)} onAdd={handleAddInstrument} />
    </div>
  );
};

// 3. Add Instrument Modal
const AddInstrumentModal = ({ isOpen, onClose, onAdd }) => {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [image, setImage] = useState('');
  const [subOptionsStr, setSubOptionsStr] = useState('');
  const [color, setColor] = useState('blue');

  if (!isOpen) return null;
  const handleSubmit = (e) => { 
      e.preventDefault(); 
      if (!name.trim()) return; 
      const subOptions = subOptionsStr.split(/[,，\n]/).map(s => s.trim()).filter(s => s);
      onAdd({ name, location, image, color, subOptions }); 
      setName(''); setLocation(''); setImage(''); setSubOptionsStr(''); setColor('blue'); 
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
        <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
            <h3 className="text-lg font-bold mb-4 text-slate-800">Add New Device</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div><label className="text-xs font-bold text-slate-400 uppercase ml-1">Device Name *</label><input autoFocus type="text" value={name} onChange={e=>setName(e.target.value)} className="w-full border-2 border-slate-100 p-3 rounded-xl focus:border-slate-800 outline-none"/></div>
                <div><label className="text-xs font-bold text-slate-400 uppercase ml-1">Location</label><input type="text" value={location} onChange={e=>setLocation(e.target.value)} className="w-full border-2 border-slate-100 p-3 rounded-xl focus:border-slate-800 outline-none"/></div>
                <div>
                    <label className="text-xs font-bold text-slate-400 uppercase ml-1 flex items-center gap-1"><ListPlus className="w-3 h-3"/> Accessories/Inlets (Optional)</label>
                    <textarea value={subOptionsStr} onChange={e=>setSubOptionsStr(e.target.value)} placeholder="e.g. Dry, Wet (comma separated)" className="w-full border-2 border-slate-100 p-3 rounded-xl focus:border-slate-800 outline-none text-sm h-20 resize-none"/>
                    <p className="text-[10px] text-slate-400 mt-1 ml-1">User must select one when booking</p>
                </div>
                <div><label className="text-xs font-bold text-slate-400 uppercase ml-1">Image URL</label><input type="text" value={image} onChange={e=>setImage(e.target.value)} className="w-full border-2 border-slate-100 p-3 rounded-xl focus:border-slate-800 outline-none text-xs"/></div>
                <div className="grid grid-cols-4 gap-3">{COLOR_PALETTE.map(c => (<div key={c.id} onClick={() => setColor(c.id)} className={`h-10 rounded-lg cursor-pointer flex items-center justify-center ${c.darkBg} ${color === c.id ? 'ring-4 ring-offset-2 ring-slate-200 scale-105' : 'opacity-70'}`}>{color === c.id && <CheckCircle2 className="w-5 h-5 text-white"/>}</div>))}</div>
                <div className="flex gap-3 mt-6"><button type="button" onClick={onClose} className="flex-1 py-3 text-slate-500 font-bold bg-slate-50 rounded-xl">Cancel</button><button type="submit" className="flex-1 py-3 bg-slate-900 text-white font-bold rounded-xl">Confirm Add</button></div>
            </form>
        </div>
    </div>
  );
};

// 4. Booking Modal
const BookingModal = ({ isOpen, onClose, initialDate, initialHour, instrument, onConfirm, isBooking }) => {
  if (!isOpen) return null;
  const [repeatOption, setRepeatOption] = useState(0); 
  const [isFullDay, setIsFullDay] = useState(false); 
  const [selectedSubOption, setSelectedSubOption] = useState(''); 

  const styles = getColorStyle(instrument?.color || 'blue');
  const hasOptions = instrument?.subOptions && instrument.subOptions.length > 0;

  useEffect(() => {
      if(hasOptions) setSelectedSubOption(instrument.subOptions[0]);
      else setSelectedSubOption('');
  }, [instrument]);

  const getEndDate = () => { if (repeatOption === 0) return "Today Only"; const d = new Date(initialDate); d.setDate(d.getDate() + (repeatOption * 7)); return `Until ${d.getMonth()+1}/${d.getDate()}`; };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
      <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl">
        <div className="flex justify-between items-center mb-6"><h3 className="text-xl font-bold text-slate-800">Booking Details</h3><button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-6 h-6"/></button></div>
        <div className="space-y-4">
          <div className={`${styles.bg} p-4 rounded-xl border-l-4 ${styles.border.replace('border', 'border-l')}`}><div className="text-xs opacity-60 uppercase font-bold mb-1">Device</div><div className={`text-lg font-bold ${styles.text}`}>{instrument?.name}</div>{instrument?.location && <div className="text-xs mt-1 flex items-center gap-1 opacity-80"><MapPin className="w-3 h-3"/> {instrument.location}</div>}</div>
          
          {hasOptions && (
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div className="text-xs text-slate-400 uppercase font-bold mb-2 flex items-center gap-1"><Plug className="w-3 h-3"/> Select Accessory/Inlet</div>
                  <select value={selectedSubOption} onChange={(e)=>setSelectedSubOption(e.target.value)} className="w-full p-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm outline-none focus:border-slate-400">
                      {instrument.subOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
              </div>
          )}

          <div className="flex gap-4"><div className="flex-1 bg-slate-50 p-4 rounded-xl"><div className="text-xs text-slate-400 uppercase font-bold mb-1">Date</div><div className="font-medium text-slate-700">{initialDate}</div></div><div className="flex-1 bg-slate-50 p-4 rounded-xl transition-all"><div className="text-xs text-slate-400 uppercase font-bold mb-1">Time Slot</div><div className={`font-medium ${isFullDay ? 'text-indigo-600 font-bold' : 'text-slate-700'}`}>{isFullDay ? 'All Day (24h)' : `${initialHour}:00`}</div></div></div>
          <div onClick={() => setIsFullDay(!isFullDay)} className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${isFullDay ? 'border-indigo-500 bg-indigo-50' : 'border-slate-100 hover:border-slate-200'}`}><div className="flex items-center gap-3"><div className={`p-2 rounded-full ${isFullDay ? 'bg-indigo-200 text-indigo-700' : 'bg-slate-100 text-slate-400'}`}><Sun className="w-5 h-5" /></div><div><div className={`font-bold text-sm ${isFullDay ? 'text-indigo-900' : 'text-slate-600'}`}>Full Day Booking (24h)</div><div className="text-xs text-slate-400">Book 00:00 - 23:00</div></div></div>{isFullDay ? <CheckCircle2 className="w-6 h-6 text-indigo-600"/> : <div className="w-6 h-6 rounded-full border-2 border-slate-300"></div>}</div>
          <div className="border-2 border-slate-50 rounded-xl p-4"><div className="flex items-center justify-between mb-3"><div className="flex items-center gap-2 text-slate-700"><Repeat className="w-4 h-4"/><span className="font-bold text-sm">Repeat</span></div><span className="text-xs text-slate-400 font-medium">{getEndDate()}</span></div><div className="grid grid-cols-4 gap-2">{[0, 1, 2, 3].map(opt => (<button key={opt} onClick={() => setRepeatOption(opt)} className={`py-2 rounded-lg text-xs font-bold transition ${repeatOption === opt ? `${styles.darkBg} text-white` : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{opt === 0 ? 'Once' : `${opt + 1} Wks`}</button>))}</div></div>
          <button onClick={() => onConfirm(repeatOption, isFullDay, selectedSubOption)} disabled={isBooking} className={`w-full py-4 text-white font-bold rounded-xl mt-2 flex items-center justify-center gap-2 disabled:opacity-70 ${styles.darkBg}`}>{isBooking ? <Loader2 className="animate-spin w-5 h-5"/> : isFullDay ? "Confirm Full Day" : "Confirm Booking"}</button>
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