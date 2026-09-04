import React, { useState, useEffect, useMemo } from 'react';
import {
  collection, query, where, onSnapshot, addDoc, deleteDoc, updateDoc, doc, serverTimestamp, orderBy, limit, Timestamp,
  getDocs, writeBatch, arrayRemove
} from 'firebase/firestore';
import {
  ShieldCheck, LogOut, Settings, Book, History, Plus, Pencil, Trash2, MapPin, ChevronDown, ChevronRight
} from 'lucide-react';
import { db, appId, addAuditLog } from '../../api/firebase';
import { formatTime, getColorStyle } from '../../utils/helpers';
import { applyDocChanges } from '../../utils/firestore';
import { measurePerf } from '../../utils/perf';
import InstrumentModal from '../modals/InstrumentModal';
import ConfirmDialog from '../common/ConfirmDialog';
import ToastStack from '../common/ToastStack';
import ThemeToggle from '../common/ThemeToggle';
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
      (error) => {
        setHasLoadedInstruments(true);
        if (error?.code === 'permission-denied') {
          pushToast('Your session is no longer valid. Please sign in again.', 'warning');
          onLogout();
          return;
        }
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
      (error) => {
        setHasLoadedLogs(true);
        if (error?.code === 'permission-denied') return;
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
      (error) => {
        setHasLoadedNotes(true);
        if (error?.code === 'permission-denied') return;
        pushToast('Unable to load reports.', 'error');
      }
    );

    return () => { unsubInst(); unsubLogs(); unsubNotes(); };
  }, [labName, pushToast, onLogout]);

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
    const { id, name } = instrumentToDelete;
    try {
      // Collect everything that references the instrument (doc ids are unique,
      // so instrumentId alone is enough to scope each query).
      const [bookingSnap, aggregateSnap, noteSnap] = await Promise.all([
        getDocs(query(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'), where('instrumentId', '==', id))),
        getDocs(query(collection(db, 'artifacts', appId, 'public', 'data', 'booking_slot_aggregates'), where('instrumentId', '==', id))),
        getDocs(query(collection(db, 'artifacts', appId, 'public', 'data', 'notes'), where('instrumentId', '==', id)))
      ]);
      const refsToDelete = [
        ...bookingSnap.docs.map((snap) => snap.ref),
        ...aggregateSnap.docs.map((snap) => snap.ref),
        ...noteSnap.docs.map((snap) => snap.ref)
      ];
      const conflictRefs = instruments
        .filter((inst) => inst.id !== id && Array.isArray(inst.conflicts) && inst.conflicts.includes(id))
        .map((inst) => doc(db, 'artifacts', appId, 'public', 'data', 'instruments', inst.id));

      // Referencing docs go first so no commit ever removes the instrument
      // while its bookings still exist (batches cap at 500 writes).
      const BATCH_WRITE_LIMIT = 500;
      for (let start = 0; start < refsToDelete.length; start += BATCH_WRITE_LIMIT) {
        const batch = writeBatch(db);
        refsToDelete.slice(start, start + BATCH_WRITE_LIMIT).forEach((ref) => batch.delete(ref));
        await batch.commit();
      }
      const finalBatch = writeBatch(db);
      conflictRefs.forEach((ref) => finalBatch.update(ref, { conflicts: arrayRemove(id) }));
      finalBatch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'instruments', id));
      await finalBatch.commit();

      await addAuditLog(labName, 'DEL_INST', `Deleted instrument: ${name} (removed ${bookingSnap.size} bookings, ${noteSnap.size} reports)`, 'Admin');
      pushToast(`Deleted ${name} and its bookings.`, 'success');
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

  // Reports left behind by instruments deleted before cascade cleanup existed.
  const orphanedNoteGroups = useMemo(() => {
    const knownIds = new Set(instruments.map((inst) => inst.id));
    const groups = [];
    Object.entries(notesByInstrument).forEach(([instrumentId, instrumentNotes]) => {
      if (knownIds.has(instrumentId)) return;
      groups.push({
        instrumentId,
        instrumentName: instrumentNotes[0]?.instrumentName || 'Removed instrument',
        notes: instrumentNotes
      });
    });
    return groups;
  }, [instruments, notesByInstrument]);

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
        {/* Header stays ink in both themes — theme-invariant literals are intentional. */}
        <header className="bg-[#16191d] text-white px-4 md:px-6 py-3 md:py-4 flex justify-between items-center sticky top-0 z-50">
            <div className="flex items-center gap-3 min-w-0">
              <ShieldCheck className="w-5 h-5 text-white shrink-0"/>
              <div className="flex items-center gap-2.5 min-w-0">
                <h1 className="text-sm font-semibold leading-tight text-white truncate">{labName}</h1>
                <span className="ds-stamp shrink-0" style={{ backgroundColor: 'rgba(127, 184, 212, 0.15)', color: '#7fb8d4' }}>Admin</span>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <ThemeToggle variant="ink" />
              <button type="button" aria-label="Sign out from admin workspace" onClick={onLogout} className="text-white/70 hover:text-white flex items-center gap-2 text-xs font-medium shrink-0 ds-transition"><LogOut className="w-4 h-4"/> Sign out</button>
            </div>
        </header>

        <div className="p-4 md:p-6 ds-frame">
            {/* Tab navigation: underline tabs on a shared hairline baseline */}
            <div className="flex border-b border-[var(--ds-rule-strong)] mb-6" role="tablist" aria-label="Admin sections">
                <button type="button" role="tab" aria-selected={activeTab==='INSTRUMENTS'} onClick={()=>setActiveTab('INSTRUMENTS')} className={`flex-1 py-3 ds-tab flex items-center justify-center gap-2 text-xs font-semibold ${activeTab==='INSTRUMENTS'?'ds-tab-active':'ds-tab-inactive'}`}><Settings className="w-4 h-4"/> <span>Instruments</span>{hasLoadedInstruments && <span className="ds-ticket font-data">{instruments.length}</span>}</button>
                <button type="button" role="tab" aria-selected={activeTab==='NOTEBOOK'} onClick={()=>setActiveTab('NOTEBOOK')} className={`flex-1 py-3 ds-tab flex items-center justify-center gap-2 text-xs font-semibold ${activeTab==='NOTEBOOK'?'ds-tab-active':'ds-tab-inactive'}`}><Book className="w-4 h-4"/> <span>Reports</span>{hasLoadedNotes && <span className="ds-ticket font-data">{notes.length}</span>}</button>
                <button type="button" role="tab" aria-selected={activeTab==='LOGS'} onClick={()=>setActiveTab('LOGS')} className={`flex-1 py-3 ds-tab flex items-center justify-center gap-2 text-xs font-semibold ${activeTab==='LOGS'?'ds-tab-active':'ds-tab-inactive'}`}><History className="w-4 h-4"/> <span>Logs</span>{hasLoadedLogs && <span className="ds-ticket font-data">{logs.length}</span>}</button>
            </div>

            {/* 1) Instruments tab */}
            {activeTab === 'INSTRUMENTS' && (
                <div className="ds-card overflow-hidden">
                    <div className="flex justify-between items-center gap-3 px-4 md:px-5 py-3 border-b border-[var(--ds-rule)]">
                      <h2 className="text-[13px] font-semibold text-[color:var(--ds-text-strong)] flex items-center gap-2">Instruments {hasLoadedInstruments && <span className="ds-ticket font-data">{instruments.length}</span>}</h2>
                      <button type="button" onClick={()=>{setEditingInstrument(null); setShowInstrumentModal(true);}} className="ds-btn ds-btn-primary px-3 py-1.5 text-xs shrink-0"><Plus className="w-4 h-4"/> <span className="hidden sm:inline">Add instrument</span><span className="sm:hidden">Add</span></button>
                    </div>
                    <div>
                      {!hasLoadedInstruments && <div className="sr-only" role="status" aria-live="polite">Loading instruments</div>}
                      {!hasLoadedInstruments && Array.from({ length: 4 }, (_, index) => (
                        <div key={`inst-skeleton-${index}`} className="flex items-center justify-between px-4 md:px-5 py-3 border-b border-[var(--ds-rule)] last:border-b-0 animate-pulse">
                          <div>
                            <div className="h-3.5 w-36 bg-[var(--ds-surface-muted)] rounded-sm mb-2" />
                            <div className="h-3 w-20 bg-[var(--ds-surface-muted)] rounded-sm" />
                          </div>
                          <div className="flex gap-2">
                            <div className="w-8 h-8 rounded bg-[var(--ds-surface-muted)]" />
                            <div className="w-8 h-8 rounded bg-[var(--ds-surface-muted)]" />
                          </div>
                        </div>
                      ))}
                      {hasLoadedInstruments && instruments.length === 0 && (
                        <div className="p-6 text-center">
                          <h3 className="text-[13px] font-semibold text-[color:var(--ds-text-muted)]">No instruments yet</h3>
                          <p className="text-[11px] text-[color:var(--ds-text-soft)] mt-1">Create your first instrument to start taking bookings.</p>
                        </div>
                      )}
                      {hasLoadedInstruments && instruments.map(inst => (
                        <div key={inst.id} className="flex items-center justify-between gap-3 pl-3 pr-3 md:pr-4 py-3 border-b border-[var(--ds-rule)] last:border-b-0 border-l-2" style={{ borderLeftColor: getColorStyle(inst.color).accent || 'var(--ds-brand-500)' }}>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[13px] font-semibold text-[color:var(--ds-text-strong)]">{inst.name}</span>
                              {inst.isUnderMaintenance && <span className="ds-stamp ds-stamp-warning">Maint</span>}
                            </div>
                            <div className="text-[11px] text-[color:var(--ds-text-muted)] flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3"/> {inst.location || 'No location'}</div>
                            {Array.isArray(inst.subOptions) && inst.subOptions.length > 0 && (
                              <div className="text-[11px] text-[color:var(--ds-text-soft)] mt-0.5">
                                Units: {inst.subOptions.join(', ')}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-1 shrink-0">
                              <button type="button" aria-label={`Edit ${inst.name}`} onClick={()=>{setEditingInstrument(inst); setShowInstrumentModal(true);}} className="p-2 rounded text-[color:var(--ds-text-soft)] hover:text-[color:var(--ds-brand-700)] hover:bg-[var(--ds-surface-muted)] ds-transition"><Pencil className="w-4 h-4"/></button>
                              <button type="button" aria-label={`Delete ${inst.name}`} onClick={()=>handleDeleteInstrument(inst.id, inst.name)} className="p-2 rounded text-[color:var(--ds-text-soft)] hover:text-[color:var(--ds-danger-text)] hover:bg-[var(--ds-danger-bg)] ds-transition"><Trash2 className="w-4 h-4"/></button>
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
                      <h2 className="text-[13px] font-semibold text-[color:var(--ds-text-strong)] flex items-center gap-2"><Book className="w-4 h-4 text-[color:var(--ds-brand-700)]"/> Latest reports by instrument</h2>
                      <p className="text-[11px] text-[color:var(--ds-text-muted)] mt-1">Click an instrument to open its latest report, then use "See more" for older reports.</p>
                    </div>

                    {(!hasLoadedInstruments || !hasLoadedNotes) && Array.from({ length: 3 }, (_, index) => (
                      <div key={`note-skeleton-${index}`} className="ds-card p-4 animate-pulse">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="h-3.5 w-44 bg-[var(--ds-surface-muted)] rounded-sm mb-2" />
                            <div className="h-3 w-20 bg-[var(--ds-surface-muted)] rounded-sm" />
                          </div>
                          <div className="h-3 w-10 bg-[var(--ds-surface-muted)] rounded-sm" />
                        </div>
                        <div className="mt-4 h-14 bg-[var(--ds-surface-muted)] rounded-sm" />
                      </div>
                    ))}
                    {(!hasLoadedInstruments || !hasLoadedNotes) && <div className="sr-only" role="status" aria-live="polite">Loading reports</div>}

                    {hasLoadedInstruments && hasLoadedNotes && instruments.map(inst => {
                        const instrumentNotes = notesByInstrument[inst.id] || [];
                        if (instrumentNotes.length === 0) return null;
                        const isOpen = Boolean(openedInstrumentNotes[inst.id]);
                        const isExpanded = Boolean(expandedNotesByInstrument[inst.id]);
                        const visibleNotes = isExpanded ? instrumentNotes : [instrumentNotes[0]];
                        const hiddenCount = instrumentNotes.length - 1;

                        const styles = getColorStyle(inst.color);
                        return (
                            <div key={inst.id} className="ds-card p-4 border-l-2" style={{ borderLeftColor: styles.accent || 'var(--ds-brand-500)' }}>
                                <button type="button" aria-expanded={isOpen} aria-label={`${isOpen ? 'Collapse' : 'Expand'} reports for ${inst.name}`} onClick={() => toggleInstrumentPanel(inst.id)} className="w-full flex items-center justify-between gap-3 text-left">
                                  <div>
                                      <h3 className="text-[13px] font-semibold text-[color:var(--ds-text-strong)]">{inst.name}</h3>
                                      <p className="ds-microcaps text-[color:var(--ds-text-muted)] mt-0.5">{instrumentNotes.length} Reports</p>
                                  </div>
                                  <span className="text-[11px] font-semibold text-[color:var(--ds-text-muted)]">{isOpen ? 'Hide' : 'Open'}</span>
                                </button>
                                {isOpen && (
                                <div className="mt-3 border-t border-[var(--ds-rule)]">
                                    {visibleNotes.map(note => (
                                        <div key={note.id} className="py-2.5 border-b border-[var(--ds-rule)] last:border-b-0 group">
                                            <div className="flex justify-between items-start mb-1">
                                                <div className="flex items-baseline gap-2">
                                                    <span className="text-xs font-semibold text-[color:var(--ds-text-strong)]">{note.userName}</span>
                                                    <span className="text-[11px] font-data-mono text-[color:var(--ds-text-soft)]">{formatTime(note.timestamp)}</span>
                                                </div>
                                                <button type="button" aria-label={`Delete note by ${note.userName}`} onClick={() => handleDeleteNote(note)} className="p-1 text-[color:var(--ds-text-soft)] hover:text-[color:var(--ds-danger-text)] ds-transition opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"><Trash2 className="w-4 h-4"/></button>
                                            </div>
                                            <p className="text-xs text-[color:var(--ds-text)] leading-relaxed whitespace-pre-wrap">{note.message}</p>
                                        </div>
                                    ))}
                                    {instrumentNotes.length > 1 && (
                                      <button type="button" aria-expanded={isExpanded} onClick={() => toggleInstrumentNotes(inst.id)} className="mt-2 text-[11px] font-semibold text-[color:var(--ds-brand-700)] hover:underline">
                                        {isExpanded ? 'Show less' : `See ${hiddenCount} more`}
                                      </button>
                                    )}
                                </div>
                                )}
                            </div>
                        );
                    })}

                    {hasLoadedInstruments && hasLoadedNotes && orphanedNoteGroups.map((group) => {
                        const isOpen = Boolean(openedInstrumentNotes[group.instrumentId]);
                        const isExpanded = Boolean(expandedNotesByInstrument[group.instrumentId]);
                        const visibleNotes = isExpanded ? group.notes : [group.notes[0]];
                        const hiddenCount = group.notes.length - 1;
                        return (
                            <div key={group.instrumentId} className="ds-card p-4 border-l-2" style={{ borderLeftColor: 'var(--ds-rule-strong)' }}>
                                <button type="button" aria-expanded={isOpen} aria-label={`${isOpen ? 'Collapse' : 'Expand'} reports for ${group.instrumentName}`} onClick={() => toggleInstrumentPanel(group.instrumentId)} className="w-full flex items-center justify-between gap-3 text-left">
                                  <div>
                                      <h3 className="text-[13px] font-semibold text-[color:var(--ds-text-muted)] flex items-center gap-2">{group.instrumentName} <span className="ds-stamp ds-stamp-full">Removed</span></h3>
                                      <p className="ds-microcaps text-[color:var(--ds-text-muted)] mt-0.5">{group.notes.length} Reports</p>
                                  </div>
                                  <span className="text-[11px] font-semibold text-[color:var(--ds-text-muted)]">{isOpen ? 'Hide' : 'Open'}</span>
                                </button>
                                {isOpen && (
                                <div className="mt-3 border-t border-[var(--ds-rule)]">
                                    {visibleNotes.map(note => (
                                        <div key={note.id} className="py-2.5 border-b border-[var(--ds-rule)] last:border-b-0 group">
                                            <div className="flex justify-between items-start mb-1">
                                                <div className="flex items-baseline gap-2">
                                                    <span className="text-xs font-semibold text-[color:var(--ds-text-strong)]">{note.userName}</span>
                                                    <span className="text-[11px] font-data-mono text-[color:var(--ds-text-soft)]">{formatTime(note.timestamp)}</span>
                                                </div>
                                                <button type="button" aria-label={`Delete note by ${note.userName}`} onClick={() => handleDeleteNote(note)} className="p-1 text-[color:var(--ds-text-soft)] hover:text-[color:var(--ds-danger-text)] ds-transition opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"><Trash2 className="w-4 h-4"/></button>
                                            </div>
                                            <p className="text-xs text-[color:var(--ds-text)] leading-relaxed whitespace-pre-wrap">{note.message}</p>
                                        </div>
                                    ))}
                                    {group.notes.length > 1 && (
                                      <button type="button" aria-expanded={isExpanded} onClick={() => toggleInstrumentNotes(group.instrumentId)} className="mt-2 text-[11px] font-semibold text-[color:var(--ds-brand-700)] hover:underline">
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
                            <Book className="w-8 h-8 text-[color:var(--ds-text-soft)] mx-auto mb-3"/>
                            <h3 className="text-[13px] font-semibold text-[color:var(--ds-text-muted)]">No reports yet</h3>
                            <p className="text-[11px] text-[color:var(--ds-text-soft)] mt-1">All instruments are running smoothly.</p>
                        </div>
                    )}
                </div>
            )}

            {/* 3) Logs tab */}
            {activeTab === 'LOGS' && (
                <div>
                  <div className="ds-card p-4 mb-4">
                    <h2 className="text-[13px] font-semibold text-[color:var(--ds-text-strong)] flex items-center gap-2"><History className="w-4 h-4 text-[color:var(--ds-brand-700)]"/> System logs</h2>
                    <p className="text-[11px] text-[color:var(--ds-text-muted)] mt-1">Showing the last 2 months of activity.</p>
                  </div>
                  <div className="space-y-3">
                    {!hasLoadedLogs && <div className="sr-only" role="status" aria-live="polite">Loading logs</div>}
                    {!hasLoadedLogs && Array.from({ length: 2 }, (_, index) => (
                      <div key={`log-skeleton-${index}`} className="ds-card overflow-hidden animate-pulse">
                        <div className="w-full flex items-center justify-between px-4 py-3 bg-[var(--ds-surface-muted)]">
                          <div className="h-3.5 w-24 bg-[var(--ds-rule)] rounded-sm" />
                          <div className="h-3 w-16 bg-[var(--ds-rule)] rounded-sm" />
                        </div>
                        <div className="p-3 space-y-2 border-t border-[var(--ds-rule)]">
                          <div className="h-10 rounded bg-[var(--ds-surface-muted)]" />
                          <div className="h-10 rounded bg-[var(--ds-surface-muted)]" />
                        </div>
                      </div>
                    ))}
                    {hasLoadedLogs && logsByMonth.map((group) => {
                      const isOpen = Boolean(openedLogMonths[group.key]);
                      const users = bookingUsersByMonth[group.key] || [];
                      return (
                        <div key={group.key} className="ds-card overflow-hidden">
                          <button
                            type="button"
                            aria-expanded={isOpen}
                            onClick={() => toggleLogMonth(group.key)}
                            className="w-full flex items-center justify-between px-4 py-3 bg-[var(--ds-surface-muted)] hover:bg-[var(--ds-full-bg)] ds-transition"
                          >
                            <div className="flex items-center gap-2">
                              {isOpen ? <ChevronDown className="w-4 h-4 text-[color:var(--ds-text-soft)]"/> : <ChevronRight className="w-4 h-4 text-[color:var(--ds-text-soft)]"/>}
                              <span className="text-xs font-semibold font-data-mono text-[color:var(--ds-text-strong)]">{group.label}</span>
                            </div>
                            <span className="text-[11px] text-[color:var(--ds-text-soft)] font-data tabular-nums">{users.length} people</span>
                          </button>
                          {isOpen && (
                            <div className="p-3 space-y-2 border-t border-[var(--ds-rule)]">
                              {users.map(([userName, userLogs]) => {
                                const openKey = `${group.key}::${userName}`;
                                const isUserOpen = Boolean(openedLogUsers[openKey]);
                                const isShowAll = Boolean(showAllUserLogs[openKey]);
                                const visibleLogs = isShowAll ? userLogs : userLogs.slice(0, 10);
                                return (
                                  <div key={openKey} className="border border-[var(--ds-rule)] rounded overflow-hidden">
                                    <button
                                      type="button"
                                      aria-expanded={isUserOpen}
                                      onClick={() => toggleLogUser(group.key, userName)}
                                      className="w-full px-3 py-2 bg-[var(--ds-surface-muted)] hover:bg-[var(--ds-full-bg)] ds-transition flex items-center justify-between"
                                    >
                                      <div className="flex items-center gap-2">
                                        {isUserOpen ? <ChevronDown className="w-4 h-4 text-[color:var(--ds-text-soft)]"/> : <ChevronRight className="w-4 h-4 text-[color:var(--ds-text-soft)]"/>}
                                        <span className="text-xs font-semibold text-[color:var(--ds-text-strong)]">{userName}</span>
                                      </div>
                                      <span className="text-[11px] text-[color:var(--ds-text-soft)] font-data tabular-nums">{userLogs.length} booking logs</span>
                                    </button>
                                    {isUserOpen && (
                                      <div className="divide-y divide-[var(--ds-rule)] border-t border-[var(--ds-rule)]">
                                        {visibleLogs.map((log) => (
                                          <div key={log.id} className="px-3 py-2 grid grid-cols-[88px_auto_1fr] gap-2 items-start hover:bg-[var(--ds-surface-muted)]">
                                            <div className="text-[11px] font-data-mono text-[color:var(--ds-text-soft)]">{formatTime(log.timestamp)}</div>
                                            <div>
                                              <span className={`ds-stamp ${(log.action || '').includes('CANCEL') ? 'bg-[var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]' : 'ds-stamp-full'}`}>
                                                {log.action || 'LOG'}
                                              </span>
                                            </div>
                                            <div className="text-xs text-[color:var(--ds-text)]">{log.message}</div>
                                          </div>
                                        ))}
                                        {userLogs.length > 10 && (
                                          <button
                                            type="button"
                                            aria-expanded={isShowAll}
                                            onClick={() => toggleShowAllLogsForUser(group.key, userName)}
                                            className="w-full text-left px-3 py-2 text-[11px] font-semibold text-[color:var(--ds-brand-700)] hover:bg-[var(--ds-brand-100)] ds-transition"
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
                                <div className="text-[11px] text-[color:var(--ds-text-soft)] bg-[var(--ds-surface-muted)] border border-[var(--ds-rule)] rounded p-4 text-center">
                                  No booking activity this month.
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {hasLoadedLogs && logsByMonth.length === 0 && (
                      <div className="ds-card p-6 text-center text-xs text-[color:var(--ds-text-muted)]">No recent logs.</div>
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
          message={instrumentToDelete ? `This will remove "${instrumentToDelete.name}" from the lab, including all of its bookings and reports.` : ''}
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
