import React, { useState, useEffect } from 'react';
import { 
  collection, query, where, onSnapshot, addDoc, deleteDoc, updateDoc, doc, serverTimestamp 
} from 'firebase/firestore';
import { 
  ShieldCheck, LogOut, Settings, Book, History, Plus, Pencil, Trash2, MapPin, Wrench, MessageSquare, AlertTriangle
} from 'lucide-react';
import { db, appId, addAuditLog } from '../../api/firebase';
import { formatTime, getColorStyle } from '../../utils/helpers';
import InstrumentModal from '../modals/InstrumentModal';

const AdminDashboard = ({ labName, onLogout }) => {
  const [instruments, setInstruments] = useState([]);
  const [logs, setLogs] = useState([]);
  const [notes, setNotes] = useState([]); 
  const [activeTab, setActiveTab] = useState('INSTRUMENTS'); 
  const [showInstrumentModal, setShowInstrumentModal] = useState(false);
  const [editingInstrument, setEditingInstrument] = useState(null); 

  useEffect(() => {
    // 1. 监听仪器数据
    const qInst = query(collection(db, 'artifacts', appId, 'public', 'data', 'instruments'), where('labName', '==', labName));
    const unsubInst = onSnapshot(qInst, (snap) => setInstruments(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    
    // 2. 监听日志数据
    const qLogs = query(collection(db, 'artifacts', appId, 'public', 'data', 'logs'), where('labName', '==', labName));
    const unsubLogs = onSnapshot(qLogs, (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        data.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
        setLogs(data);
    });

    // 3. 监听笔记/报告数据
    const qNotes = query(collection(db, 'artifacts', appId, 'public', 'data', 'notes'), where('labName', '==', labName));
    const unsubNotes = onSnapshot(qNotes, (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        data.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
        setNotes(data);
    });

    return () => { unsubInst(); unsubLogs(); unsubNotes(); };
  }, [labName]);

  // 处理仪器保存 (包含维护状态和冲突逻辑)
  const handleSaveInstrument = async (data) => {
    if (editingInstrument) {
        const ref = doc(db, 'artifacts', appId, 'public', 'data', 'instruments', editingInstrument.id);
        await updateDoc(ref, { ...data });
        await addAuditLog(labName, 'EDIT_INST', `Modified: ${data.name}${data.isUnderMaintenance ? ' (MAINTENANCE ON)' : ''}`, 'Admin');
    } else {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'instruments'), { labName, ...data, createdAt: serverTimestamp() });
        await addAuditLog(labName, 'ADD_INST', `Added: ${data.name}`, 'Admin');
    }
    setShowInstrumentModal(false);
    setEditingInstrument(null);
  };

  const handleDeleteInstrument = async (id, name) => {
    if(!confirm(`Delete ${name}?`)) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'instruments', id));
    await addAuditLog(labName, 'DEL_INST', `Deleted: ${name}`, 'Admin');
  };

  const handleDeleteNote = async (id) => {
      if(!confirm("Delete this note?")) return;
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'notes', id));
  };

  return (
    <div className="min-h-screen bg-slate-100 font-sans">
        <header className="bg-slate-800 text-white px-6 py-4 flex justify-between items-center sticky top-0 z-50 shadow-md">
            <div className="flex items-center gap-3">
              <div className="bg-slate-700 p-2 rounded-lg"><ShieldCheck className="w-6 h-6 text-yellow-400"/></div>
              <div><h1 className="font-bold text-lg leading-tight">{labName}</h1><p className="text-xs text-slate-400">Admin Console</p></div>
            </div>
            <button onClick={onLogout} className="text-slate-300 hover:text-white flex items-center gap-2 text-sm"><LogOut className="w-4 h-4"/> Logout</button>
        </header>

        <div className="p-6 max-w-5xl mx-auto">
            {/* Tab 导航 */}
            <div className="flex gap-4 mb-6 overflow-x-auto no-scrollbar">
                <button onClick={()=>setActiveTab('INSTRUMENTS')} className={`flex-1 min-w-[140px] p-4 rounded-2xl flex items-center justify-center gap-3 transition font-bold ${activeTab==='INSTRUMENTS'?'bg-white shadow-lg text-slate-800':'bg-slate-200 text-slate-500 hover:bg-slate-300'}`}><Settings className="w-5 h-5"/> Devices</button>
                <button onClick={()=>setActiveTab('NOTEBOOK')} className={`flex-1 min-w-[140px] p-4 rounded-2xl flex items-center justify-center gap-3 transition font-bold ${activeTab==='NOTEBOOK'?'bg-white shadow-lg text-slate-800':'bg-slate-200 text-slate-500 hover:bg-slate-300'}`}><Book className="w-5 h-5"/> Notebook</button>
                <button onClick={()=>setActiveTab('LOGS')} className={`flex-1 min-w-[140px] p-4 rounded-2xl flex items-center justify-center gap-3 transition font-bold ${activeTab==='LOGS'?'bg-white shadow-lg text-slate-800':'bg-slate-200 text-slate-500 hover:bg-slate-300'}`}><History className="w-5 h-5"/> Logs</button>
            </div>

            {/* 1. 仪器列表标签页 */}
            {activeTab === 'INSTRUMENTS' && (
                <div className="bg-white rounded-3xl p-6 shadow-sm">
                    <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-bold text-slate-800">Devices ({instruments.length})</h2><button onClick={()=>{setEditingInstrument(null); setShowInstrumentModal(true);}} className="bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-700 flex items-center gap-2"><Plus className="w-4 h-4"/> Add</button></div>
                    <div className="space-y-3">
                      {instruments.map(inst => (
                        <div key={inst.id} className="flex items-center justify-between p-4 border border-slate-100 rounded-xl hover:border-slate-300 transition bg-slate-50">
                          <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${getColorStyle(inst.color).bg} ${getColorStyle(inst.color).text} font-bold text-xl relative`}>
                              {inst.name[0]}
                              {inst.isUnderMaintenance && <div className="absolute -top-1 -right-1 bg-orange-500 p-0.5 rounded-full border-2 border-white"><Wrench className="w-3 h-3 text-white"/></div>}
                            </div>
                            <div>
                              <div className="font-bold text-slate-800 flex items-center gap-2">{inst.name} {inst.isUnderMaintenance && <span className="text-[9px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded font-black uppercase">Maint</span>}</div>
                              <div className="text-xs text-slate-500 flex items-center gap-1"><MapPin className="w-3 h-3"/> {inst.location || 'No Location'}</div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                              <button onClick={()=>{setEditingInstrument(inst); setShowInstrumentModal(true);}} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"><Pencil className="w-5 h-5"/></button>
                              <button onClick={()=>handleDeleteInstrument(inst.id, inst.name)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"><Trash2 className="w-5 h-5"/></button>
                          </div>
                        </div>
                      ))}
                    </div>
                </div>
            )}

            {/* 2. 优化的笔记/报告标签页 (按仪器分类) */}
            {activeTab === 'NOTEBOOK' && (
                <div className="space-y-6">
                    <div className="bg-white rounded-3xl p-6 shadow-sm mb-4">
                      <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Book className="w-6 h-6 text-indigo-500"/> Categorized Reports</h2>
                      <p className="text-xs text-slate-400 mt-1">Issues and user notes grouped by device.</p>
                    </div>

                    {instruments.map(inst => {
                        const instrumentNotes = notes.filter(n => n.instrumentId === inst.id);
                        if (instrumentNotes.length === 0) return null; // 如果该仪器没留言，不显示该分类

                        const styles = getColorStyle(inst.color);
                        return (
                            <div key={inst.id} className="bg-white rounded-3xl p-6 shadow-sm border-l-8" style={{ borderLeftColor: styles.text.includes('blue') ? '#3b82f6' : styles.text.includes('red') ? '#ef4444' : styles.text.includes('green') ? '#22c55e' : styles.text.includes('amber') ? '#f59e0b' : '#a855f7' }}>
                                <div className="flex items-center gap-3 mb-4">
                                    <div className={`p-2 rounded-lg ${styles.bg} ${styles.text}`}><MessageSquare className="w-5 h-5"/></div>
                                    <div>
                                        <h3 className="font-bold text-slate-800">{inst.name}</h3>
                                        <p className="text-[10px] text-slate-400 uppercase tracking-widest">{instrumentNotes.length} Reports</p>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    {instrumentNotes.map(note => (
                                        <div key={note.id} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 relative group transition-all hover:bg-white hover:shadow-md">
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-sm text-slate-700">{note.userName}</span>
                                                    <span className="text-[10px] bg-white px-2 py-0.5 rounded-full border border-slate-200 text-slate-400">{formatTime(note.timestamp)}</span>
                                                </div>
                                                <button onClick={() => handleDeleteNote(note.id)} className="text-slate-300 hover:text-red-500 transition opacity-0 group-hover:opacity-100"><Trash2 className="w-4 h-4"/></button>
                                            </div>
                                            <p className="text-slate-600 text-sm leading-relaxed whitespace-pre-wrap">{note.message}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}

                    {notes.length === 0 && (
                        <div className="bg-white rounded-3xl p-12 text-center shadow-sm">
                            <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"><Book className="w-8 h-8 text-slate-300"/></div>
                            <h3 className="text-slate-500 font-bold">No reports yet</h3>
                            <p className="text-slate-400 text-xs mt-1">All instruments are running smoothly.</p>
                        </div>
                    )}
                </div>
            )}

            {/* 3. 系统日志标签页 */}
            {activeTab === 'LOGS' && (
                <div className="bg-white rounded-3xl p-6 shadow-sm"><h2 className="text-xl font-bold text-slate-800 mb-6">System Logs</h2><div className="overflow-hidden rounded-xl border border-slate-100"><table className="w-full text-sm text-left"><thead className="bg-slate-50 text-slate-500 font-medium"><tr><th className="p-4">Time</th><th className="p-4">User</th><th className="p-4">Action</th><th className="p-4">Details</th></tr></thead><tbody className="divide-y divide-slate-100">{logs.map(log => (<tr key={log.id} className="hover:bg-slate-50"><td className="p-4 text-slate-400 font-mono text-xs">{formatTime(log.timestamp)}</td><td className="p-4 font-bold text-slate-700">{log.userName}</td><td className="p-4"><span className={`px-2 py-1 rounded text-xs font-bold ${log.action.includes('DEL') || log.action.includes('CANCEL') ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>{log.action}</span></td><td className="p-4 text-slate-600">{log.message}</td></tr>))}</tbody></table></div></div>
            )}
        </div>
        
        {/* 核心弹窗：确保 props 完整传递 */}
        <InstrumentModal 
          isOpen={showInstrumentModal} 
          onClose={()=>setShowInstrumentModal(false)} 
          onSave={handleSaveInstrument} 
          initialData={editingInstrument} 
          existingInstruments={instruments} 
        />
    </div>
  );
};

export default AdminDashboard;