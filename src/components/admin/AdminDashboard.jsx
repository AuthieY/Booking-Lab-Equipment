import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, query, where, onSnapshot, addDoc, deleteDoc, updateDoc, doc, serverTimestamp, orderBy, limit, Timestamp
} from 'firebase/firestore';
import { 
  ShieldCheck, LogOut, Settings, Book, History, Plus, Pencil, Trash2, MapPin, Wrench, MessageSquare, ChevronDown, ChevronRight
} from 'lucide-react';
import { db, appId, addAuditLog } from '../../api/firebase';
import { formatTime, getColorStyle } from '../../utils/helpers';
import { applyDocChanges } from '../../utils/firestore';
import { measurePerf } from '../../utils/perf';
import InstrumentModal from '../modals/InstrumentModal';
import ConfirmDialog from '../common/ConfirmDialog';
import ToastStack from '../common/ToastStack';
import { useToast } from '../../hooks/useToast';

const isBookingActivityLog = (log) => {
  const action = (log.action || '').toUpperCase();
  return action.includes('BOOK') || action.includes('CANCEL');
};

const AdminDashboard = ({ labName, onLogout }) => {
  const [instruments, setInstruments] = useState([]);
  const [logs, setLogs] = useState([]);
  const [notes, setNotes] = useState([]); 
  const [openedInstrumentNotes, setOpenedInstrumentNotes] = useState({});
  const [expandedNotesByInstrument, setExpandedNotesByInstrument] = useState({});
  const [openedLogMonths, setOpenedLogMonths] = useState({});
  const [openedLogUsers, setOpenedLogUsers] = useState({});
  const [showAllUserLogs, setShowAllUserLogs] = useState({});
  const [hasLoadedInstruments, setHasLoadedInstruments] = useState(false);
  const [hasLoadedLogs, setHasLoadedLogs] = useState(false);
  const [hasLoadedNotes, setHasLoadedNotes] = useState(false);
  const [activeTab, setActiveTab] = useState('INSTRUMENTS'); 
  const [showInstrumentModal, setShowInstrumentModal] = useState(false);
  const [editingInstrument, setEditingInstrument] = useState(null); 
  const [instrumentToDelete, setInstrumentToDelete] = useState(null);
  const [noteToDelete, setNoteToDelete] = useState(null);
  const { toasts, pushToast, dismissToast } = useToast();
  
  useEffect(() => {
    setHasLoadedInstruments(false);
    setHasLoadedLogs(false);
    setHasLoadedNotes(false);
    setInstruments([]);
    setLogs([]);
    setNotes([]);

    // 1) Instruments stream
    const qInst = query(collection(db, 'artifacts', appId, 'public', 'data', 'instruments'), where('labName', '==', labName));
    const unsubInst = onSnapshot(
      qInst,
      (snap) => {
        setInstruments((prev) => measurePerf(
          'admin.instruments.applyDocChanges',
          () => applyDocChanges(prev, snap.docChanges()),
          { changes: snap.docChanges().length }
        ));
        setHasLoadedInstruments(true);
      },
      () => {
        setHasLoadedInstruments(true);
        pushToast('Unable to load instruments.', 'error');
      }
    );
    
    // 2) Logs stream
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 2);
    const qLogs = query(
      collection(db, 'artifacts', appId, 'public', 'data', 'logs'),
      where('labName', '==', labName),
      where('timestamp', '>=', Timestamp.fromDate(cutoff)),
      orderBy('timestamp', 'desc'),
      limit(1200)
    );
    const unsubLogs = onSnapshot(
      qLogs,
      (snap) => {
        setLogs((prev) => {
          const next = measurePerf(
            'admin.logs.applyDocChanges',
            () => applyDocChanges(prev, snap.docChanges()),
            { changes: snap.docChanges().length }
          );
          next.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
          return next;
        });
        setHasLoadedLogs(true);
      },
      () => {
        setHasLoadedLogs(true);
        pushToast('Unable to load logs.', 'error');
      }
    );

    // 3) Notes / reports stream
    const qNotes = query(collection(db, 'artifacts', appId, 'public', 'data', 'notes'), where('labName', '==', labName));
    const unsubNotes = onSnapshot(
      qNotes,
      (snap) => {
          setNotes((prev) => {
            const next = measurePerf(
              'admin.notes.applyDocChanges',
              () => applyDocChanges(prev, snap.docChanges()),
              { changes: snap.docChanges().length }
            );
            next.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
            return next;
          });
          setHasLoadedNotes(true);
      },
      () => {
        setHasLoadedNotes(true);
        pushToast('Unable to load reports.', 'error');
      }
    );

    return () => { unsubInst(); unsubLogs(); unsubNotes(); };
  }, [labName, pushToast]);

  // Handle instrument save (includes maintenance and conflict settings).
  const handleSaveInstrument = async (data) => {
    try {
      if (editingInstrument) {
          const ref = doc(db, 'artifacts', appId, 'public', 'data', 'instruments', editingInstrument.id);
          await updateDoc(ref, { ...data });
          await addAuditLog(labName, 'EDIT_INST', `Updated instrument: ${data.name}${data.isUnderMaintenance ? ' (MAINTENANCE ON)' : ''}`, 'Admin');
          pushToast(`Updated ${data.name}.`, 'success');
      } else {
          await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'instruments'), { labName, ...data, createdAt: serverTimestamp() });
          await addAuditLog(labName, 'ADD_INST', `Added instrument: ${data.name}`, 'Admin');
          pushToast(`Added ${data.name}.`, 'success');
      }
      setShowInstrumentModal(false);
      setEditingInstrument(null);
    } catch {
      pushToast('Unable to save instrument. Please try again.', 'error');
    }
  };

  const handleDeleteInstrument = (id, name) => {
    setInstrumentToDelete({ id, name });
  };

  const confirmDeleteInstrument = async () => {
    if (!instrumentToDelete) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'instruments', instrumentToDelete.id));
      await addAuditLog(labName, 'DEL_INST', `Deleted instrument: ${instrumentToDelete.name}`, 'Admin');
      pushToast(`Deleted ${instrumentToDelete.name}.`, 'success');
    } catch {
      pushToast('Unable to delete instrument. Please try again.', 'error');
    } finally {
      setInstrumentToDelete(null);
    }
  };

  const handleDeleteNote = (note) => {
    setNoteToDelete(note);
  };

  const confirmDeleteNote = async () => {
    if (!noteToDelete) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'notes', noteToDelete.id));
      pushToast('Report deleted.', 'success');
    } catch {
      pushToast('Unable to delete report. Please try again.', 'error');
    } finally {
      setNoteToDelete(null);
    }
  };

  const toggleInstrumentNotes = (instrumentId) => {
    setExpandedNotesByInstrument((prev) => ({
      ...prev,
      [instrumentId]: !prev[instrumentId]
    }));
  };

  const toggleInstrumentPanel = (instrumentId) => {
    setOpenedInstrumentNotes((prev) => ({
      ...prev,
      [instrumentId]: !prev[instrumentId]
    }));
  };

  const notesByInstrument = useMemo(() => measurePerf(
    'admin.notes.groupByInstrument',
    () => {
      const grouped = {};
      notes.forEach((note) => {
        if (!note.instrumentId) return;
        if (!grouped[note.instrumentId]) grouped[note.instrumentId] = [];
        grouped[note.instrumentId].push(note);
      });
      return grouped;
    },
    { noteCount: notes.length }
  ), [notes]);

  const logsByMonth = useMemo(() => measurePerf(
    'admin.logs.groupByMonth',
    () => {
      const map = {};
      logs.forEach((log) => {
        const d = log.timestamp?.toDate?.();
        if (!d) return;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!map[key]) {
          map[key] = {
            label: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
            logs: []
          };
        }
        map[key].logs.push(log);
      });
      return Object.entries(map)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([key, value]) => ({ key, ...value }));
    },
    { logCount: logs.length }
  ), [logs]);

  const bookingUsersByMonth = useMemo(() => measurePerf(
    'admin.logs.groupBookingUsers',
    () => {
      const map = {};
      logsByMonth.forEach((group) => {
        const logsByUser = {};
        group.logs.forEach((log) => {
          if (!isBookingActivityLog(log)) return;
          const userKey = log.userName || 'Unknown';
          if (!logsByUser[userKey]) logsByUser[userKey] = [];
          logsByUser[userKey].push(log);
        });
        map[group.key] = Object.entries(logsByUser)
          .sort((a, b) => ((b[1][0]?.timestamp?.seconds || 0) - (a[1][0]?.timestamp?.seconds || 0)));
      });
      return map;
    },
    { monthCount: logsByMonth.length }
  ), [logsByMonth]);

  useEffect(() => {
    if (logsByMonth.length === 0) return;
    setOpenedLogMonths((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      return { [logsByMonth[0].key]: true };
    });
  }, [logsByMonth]);

  const toggleLogMonth = (monthKey) => {
    setOpenedLogMonths((prev) => ({
      ...prev,
      [monthKey]: !prev[monthKey]
    }));
  };

  const toggleLogUser = (monthKey, userName) => {
    const key = `${monthKey}::${userName}`;
    setOpenedLogUsers((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const toggleShowAllLogsForUser = (monthKey, userName) => {
    const key = `${monthKey}::${userName}`;
    setShowAllUserLogs((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  return (
    <div className="min-h-screen ds-page font-sans ds-animate-enter-fast">
        <header className="bg-slate-800 text-white px-4 md:px-6 py-3 md:py-4 flex justify-between items-center sticky top-0 z-50 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="bg-slate-700 p-2 rounded-lg"><ShieldCheck className="w-6 h-6 text-yellow-400"/></div>
              <div><h1 className="font-bold text-lg leading-tight">{labName}</h1><p className="text-xs text-slate-400">Admin workspace</p></div>
            </div>
            <button type="button" aria-label="Sign out from admin workspace" onClick={onLogout} className="text-slate-300 hover:text-white flex items-center gap-2 text-sm"><LogOut className="w-4 h-4"/> Sign out</button>
        </header>

        <div className="p-4 md:p-6 max-w-5xl mx-auto">
            {/* Tab navigation */}
            <div className="flex gap-3 mb-6 overflow-x-auto no-scrollbar" role="tablist" aria-label="Admin sections">
                <button type="button" role="tab" aria-selected={activeTab==='INSTRUMENTS'} onClick={()=>setActiveTab('INSTRUMENTS')} className={`flex-1 min-w-[140px] p-4 ds-tab flex items-center justify-center gap-3 font-bold ${activeTab==='INSTRUMENTS'?'ds-tab-active':'ds-tab-inactive'}`}><Settings className="w-5 h-5"/> Instruments</button>
                <button type="button" role="tab" aria-selected={activeTab==='NOTEBOOK'} onClick={()=>setActiveTab('NOTEBOOK')} className={`flex-1 min-w-[140px] p-4 ds-tab flex items-center justify-center gap-3 font-bold ${activeTab==='NOTEBOOK'?'ds-tab-active':'ds-tab-inactive'}`}><Book className="w-5 h-5"/> Notes</button>
                <button type="button" role="tab" aria-selected={activeTab==='LOGS'} onClick={()=>setActiveTab('LOGS')} className={`flex-1 min-w-[140px] p-4 ds-tab flex items-center justify-center gap-3 font-bold ${activeTab==='LOGS'?'ds-tab-active':'ds-tab-inactive'}`}><History className="w-5 h-5"/> Logs</button>
            </div>

            {/* 1) Instruments tab */}
            {activeTab === 'INSTRUMENTS' && (
                <div className="ds-card p-6">
                    <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-bold text-slate-800">Instruments ({instruments.length})</h2><button type="button" onClick={()=>{setEditingInstrument(null); setShowInstrumentModal(true);}} className="ds-btn ds-btn-primary px-4 py-2 text-sm"><Plus className="w-4 h-4"/> Add instrument</button></div>
                    <div className="space-y-3">
                      {!hasLoadedInstruments && <div className="sr-only" role="status" aria-live="polite">Loading instruments</div>}
                      {!hasLoadedInstruments && Array.from({ length: 4 }, (_, index) => (
                        <div key={`inst-skeleton-${index}`} className="flex items-center justify-between p-4 ds-card-muted animate-pulse">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-lg bg-slate-200" />
                            <div>
                              <div className="h-4 w-36 bg-slate-200 rounded mb-2" />
                              <div className="h-3 w-20 bg-slate-100 rounded" />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <div className="w-9 h-9 rounded-lg bg-slate-100" />
                            <div className="w-9 h-9 rounded-lg bg-slate-100" />
                          </div>
                        </div>
                      ))}
                      {hasLoadedInstruments && instruments.length === 0 && (
                        <div className="ds-card-muted p-6 text-center">
                          <h3 className="text-slate-600 font-bold">No instruments yet</h3>
                          <p className="text-slate-400 text-xs mt-1">Create your first instrument to start taking bookings.</p>
                        </div>
                      )}
                      {hasLoadedInstruments && instruments.map(inst => (
                        <div key={inst.id} className="flex items-center justify-between p-4 ds-card-muted hover:border-slate-300">
                          <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${getColorStyle(inst.color).bg} ${getColorStyle(inst.color).text} font-bold text-xl relative`}>
                              {inst.name[0]}
                              {inst.isUnderMaintenance && <div className="absolute -top-1 -right-1 bg-orange-500 p-0.5 rounded-full border-2 border-white"><Wrench className="w-3 h-3 text-white"/></div>}
                            </div>
                            <div>
                              <div className="font-bold text-slate-800 flex items-center gap-2">{inst.name} {inst.isUnderMaintenance && <span className="text-[9px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded font-black uppercase">Maint</span>}</div>
                              <div className="text-xs text-slate-500 flex items-center gap-1"><MapPin className="w-3 h-3"/> {inst.location || 'No location'}</div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                              <button type="button" aria-label={`Edit ${inst.name}`} onClick={()=>{setEditingInstrument(inst); setShowInstrumentModal(true);}} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"><Pencil className="w-5 h-5"/></button>
                              <button type="button" aria-label={`Delete ${inst.name}`} onClick={()=>handleDeleteInstrument(inst.id, inst.name)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"><Trash2 className="w-5 h-5"/></button>
                          </div>
                        </div>
                      ))}
                    </div>
                </div>
            )}

            {/* 2) Notes tab (grouped by instrument) */}
            {activeTab === 'NOTEBOOK' && (
                <div className="space-y-4">
                    <div className="ds-card p-4 mb-2">
                      <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Book className="w-5 h-5 text-indigo-500"/> Latest reports by instrument</h2>
                      <p className="text-xs text-slate-400 mt-1">Click an instrument to open its latest note, then use "See more" for older notes.</p>
                    </div>

                    {(!hasLoadedInstruments || !hasLoadedNotes) && Array.from({ length: 3 }, (_, index) => (
                      <div key={`note-skeleton-${index}`} className="ds-card p-4 rounded-2xl animate-pulse">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-slate-200" />
                            <div>
                              <div className="h-4 w-44 bg-slate-200 rounded mb-2" />
                              <div className="h-3 w-20 bg-slate-100 rounded" />
                            </div>
                          </div>
                          <div className="h-3 w-10 bg-slate-100 rounded" />
                        </div>
                        <div className="mt-4 h-14 bg-slate-50 rounded-xl border border-slate-100" />
                      </div>
                    ))}
                    {(!hasLoadedInstruments || !hasLoadedNotes) && <div className="sr-only" role="status" aria-live="polite">Loading notes</div>}

                    {hasLoadedInstruments && hasLoadedNotes && instruments.map(inst => {
                        const instrumentNotes = notesByInstrument[inst.id] || [];
                        if (instrumentNotes.length === 0) return null;
                        const isOpen = Boolean(openedInstrumentNotes[inst.id]);
                        const isExpanded = Boolean(expandedNotesByInstrument[inst.id]);
                        const visibleNotes = isExpanded ? instrumentNotes : [instrumentNotes[0]];
                        const hiddenCount = instrumentNotes.length - 1;

                        const styles = getColorStyle(inst.color);
                        return (
                            <div key={inst.id} className="ds-card p-4 border-l-4 rounded-2xl" style={{ borderLeftColor: styles.accent || '#3b82f6' }}>
                                <button type="button" aria-expanded={isOpen} aria-label={`${isOpen ? 'Collapse' : 'Expand'} notes for ${inst.name}`} onClick={() => toggleInstrumentPanel(inst.id)} className="w-full flex items-center justify-between gap-3 text-left">
                                  <div className="flex items-center gap-3">
                                    <div className={`p-1.5 rounded-lg ${styles.bg} ${styles.text}`}><MessageSquare className="w-4 h-4"/></div>
                                    <div>
                                        <h3 className="font-bold text-slate-800">{inst.name}</h3>
                                        <p className="text-[10px] text-slate-400 uppercase tracking-widest">{instrumentNotes.length} Reports</p>
                                    </div>
                                  </div>
                                  <span className="text-xs font-bold text-slate-500">{isOpen ? 'Hide' : 'Open'}</span>
                                </button>
                                {isOpen && (
                                <div className="space-y-2 mt-3">
                                    {visibleNotes.map(note => (
                                        <div key={note.id} className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 relative group transition-all hover:bg-white">
                                            <div className="flex justify-between items-start mb-1.5">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-xs text-slate-700">{note.userName}</span>
                                                    <span className="text-[10px] bg-white px-2 py-0.5 rounded-full border border-slate-200 text-slate-400 font-data tabular-nums">{formatTime(note.timestamp)}</span>
                                                </div>
                                                <button type="button" aria-label={`Delete note by ${note.userName}`} onClick={() => handleDeleteNote(note)} className="text-slate-300 hover:text-red-500 transition opacity-0 group-hover:opacity-100"><Trash2 className="w-4 h-4"/></button>
                                            </div>
                                            <p className="text-slate-600 text-xs leading-relaxed whitespace-pre-wrap">{note.message}</p>
                                        </div>
                                    ))}
                                    {instrumentNotes.length > 1 && (
                                      <button type="button" aria-expanded={isExpanded} onClick={() => toggleInstrumentNotes(inst.id)} className="text-xs font-bold text-blue-600 hover:text-blue-700">
                                        {isExpanded ? 'Show less' : `See ${hiddenCount} more`}
                                      </button>
                                    )}
                                </div>
                                )}
                            </div>
                        );
                    })}

                    {hasLoadedInstruments && hasLoadedNotes && notes.length === 0 && (
                        <div className="ds-card p-6 text-center">
                            <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"><Book className="w-8 h-8 text-slate-300"/></div>
                            <h3 className="text-slate-500 font-bold">No reports yet</h3>
                            <p className="text-slate-400 text-xs mt-1">All instruments are running smoothly.</p>
                        </div>
                    )}
                </div>
            )}

            {/* 3) Logs tab */}
            {activeTab === 'LOGS' && (
                <div className="ds-card p-6">
                  <h2 className="text-xl font-bold text-slate-800 mb-2">System logs</h2>
                  <p className="text-xs text-slate-400 mb-5">Only the most recent 2 months are kept.</p>
                  <div className="space-y-3">
                    {!hasLoadedLogs && <div className="sr-only" role="status" aria-live="polite">Loading logs</div>}
                    {!hasLoadedLogs && Array.from({ length: 2 }, (_, index) => (
                      <div key={`log-skeleton-${index}`} className="border border-slate-100 rounded-xl overflow-hidden animate-pulse">
                        <div className="w-full flex items-center justify-between px-4 py-3 bg-slate-50">
                          <div className="h-4 w-24 bg-slate-200 rounded" />
                          <div className="h-3 w-16 bg-slate-100 rounded" />
                        </div>
                        <div className="p-3 space-y-2 bg-white">
                          <div className="h-10 rounded-lg bg-slate-50 border border-slate-100" />
                          <div className="h-10 rounded-lg bg-slate-50 border border-slate-100" />
                        </div>
                      </div>
                    ))}
                    {hasLoadedLogs && logsByMonth.map((group) => {
                      const isOpen = Boolean(openedLogMonths[group.key]);
                      const users = bookingUsersByMonth[group.key] || [];
                      return (
                        <div key={group.key} className="border border-slate-100 rounded-xl overflow-hidden">
                          <button
                            type="button"
                            aria-expanded={isOpen}
                            onClick={() => toggleLogMonth(group.key)}
                            className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition"
                          >
                            <div className="flex items-center gap-2">
                              {isOpen ? <ChevronDown className="w-4 h-4 text-slate-500"/> : <ChevronRight className="w-4 h-4 text-slate-500"/>}
                              <span className="font-bold text-slate-700 font-data tabular-nums">{group.label}</span>
                            </div>
                            <span className="text-xs text-slate-400 font-data tabular-nums">{users.length} people</span>
                          </button>
                          {isOpen && (
                            <div className="p-3 space-y-2 bg-white">
                              {users.map(([userName, userLogs]) => {
                                const openKey = `${group.key}::${userName}`;
                                const isUserOpen = Boolean(openedLogUsers[openKey]);
                                const isShowAll = Boolean(showAllUserLogs[openKey]);
                                const visibleLogs = isShowAll ? userLogs : userLogs.slice(0, 10);
                                return (
                                  <div key={openKey} className="border border-slate-100 rounded-lg overflow-hidden">
                                    <button
                                      type="button"
                                      aria-expanded={isUserOpen}
                                      onClick={() => toggleLogUser(group.key, userName)}
                                      className="w-full px-3 py-2 bg-slate-50 hover:bg-slate-100 transition flex items-center justify-between"
                                    >
                                      <div className="flex items-center gap-2">
                                        {isUserOpen ? <ChevronDown className="w-4 h-4 text-slate-500"/> : <ChevronRight className="w-4 h-4 text-slate-500"/>}
                                        <span className="font-bold text-slate-700">{userName}</span>
                                      </div>
                                      <span className="text-[11px] text-slate-400 font-data tabular-nums">{userLogs.length} booking logs</span>
                                    </button>
                                    {isUserOpen && (
                                      <div className="divide-y divide-slate-100">
                                        {visibleLogs.map((log) => (
                                          <div key={log.id} className="px-3 py-2 grid grid-cols-[100px_110px_1fr] gap-2 items-start text-xs hover:bg-slate-50">
                                            <div className="text-slate-400 font-data tabular-nums">{formatTime(log.timestamp)}</div>
                                            <div>
                                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${(log.action || '').includes('CANCEL') ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                                                {log.action || 'LOG'}
                                              </span>
                                            </div>
                                            <div className="text-slate-600">{log.message}</div>
                                          </div>
                                        ))}
                                        {userLogs.length > 10 && (
                                          <button
                                            type="button"
                                            aria-expanded={isShowAll}
                                            onClick={() => toggleShowAllLogsForUser(group.key, userName)}
                                            className="w-full text-left px-3 py-2 text-xs font-bold text-blue-600 hover:bg-blue-50 transition"
                                          >
                                            {isShowAll ? 'Show recent 10' : 'See all booking activity'}
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                              {users.length === 0 && (
                                <div className="text-xs text-slate-400 bg-slate-50 border border-slate-100 rounded-lg p-4 text-center">
                                  No booking activity this month.
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {hasLoadedLogs && logsByMonth.length === 0 && (
                      <div className="text-sm text-slate-400 bg-slate-50 border border-slate-100 rounded-xl p-6 text-center">No recent logs.</div>
                    )}
                  </div>
                </div>
            )}
        </div>
        
        {/* Dialog: keep props explicit for edit/create flows */}
        <InstrumentModal 
          isOpen={showInstrumentModal} 
          onClose={()=>setShowInstrumentModal(false)} 
          onSave={handleSaveInstrument} 
          initialData={editingInstrument} 
          existingInstruments={instruments} 
        />
        <ConfirmDialog
          isOpen={Boolean(instrumentToDelete)}
          title="Delete instrument?"
          message={instrumentToDelete ? `This will remove "${instrumentToDelete.name}" from the lab.` : ''}
          confirmLabel="Delete"
          tone="danger"
          onCancel={() => setInstrumentToDelete(null)}
          onConfirm={confirmDeleteInstrument}
        />
        <ConfirmDialog
          isOpen={Boolean(noteToDelete)}
          title="Delete report?"
          message={noteToDelete ? `Delete the report from ${noteToDelete.userName || 'this user'}?` : ''}
          confirmLabel="Delete"
          tone="danger"
          onCancel={() => setNoteToDelete(null)}
          onConfirm={confirmDeleteNote}
        />
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};

export default AdminDashboard;
