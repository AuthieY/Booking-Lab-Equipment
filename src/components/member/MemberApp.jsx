import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  collection, query, where, onSnapshot, deleteDoc, doc, serverTimestamp, writeBatch, getDocs, addDoc
} from 'firebase/firestore';
import { 
  ShieldCheck, LogOut, LayoutGrid, ChevronRight, ChevronLeft,
  CalendarDays, MapPin, StickyNote, ShieldAlert
} from 'lucide-react';
import { auth, db, appId, addAuditLog } from '../../api/firebase';
import { getFormattedDate, addDays, getMonday, getColorStyle } from '../../utils/helpers';
import NoteModal from '../modals/NoteModal';
import BookingModal from '../modals/BookingModal';
import InstrumentSelectionModal from '../modals/InstrumentSelectionModal';

const MemberApp = ({ labName, userName, onLogout }) => {
  const [viewMode, setViewMode] = useState('day');
  const [date, setDate] = useState(new Date());
  const [selectedInstrumentId, setSelectedInstrumentId] = useState(null); 
  const [overviewInstrumentIds, setOverviewInstrumentIds] = useState([]);
  const [pinnedInstrumentIds, setPinnedInstrumentIds] = useState([]);
  const [hasHydratedPinned, setHasHydratedPinned] = useState(false);
  const [hasLoadedInstruments, setHasLoadedInstruments] = useState(false);
  const [hasLoadedBookings, setHasLoadedBookings] = useState(false);
  const [showSelectionModal, setShowSelectionModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [instruments, setInstruments] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [bookingToDelete, setBookingToDelete] = useState(null);
  const [bookingModal, setBookingModal] = useState({ isOpen: false, date: '', hour: 0, instrument: null });
  const [isBookingProcess, setIsBookingProcess] = useState(false);
  const [slotDetails, setSlotDetails] = useState({
    isOpen: false,
    instrument: null,
    dateStr: '',
    hour: 0,
    slots: [],
    isBlocked: false,
    blockLabel: '',
    totalUsed: 0,
    canBook: false
  });
  
  const scrollTargetRef = useRef(null);
  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const selectedDateStr = useMemo(() => getFormattedDate(date), [date]);
  const isToday = useMemo(() => getFormattedDate(new Date()) === selectedDateStr, [selectedDateStr]);
  const currentHour = new Date().getHours();

  const formatHour = (hour) => `${String(hour).padStart(2, '0')}:00`;
  const getSlotKey = (dateStr, hour) => `${dateStr}|${hour}`;
  const getInstSlotKey = (instrumentId, dateStr, hour) => `${instrumentId}|${dateStr}|${hour}`;
  const rowHeightClass = 'h-12 md:h-14';
  const getHourBandClass = (hour) => (hour % 2 === 0 ? 'bg-white' : 'bg-slate-50/35');
  const isWorkingHour = (hour) => hour >= 9 && hour < 17;
  const getTimeLabelClass = (hour) => `${rowHeightClass} text-[10px] text-right pr-2 pt-1.5 border-b border-slate-200/80 font-semibold font-data tabular-nums tracking-tight ${getHourBandClass(hour)} ${isToday && hour === currentHour ? 'bg-[#eef8fd] text-[#00407a]' : isWorkingHour(hour) ? 'text-slate-500' : 'text-slate-400'}`;
  const getSlotCellClass = ({ hour, isBlocked, isMine, totalUsed }) => (
    `${rowHeightClass} border-b border-slate-200/80 px-1 py-0.5 transition-colors relative ${isBlocked ? 'bg-slate-200/45 cursor-not-allowed' : isMine ? 'bg-[#e6f3fb] border-l-2 border-[#1c7aa0] cursor-pointer' : totalUsed > 0 ? `${getHourBandClass(hour)} cursor-pointer` : `${getHourBandClass(hour)} hover:bg-slate-100/80 cursor-pointer`} ${isWorkingHour(hour) ? 'after:absolute after:inset-x-0 after:bottom-0 after:h-[1px] after:bg-emerald-200/45' : ''} ${isToday && hour === currentHour ? 'ring-1 ring-inset ring-[#52bdec]/70' : ''}`
  );
  const sortSlotsForDisplay = (slots = []) => (
    [...slots].sort((a, b) => {
      const am = a.userName === userName ? 0 : 1;
      const bm = b.userName === userName ? 0 : 1;
      if (am !== bm) return am - bm;
      return (a.userName || '').localeCompare(b.userName || '');
    })
  );
  const getPrimarySlot = (slots = []) => sortSlotsForDisplay(slots)[0] || null;
  const getOverflowCount = (slots = []) => Math.max(0, slots.length - 1);

  const openSlotDetails = ({ instrument, dateStr, hour, slots, isBlocked, blockLabel, totalUsed }) => {
    const orderedSlots = sortSlotsForDisplay(slots);
    setSlotDetails({
      isOpen: true,
      instrument,
      dateStr,
      hour,
      slots: orderedSlots,
      isBlocked,
      blockLabel: blockLabel || '',
      totalUsed,
      canBook: !isBlocked && totalUsed < (instrument?.maxCapacity || 1)
    });
  };

  const closeSlotDetails = () => {
    setSlotDetails((prev) => ({ ...prev, isOpen: false }));
  };

  useEffect(() => {
    const hasOverviewSelection = !selectedInstrumentId && overviewInstrumentIds.length > 0;
    const hasSingleSelection = Boolean(selectedInstrumentId);
    if (!hasLoadedInstruments || !hasLoadedBookings) return;
    if (!hasOverviewSelection && !hasSingleSelection) return;

    const timer = setTimeout(() => {
      if (scrollTargetRef.current) {
        scrollTargetRef.current.scrollIntoView({ behavior: 'auto', block: 'start' });
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [selectedInstrumentId, viewMode, overviewInstrumentIds, hasLoadedInstruments, hasLoadedBookings]);

  useEffect(() => {
    const hasOverlayOpen = slotDetails.isOpen || Boolean(bookingToDelete);
    if (!hasOverlayOpen) return;
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      if (slotDetails.isOpen) {
        setSlotDetails((prev) => (prev.isOpen ? { ...prev, isOpen: false } : prev));
      }
      if (bookingToDelete) setBookingToDelete(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [slotDetails.isOpen, bookingToDelete]);

  useEffect(() => {
    setHasLoadedInstruments(false);
    setHasLoadedBookings(false);
    const unsubInst = onSnapshot(query(collection(db, 'artifacts', appId, 'public', 'data', 'instruments'), where('labName', '==', labName)), (s) => {
      setInstruments(s.docs.map(d => ({ id: d.id, ...d.data() })));
      setHasLoadedInstruments(true);
    });
    const unsubBook = onSnapshot(query(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'), where('labName', '==', labName)), (s) => {
      setBookings(s.docs.map(d => ({ id: d.id, ...d.data() })));
      setHasLoadedBookings(true);
    });
    return () => { unsubInst(); unsubBook(); };
  }, [labName]);

  useEffect(() => {
    setHasHydratedPinned(false);
    try {
      const key = `booking_pinned_instruments:${labName}:${userName}`;
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      setPinnedInstrumentIds(Array.isArray(parsed) ? parsed : []);
    } catch (_) {
      setPinnedInstrumentIds([]);
    } finally {
      setHasHydratedPinned(true);
    }
  }, [labName, userName]);

  useEffect(() => {
    if (!hasHydratedPinned) return;
    try {
      const key = `booking_pinned_instruments:${labName}:${userName}`;
      localStorage.setItem(key, JSON.stringify(pinnedInstrumentIds));
    } catch (_) {
      // Ignore storage errors in private mode / restricted environments.
    }
  }, [labName, userName, pinnedInstrumentIds, hasHydratedPinned]);

  useEffect(() => {
    if (!hasLoadedInstruments || !hasHydratedPinned) return;
    const validIds = new Set(instruments.map((i) => i.id));
    setOverviewInstrumentIds((prev) => prev.filter((id) => validIds.has(id)));
    setPinnedInstrumentIds((prev) => prev.filter((id) => validIds.has(id)));

    if (selectedInstrumentId && !validIds.has(selectedInstrumentId)) {
      setSelectedInstrumentId(null);
    }
  }, [instruments, hasLoadedInstruments, hasHydratedPinned]);

  const bookingsBySlot = useMemo(() => {
    const map = new Map();
    bookings.forEach((b) => {
      const key = getSlotKey(b.date, b.hour);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(b);
    });
    return map;
  }, [bookings]);

  const bookingsByInstrumentSlot = useMemo(() => {
    const map = new Map();
    bookings.forEach((b) => {
      const key = getInstSlotKey(b.instrumentId, b.date, b.hour);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(b);
    });
    return map;
  }, [bookings]);

  const conflictIdsByInstrument = useMemo(() => {
    const map = {};
    instruments.forEach((inst) => {
      const ids = new Set(inst.conflicts || []);
      instruments.forEach((other) => {
        if (other.id !== inst.id && (other.conflicts || []).includes(inst.id)) ids.add(other.id);
      });
      map[inst.id] = ids;
    });
    return map;
  }, [instruments]);

  const getBlockingBookings = (instrumentId, dateStr, hour) => {
    const enemyIds = conflictIdsByInstrument[instrumentId];
    if (!enemyIds || enemyIds.size === 0) return [];
    const sameSlotBookings = bookingsBySlot.get(getSlotKey(dateStr, hour)) || [];
    return sameSlotBookings.filter((b) => enemyIds.has(b.instrumentId));
  };

  const buildBookingSlots = ({ startDateStr, startHour, repeatCount, isFullDay, isOvernight, isWorkingHours }) => {
    const newSlots = [];
    const targetDates = [];

    for (let i = 0; i <= repeatCount; i++) {
      const d = new Date(startDateStr);
      d.setDate(d.getDate() + (i * 7));
      targetDates.push(getFormattedDate(d));
    }

    targetDates.forEach((dStr) => {
      if (isFullDay) {
        for (let h = 0; h < 24; h++) newSlots.push({ date: dStr, hour: h });
      } else if (isWorkingHours) {
        for (let h = 9; h < 17; h++) newSlots.push({ date: dStr, hour: h });
      } else if (isOvernight) {
        for (let h = 17; h <= 23; h++) newSlots.push({ date: dStr, hour: h });
        const nextDayStr = getFormattedDate(addDays(new Date(dStr), 1));
        for (let h = 0; h <= 8; h++) newSlots.push({ date: nextDayStr, hour: h });
      } else {
        newSlots.push({ date: dStr, hour: startHour });
      }
    });

    return newSlots;
  };

  const getBlockingDetails = (blockingBookings = []) => {
    const instrumentNames = [...new Set(blockingBookings.map((b) => b.instrumentName || 'Unknown instrument'))].sort();
    const userNames = [...new Set(blockingBookings.map((b) => b.userName || 'Unknown user'))].sort();
    const instrumentsText = instrumentNames.join(' & ');
    const usersText = userNames.join(' & ');
    return {
      instrumentsText,
      usersText,
      signature: `${instrumentsText}||${usersText}`,
      labelPrefix: `Conflict: ${instrumentsText} booked by ${usersText}`
    };
  };

  const findConflicts = ({ instrument, requestedQty, slots }) => {
    const conflicts = [];

    slots.forEach((slot) => {
      const ownBookings = bookingsByInstrumentSlot.get(getInstSlotKey(instrument.id, slot.date, slot.hour)) || [];
      const currentLoad = ownBookings.reduce((sum, b) => sum + (Number(b.requestedQuantity) || 1), 0);
      const blockingBookings = getBlockingBookings(instrument.id, slot.date, slot.hour);

      if (currentLoad + Number(requestedQty) > (instrument.maxCapacity || 1)) {
        conflicts.push(`${slot.date} ${formatHour(slot.hour)} (Full)`);
      }
      if (blockingBookings.length > 0) {
        const blockingDetails = getBlockingDetails(blockingBookings);
        conflicts.push(`${slot.date} ${formatHour(slot.hour)} (${blockingDetails.labelPrefix})`);
      }
    });

    return conflicts;
  };

  const getBlockingHintsForDate = (instrumentId, dateStr) => {
    const hints = {};
    let hour = 0;

    while (hour < 24) {
      const startBlockers = getBlockingBookings(instrumentId, dateStr, hour);
      const startDetails = getBlockingDetails(startBlockers);

      if (!startDetails.instrumentsText) {
        hour += 1;
        continue;
      }

      const signature = startDetails.signature;
      const start = hour;
      let end = hour + 1;

      while (end < 24) {
        const nextBlockers = getBlockingBookings(instrumentId, dateStr, end);
        const nextDetails = getBlockingDetails(nextBlockers);
        if (nextDetails.signature !== signature) break;
        end += 1;
      }

      const label = startDetails.labelPrefix;
      for (let h = start; h < end; h++) hints[h] = { label, isStart: h === start };
      hour = end;
    }

    return hints;
  };

  const blockingHintsByInstrumentForDate = useMemo(() => {
    const map = {};
    instruments.forEach((inst) => {
      map[inst.id] = getBlockingHintsForDate(inst.id, selectedDateStr);
    });
    return map;
  }, [instruments, selectedDateStr, bookingsBySlot, conflictIdsByInstrument]);

  const handleConfirmBooking = async (repeatCount, isFullDay, subOption, isOvernight, isWorkingHours, requestedQty) => {
    if (!bookingModal.instrument) return;
    setIsBookingProcess(true);
    const { date: startDateStr, hour: startHour, instrument } = bookingModal; 
    const batch = writeBatch(db); 
    const newSlots = buildBookingSlots({ startDateStr, startHour, repeatCount, isFullDay, isOvernight, isWorkingHours });
    const bookingGroupId = (isFullDay || isOvernight || isWorkingHours || repeatCount > 0) ? `GRP-${Date.now()}-${Math.random().toString(36).substr(2,4)}` : null;
    const conflicts = findConflicts({ instrument, requestedQty, slots: newSlots });

    if (conflicts.length > 0) { alert(`Conflict at: ${conflicts[0]}`); setIsBookingProcess(false); return; }
    
    try {
      newSlots.forEach(slot => {
        batch.set(doc(collection(db, 'artifacts', appId, 'public', 'data', 'bookings')), {
          labName, instrumentId: instrument.id, instrumentName: instrument.name, date: slot.date, hour: slot.hour, 
          userName, authUid: auth.currentUser.uid, requestedQuantity: Number(requestedQty), bookingGroupId, createdAt: serverTimestamp()
        });
      });
      await batch.commit(); 
      await addAuditLog(labName, 'BOOKING', `Booked: ${instrument.name} (${requestedQty} qty)`, userName);
      setBookingModal({ ...bookingModal, isOpen: false });
    } catch (e) { alert("Booking failed. Please try again."); } finally { setIsBookingProcess(false); }
  };
  
  const handleDeleteBooking = async () => { 
    if(!bookingToDelete) return; 
    const batch = writeBatch(db);
    try {
      if (bookingToDelete.bookingGroupId) {
        const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'), where('bookingGroupId', '==', bookingToDelete.bookingGroupId));
        const snap = await getDocs(q);
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
        await addAuditLog(labName, 'CANCEL_BATCH', `Batch cancel: ${bookingToDelete.instrumentName}`, userName);
      } else {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bookings', bookingToDelete.id));
        await addAuditLog(labName, 'CANCEL', `Cancelled: ${bookingToDelete.instrumentName}`, userName);
      }
      setBookingToDelete(null); 
    } catch (e) { alert("Unable to cancel booking. Please try again."); }
  };

  const handleSaveNote = async (msg) => {
    const inst = instruments.find(i => i.id === selectedInstrumentId);
    if (!inst) return;
    try {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'notes'), { labName, instrumentId: inst.id, instrumentName: inst.name, userName, message: msg, timestamp: serverTimestamp() });
        setShowNoteModal(false); alert("Report sent.");
    } catch (e) { alert("Unable to send report. Please try again."); }
  };

  const weekDays = useMemo(() => { const m = getMonday(date); return Array.from({ length: 7 }, (_, i) => { const d = new Date(m); d.setDate(m.getDate() + i); return d; }); }, [date]);
  const overviewInstruments = useMemo(() => {
    const pinnedSet = new Set(pinnedInstrumentIds);
    return instruments
      .filter((inst) => overviewInstrumentIds.includes(inst.id))
      .sort((a, b) => {
        const ap = pinnedSet.has(a.id) ? 0 : 1;
        const bp = pinnedSet.has(b.id) ? 0 : 1;
        if (ap !== bp) return ap - bp;
        return a.name.localeCompare(b.name);
      });
  }, [instruments, overviewInstrumentIds, pinnedInstrumentIds]);
  const currentInst = instruments.find(i => i.id === selectedInstrumentId);
  const overviewLabel = useMemo(() => {
    if (!hasLoadedInstruments) return 'Loading...';
    if (currentInst) return currentInst.name;
    if (overviewInstruments.length === 0) return 'Select instruments';
    if (overviewInstruments.length === instruments.length) return 'Overview';
    return `Overview (${overviewInstruments.length})`;
  }, [currentInst, overviewInstruments.length, instruments.length, hasLoadedInstruments]);
  const selectionSummaryLabel = useMemo(() => {
    if (!hasLoadedInstruments) return 'Loading instruments...';
    if (selectedInstrumentId && currentInst) return 'Single instrument calendar';
    if (overviewInstruments.length === 0) return 'Choose instruments to display';
    if (overviewInstruments.length === instruments.length) return 'All instruments in overview';
    return `${overviewInstruments.length} instrument${overviewInstruments.length > 1 ? 's' : ''} selected`;
  }, [selectedInstrumentId, currentInst, overviewInstruments.length, instruments.length, hasLoadedInstruments]);
  const dateNavigationLabel = useMemo(() => {
    if (viewMode === 'day' || !selectedInstrumentId) {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return `${weekDays[0].getMonth() + 1}/${weekDays[0].getDate()} - ${weekDays[6].getMonth() + 1}/${weekDays[6].getDate()}`;
  }, [date, weekDays, viewMode, selectedInstrumentId]);

  const handleApplySelection = (ids) => {
    const nextIds = ids || [];
    setOverviewInstrumentIds(nextIds);
    setSelectedInstrumentId(nextIds.length === 1 ? nextIds[0] : null);
    setShowSelectionModal(false);
  };

  const handleTogglePinnedInstrument = (instrumentId) => {
    setPinnedInstrumentIds((prev) => (
      prev.includes(instrumentId)
        ? prev.filter((id) => id !== instrumentId)
        : [instrumentId, ...prev]
    ));
  };

  const isCalendarLoading = !hasLoadedInstruments || !hasLoadedBookings;
  const skeletonColumns = selectedInstrumentId ? (viewMode === 'week' ? 7 : 1) : Math.max(overviewInstruments.length, 4);
  const skeletonRows = 12;
  const handleKeyboardActivation = (event, action) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      action();
    }
  };
  const getSlotAriaLabel = ({
    instrumentName,
    dateStr,
    hour,
    totalUsed,
    maxCapacity,
    isMine,
    isBlocked,
    blockLabel,
    primarySlot,
    overflowCount
  }) => {
    const timeLabel = `${formatHour(hour)} on ${dateStr}`;
    if (isBlocked) {
      return `${instrumentName}, ${timeLabel}. Blocked by conflict. ${blockLabel || 'Conflict detected.'}`;
    }
    if (isMine) {
      return `${instrumentName}, ${timeLabel}. You have a booking. Activate to manage or cancel it.`;
    }
    if (totalUsed >= maxCapacity) {
      return `${instrumentName}, ${timeLabel}. Fully booked, ${totalUsed} of ${maxCapacity} units used.`;
    }
    if (totalUsed > 0) {
      const primaryText = primarySlot?.userName ? `Booked by ${primarySlot.userName}.` : '';
      const overflowText = overflowCount > 0 ? `${overflowCount} more booking${overflowCount > 1 ? 's' : ''}.` : '';
      return `${instrumentName}, ${timeLabel}. ${totalUsed} of ${maxCapacity} units used. ${primaryText} ${overflowText} Activate to book if capacity remains.`.trim();
    }
    return `${instrumentName}, ${timeLabel}. Available. Activate to book.`;
  };

  return (
    <div className="flex flex-col h-screen ds-page font-sans text-slate-900 overflow-hidden text-sm">
      <div className="flex-none z-50 bg-white/95 backdrop-blur border-b border-[var(--ds-border)] shadow-sm">
          <header className="px-4 pt-3 pb-2 border-b border-slate-200/80">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.12em] font-bold text-slate-400">Lab workspace</div>
                <h1 className="font-black text-lg leading-tight text-[var(--ds-text-strong)] truncate">{labName}</h1>
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  <span className="ds-chip ds-chip-brand text-[11px]">
                    <ShieldCheck className="w-3 h-3" /> {userName}
                  </span>
                  {selectedInstrumentId && currentInst && (
                    <span className="ds-chip text-[11px] bg-slate-100 text-slate-600">
                      Focused: {currentInst.name}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={onLogout}
                aria-label="Log out"
                className="p-2.5 text-slate-500 bg-slate-100 rounded-full ds-transition hover:bg-slate-200"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </header>
          <div className="px-4 py-3 border-b border-slate-200/80 bg-slate-50/70">
              <div className="text-[10px] uppercase tracking-[0.12em] font-bold text-slate-400 mb-1.5">View scope</div>
              <button type="button" onClick={() => setShowSelectionModal(true)} aria-label="Open instrument selection" className="w-full p-3 ds-btn ds-btn-primary flex justify-between items-center">
                 <div className="flex items-center gap-2.5 min-w-0">
                   <span className="w-7 h-7 rounded-lg bg-white/20 border border-white/20 flex items-center justify-center shrink-0">
                     <LayoutGrid className="w-4 h-4" />
                   </span>
                   <div className="min-w-0 text-left">
                     <div className="font-bold leading-tight truncate">{overviewLabel}</div>
                     <div className="text-[11px] font-medium text-blue-100/95 truncate">{selectionSummaryLabel}</div>
                   </div>
                 </div>
                 <ChevronRight className="w-5 h-5 opacity-70 shrink-0" />
              </button>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-200/80">
             {selectedInstrumentId ? (
               <div className="flex bg-slate-100 rounded-lg p-1">
                 <button type="button" aria-label="Switch to day view" aria-pressed={viewMode === 'day'} onClick={()=>setViewMode('day')} className={`px-2.5 py-1.5 rounded-md text-xs font-bold ds-transition ${viewMode==='day'?'bg-white text-[#00407a]':'text-slate-500 hover:text-slate-700'}`}><LayoutGrid className="w-4 h-4"/></button>
                 <button type="button" aria-label="Switch to week view" aria-pressed={viewMode === 'week'} onClick={()=>setViewMode('week')} className={`px-2.5 py-1.5 rounded-md text-xs font-bold ds-transition ${viewMode==='week'?'bg-white text-[#00407a]':'text-slate-500 hover:text-slate-700'}`}><CalendarDays className="w-4 h-4"/></button>
               </div>
             ) : (
               <div className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                 Overview
               </div>
             )}
             <div className="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-1.5 py-1">
                <button type="button" aria-label={(viewMode === 'day' || !selectedInstrumentId) ? 'Go to previous day' : 'Go to previous week'} onClick={() => setDate(addDays(date, (viewMode === 'day' || !selectedInstrumentId) ? -1 : -7))} className="p-1 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-200/70 ds-transition"><ChevronLeft/></button>
                <span className="min-w-[7.5rem] text-center text-sm font-bold text-slate-700 font-data tabular-nums tracking-tight">
                  {dateNavigationLabel}
                </span>
                <button type="button" aria-label={(viewMode === 'day' || !selectedInstrumentId) ? 'Go to next day' : 'Go to next week'} onClick={() => setDate(addDays(date, (viewMode === 'day' || !selectedInstrumentId) ? 1 : 7))} className="p-1 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-200/70 ds-transition"><ChevronRight/></button>
             </div>
          </div>
          {selectedInstrumentId && currentInst && (
             <div className="px-4 py-2 bg-slate-50/90 text-xs text-slate-500 flex items-center gap-2 border-b border-slate-200">
                <span className="inline-flex items-center gap-1.5 min-w-0 text-slate-600">
                  <MapPin className="w-3 h-3 shrink-0"/>
                  <span className="truncate">{currentInst.location || 'No location'}</span>
                </span>
                {currentInst.isUnderMaintenance && <span className="ds-chip ds-chip-warning text-[10px]">Maintenance</span>}
                <button type="button" onClick={()=>setShowNoteModal(true)} aria-label={`Report an issue for ${currentInst.name}`} className="ml-auto ds-btn ds-btn-warning px-2.5 py-1 text-[11px]"><StickyNote className="w-3 h-3"/> Report issue</button>
             </div>
          )}
      </div>

      <div className={`flex-1 relative ${selectedInstrumentId && viewMode === 'week' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        {isCalendarLoading && (
          <div className="border-y border-slate-200/80 bg-white animate-pulse" role="status" aria-live="polite" aria-label="Loading calendar">
            <div className="h-9 md:h-10 border-b border-slate-200/80 bg-slate-100/80" />
            <div className="flex min-w-max">
              <div className="w-14 md:w-16 bg-slate-50 border-r border-slate-200/80">
                {Array.from({ length: skeletonRows }, (_, rowIndex) => (
                  <div key={`skeleton-time-${rowIndex}`} className={`${rowHeightClass} border-b border-slate-200/80 px-2 py-2`}>
                    <div className="h-2.5 bg-slate-200 rounded w-8 ml-auto" />
                  </div>
                ))}
              </div>
              <div className="flex">
                {Array.from({ length: skeletonColumns }, (_, colIndex) => (
                  <div key={`skeleton-col-${colIndex}`} className="w-[5.5rem] md:w-24 border-r border-slate-200/80">
                    <div className="h-9 md:h-10 border-b border-slate-200/80 bg-slate-100/70 px-2 py-2">
                      <div className="h-2.5 bg-slate-200 rounded w-3/4 mx-auto" />
                    </div>
                    {Array.from({ length: skeletonRows }, (_, rowIndex) => (
                      <div key={`skeleton-cell-${colIndex}-${rowIndex}`} className={`${rowHeightClass} border-b border-slate-200/80 px-1 py-1`}>
                        <div className="h-3 bg-slate-100 rounded w-5/6 mx-auto" />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* VIEW A: OVERVIEW (MATRIX VIEW) */}
        {!isCalendarLoading && !selectedInstrumentId && overviewInstruments.length === 0 && (
           <div className="h-full flex items-center justify-center p-6">
             <div className="w-full max-w-md ds-card p-6 text-center">
               <h3 className="text-lg font-black text-[var(--ds-text-strong)]">
                 {instruments.length === 0 ? 'No instruments available yet' : 'Choose instruments for your view'}
               </h3>
               <p className="text-sm text-[var(--ds-text-muted)] mt-2">
                 {instruments.length === 0
                   ? 'No instrument has been added yet. Ask an admin to create instruments first.'
                   : 'Start by selecting the instruments you want to display.'}
               </p>
               {instruments.length > 0 && (
                 <button
                   type="button"
                   onClick={() => setShowSelectionModal(true)}
                   className="mt-5 w-full py-3 ds-btn ds-btn-primary"
                 >
                   Select instruments
                 </button>
               )}
             </div>
           </div>
        )}

        {!isCalendarLoading && !selectedInstrumentId && overviewInstruments.length > 0 && (
           <div className="flex min-w-max border-y border-slate-200/80 bg-white">
               <div className="w-14 md:w-16 bg-slate-50/95 backdrop-blur border-r sticky left-0 z-20">
                 <div className="h-9 md:h-10 border-b border-slate-200/80 bg-slate-100/90"></div>
                 {hours.map(h => (
                   <div
                     key={h}
                     ref={h === 8 ? scrollTargetRef : null}
                     className={getTimeLabelClass(h)}
                   >
                     <span className={`${isWorkingHour(h) ? 'font-bold' : ''}`}>{h}:00</span>
                   </div>
                 ))}
               </div>
               <div className="flex">
                 {overviewInstruments.map(inst => (
                 <div key={inst.id} className="w-[5.5rem] md:w-24 border-r border-slate-200/80">
                   <div className={`h-9 md:h-10 flex items-center justify-center text-[9px] md:text-[10px] font-bold sticky top-0 z-10 border-b border-slate-200/80 px-1 text-center whitespace-normal leading-tight ${getColorStyle(inst.color).bg} ${getColorStyle(inst.color).text}`}>{inst.name}</div>
                   {hours.map(h => {
                     const slots = bookingsByInstrumentSlot.get(getInstSlotKey(inst.id, selectedDateStr, h)) || [];
                     const totalUsed = slots.reduce((s, b) => s + (Number(b.requestedQuantity) || 1), 0);
                     const isMine = slots.some(s => s.userName === userName);
                     const primarySlot = getPrimarySlot(slots);
                     const overflowCount = getOverflowCount(slots);
                     const blockHint = blockingHintsByInstrumentForDate[inst.id]?.[h];
                     const isBlocked = Boolean(blockHint) && !isMine;
                     const handleActivateSlot = () => {
                       if (isMine) setBookingToDelete(slots.find(s => s.userName === userName));
                       else if (isBlocked) return;
                       else if (totalUsed >= (inst.maxCapacity || 1)) alert("This slot is fully booked.");
                       else setBookingModal({ isOpen: true, date: selectedDateStr, hour: h, instrument: inst });
                     };
                     const slotAriaLabel = getSlotAriaLabel({
                       instrumentName: inst.name,
                       dateStr: selectedDateStr,
                       hour: h,
                       totalUsed,
                       maxCapacity: inst.maxCapacity || 1,
                       isMine,
                       isBlocked,
                       blockLabel: blockHint?.label,
                       primarySlot,
                       overflowCount
                     });
                     return (
                       <div
                         key={h}
                         onClick={handleActivateSlot}
                         onKeyDown={(event) => handleKeyboardActivation(event, handleActivateSlot)}
                         role="button"
                         tabIndex={0}
                         aria-label={slotAriaLabel}
                         className={getSlotCellClass({ hour: h, isBlocked, isMine, totalUsed })}
                       >
                         {isBlocked && blockHint?.isStart && (
                           <button
                             type="button"
                             title={blockHint.label}
                             aria-label={`View conflict details for ${inst.name} at ${formatHour(h)}`}
                             onClick={(e) => {
                               e.stopPropagation();
                               openSlotDetails({
                                 instrument: inst,
                                 dateStr: selectedDateStr,
                                 hour: h,
                                 slots,
                                 isBlocked,
                                 blockLabel: blockHint.label,
                                 totalUsed
                               });
                             }}
                             className="text-[7px] leading-snug text-slate-500 bg-white/70 rounded px-1 py-0.5 mb-1 font-semibold"
                           >
                             Conflict
                           </button>
                         )}
                         {primarySlot && (
                           <div className={`text-[8px] mb-0.5 px-1 py-0.5 rounded truncate font-medium ${primarySlot.userName === userName ? 'bg-[#0f6f9f] text-white' : 'bg-slate-200/85 text-slate-600'}`}>
                             {primarySlot.userName}
                           </div>
                         )}
                         {overflowCount > 0 && (
                           <button
                             type="button"
                             aria-label={`View all bookings for ${inst.name} at ${formatHour(h)}`}
                             onClick={(e) => {
                               e.stopPropagation();
                               openSlotDetails({
                                 instrument: inst,
                                 dateStr: selectedDateStr,
                                 hour: h,
                                 slots,
                                 isBlocked,
                                 blockLabel: blockHint?.label || '',
                                 totalUsed
                               });
                             }}
                             className="text-[7px] px-1 py-0.5 rounded bg-slate-100 text-slate-500 font-semibold"
                           >
                             +{overflowCount} more
                           </button>
                         )}
                         {totalUsed > 0 && <div className="text-[7px] text-slate-300 mt-auto font-data tabular-nums">{totalUsed}/{inst.maxCapacity || 1}</div>}
                       </div>
                     );
                   })}
                 </div>
               ))}
               </div>
           </div>
        )}
        
        {/* VIEW B: SINGLE DAY VIEW */}
        {!isCalendarLoading && selectedInstrumentId && viewMode === 'day' && (
            <div className="border-y border-slate-200/80 bg-white">
              <div className="h-7 md:h-8 border-b border-slate-200/80 text-[9px] md:text-[10px] font-bold flex items-center px-4 bg-[#e6f3fb] text-[#00407a]">
                {currentInst?.name}
              </div>
              <div className="flex min-w-max">
                <div className="w-14 md:w-16 bg-slate-50/95 backdrop-blur border-r sticky left-0 z-20">
                  {hours.map(h => (
                    <div key={h} ref={h === 8 ? scrollTargetRef : null} className={getTimeLabelClass(h)}>
                      <span className={`${isWorkingHour(h) ? 'font-bold' : ''}`}>{h}:00</span>
                    </div>
                  ))}
                </div>
                <div className="flex-1">
              {hours.map(h => { 
                const slots = bookingsByInstrumentSlot.get(getInstSlotKey(selectedInstrumentId, selectedDateStr, h)) || [];
                const totalUsed = slots.reduce((s, b) => s + (Number(b.requestedQuantity) || 1), 0);
                const isMine = slots.some(s => s.userName === userName);
                const primarySlot = getPrimarySlot(slots);
                const overflowCount = getOverflowCount(slots);
                const blockHint = blockingHintsByInstrumentForDate[selectedInstrumentId]?.[h];
                const isBlocked = Boolean(blockHint) && !isMine;
                const handleActivateSlot = () => {
                  if (isMine) setBookingToDelete(slots.find(s=>s.userName===userName));
                  else if (isBlocked) return;
                  else if (totalUsed >= (currentInst.maxCapacity || 1)) alert("This slot is fully booked.");
                  else setBookingModal({ isOpen: true, date: selectedDateStr, hour:h, instrument: currentInst });
                };
                const slotAriaLabel = getSlotAriaLabel({
                  instrumentName: currentInst?.name || 'Instrument',
                  dateStr: selectedDateStr,
                  hour: h,
                  totalUsed,
                  maxCapacity: currentInst?.maxCapacity || 1,
                  isMine,
                  isBlocked,
                  blockLabel: blockHint?.label,
                  primarySlot,
                  overflowCount
                });
                return (
                  <div key={h} ref={h === 8 ? scrollTargetRef : null}
                    onClick={handleActivateSlot}
                    onKeyDown={(event) => handleKeyboardActivation(event, handleActivateSlot)}
                    role="button"
                    tabIndex={0}
                    aria-label={slotAriaLabel}
                    className={getSlotCellClass({ hour: h, isBlocked, isMine, totalUsed })}
                  >
                    {isBlocked && blockHint?.isStart && (
                      <button
                        type="button"
                        title={blockHint.label}
                        aria-label={`View conflict details for ${currentInst?.name || 'instrument'} at ${formatHour(h)}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          openSlotDetails({
                            instrument: currentInst,
                            dateStr: selectedDateStr,
                            hour: h,
                            slots,
                            isBlocked,
                            blockLabel: blockHint.label,
                            totalUsed
                          });
                        }}
                        className="text-[7px] leading-snug text-slate-500 bg-white/70 rounded px-1 py-0.5 mb-1 font-semibold"
                      >
                        Conflict
                      </button>
                    )}
                    {primarySlot ? (
                      <>
                        <div className={`text-[8px] mb-0.5 px-1 py-0.5 rounded truncate font-medium ${primarySlot.userName === userName ? 'bg-[#0f6f9f] text-white' : 'bg-slate-200/85 text-slate-600'}`}>{primarySlot.userName} ({primarySlot.requestedQuantity})</div>
                        {overflowCount > 0 && (
                          <button
                            type="button"
                            aria-label={`View all bookings for ${currentInst?.name || 'instrument'} at ${formatHour(h)}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              openSlotDetails({
                                instrument: currentInst,
                                dateStr: selectedDateStr,
                                hour: h,
                                slots,
                                isBlocked,
                                blockLabel: blockHint?.label || '',
                                totalUsed
                              });
                            }}
                            className="text-[7px] px-1 py-0.5 rounded bg-slate-100 text-slate-500 font-semibold"
                          >
                            +{overflowCount} more
                          </button>
                        )}
                      </>
                    ) : <div className="text-[9px] text-slate-300 mt-0.5">Available</div>}
                    {totalUsed > 0 && <div className="text-[7px] text-slate-300 mt-auto font-data tabular-nums">{totalUsed}/{currentInst.maxCapacity || 1}</div>}
                  </div>
                );
              })}
                </div>
              </div>
            </div>
        )}

        {/* VIEW C: WEEKLY VIEW (RESTORED!) */}
        {!isCalendarLoading && selectedInstrumentId && viewMode === 'week' && (
          <div className="h-full overflow-auto border-y border-slate-200/80 bg-white">
            <div className="min-w-[44rem] md:min-w-[48rem] min-h-full">
              <div className="grid grid-cols-[3.5rem_repeat(7,5.75rem)] md:grid-cols-[4rem_repeat(7,6rem)] sticky top-0 z-40">
                <div className="h-10 md:h-11 border-r border-b border-slate-200/80 bg-[#e6f3fb]"></div>
                {weekDays.map((d, i) => (
                  <div key={i} className="h-10 md:h-11 border-r border-b border-slate-200/80 flex flex-col items-center justify-center bg-[#e6f3fb]">
                    <div className="text-[9px] text-[#1c7aa0] font-bold uppercase">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][d.getDay()===0?6:d.getDay()-1]}</div>
                    <div className="text-[11px] md:text-xs font-black text-[#00407a] font-data tabular-nums">{d.getDate()}</div>
                  </div>
                ))}
              </div>
              <div>
                {hours.map(hour => {
                  return (
                  <div key={hour} ref={hour === 8 ? scrollTargetRef : null} className="grid grid-cols-[3.5rem_repeat(7,5.75rem)] md:grid-cols-[4rem_repeat(7,6rem)]">
                    <div className={getTimeLabelClass(hour)}>
                      <span className={`${isWorkingHour(hour) ? 'font-bold' : ''}`}>{hour}:00</span>
                    </div>
                    {weekDays.map((day, i) => {
                      const dateStr = getFormattedDate(day); 
                      const slots = bookingsByInstrumentSlot.get(getInstSlotKey(currentInst.id, dateStr, hour)) || [];
                      const isMine = slots.some(s => s.userName === userName);
                      const primarySlot = getPrimarySlot(slots);
                      const overflowCount = getOverflowCount(slots);
                      const blockingBookings = getBlockingBookings(currentInst.id, dateStr, hour);
                      const blockingDetails = getBlockingDetails(blockingBookings);
                      const prevBlockingBookings = hour > 0 ? getBlockingBookings(currentInst.id, dateStr, hour - 1) : [];
                      const prevBlockingDetails = getBlockingDetails(prevBlockingBookings);
                      const totalUsed = slots.reduce((s, b) => s + (Number(b.requestedQuantity) || 1), 0);
                      const isBlocked = Boolean(blockingDetails.instrumentsText) && !isMine;
                      const isBlockStart = isBlocked && (hour === 0 || prevBlockingDetails.signature !== blockingDetails.signature);
                      const handleActivateSlot = () => {
                        if (isMine) setBookingToDelete(slots.find(s=>s.userName===userName));
                        else if (isBlocked) return;
                        else setBookingModal({isOpen:true, date:dateStr, hour, instrument: currentInst});
                      };
                      const slotAriaLabel = getSlotAriaLabel({
                        instrumentName: currentInst?.name || 'Instrument',
                        dateStr,
                        hour,
                        totalUsed,
                        maxCapacity: currentInst?.maxCapacity || 1,
                        isMine,
                        isBlocked,
                        blockLabel: blockingDetails.labelPrefix,
                        primarySlot,
                        overflowCount
                      });
                      return (
                        <div key={i} onClick={handleActivateSlot} onKeyDown={(event) => handleKeyboardActivation(event, handleActivateSlot)} role="button" tabIndex={0} aria-label={slotAriaLabel}
                             className={getSlotCellClass({ hour, isBlocked, isMine, totalUsed })}>
                          {isBlocked && isBlockStart && (
                            <button
                              type="button"
                              title={blockingDetails.labelPrefix}
                              aria-label={`View conflict details for ${currentInst?.name || 'instrument'} at ${formatHour(hour)} on ${dateStr}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                openSlotDetails({
                                  instrument: currentInst,
                                  dateStr,
                                  hour,
                                  slots,
                                  isBlocked,
                                  blockLabel: blockingDetails.labelPrefix,
                                  totalUsed
                                });
                              }}
                              className="text-[7px] leading-snug text-slate-500 bg-white/70 rounded px-1 py-0.5 mb-1 font-semibold"
                            >
                              Conflict
                            </button>
                          )}
                          {primarySlot && (
                            <div className={`text-[8px] truncate rounded-sm mb-0.5 px-1 py-0.5 font-medium ${primarySlot.userName === userName ? 'bg-[#0f6f9f] text-white' : 'bg-slate-200/85 text-slate-600'}`}>{primarySlot.userName}</div>
                          )}
                          {overflowCount > 0 && (
                            <button
                              type="button"
                              aria-label={`View all bookings for ${currentInst?.name || 'instrument'} at ${formatHour(hour)} on ${dateStr}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                openSlotDetails({
                                  instrument: currentInst,
                                  dateStr,
                                  hour,
                                  slots,
                                  isBlocked,
                                  blockLabel: blockingDetails.labelPrefix,
                                  totalUsed
                                });
                              }}
                              className="text-[7px] px-1 py-0.5 rounded bg-slate-100 text-slate-500 font-semibold"
                            >
                              +{overflowCount} more
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )})}
              </div>
            </div>
          </div>
        )}
      </div>

      <InstrumentSelectionModal
        isOpen={showSelectionModal}
        onClose={() => setShowSelectionModal(false)}
        instruments={instruments}
        isLoading={!hasLoadedInstruments}
        selectedOverviewIds={overviewInstrumentIds}
        pinnedInstrumentIds={pinnedInstrumentIds}
        onTogglePin={handleTogglePinnedInstrument}
        onApply={handleApplySelection}
      />
      {slotDetails.isOpen && (
        <div className="ds-overlay z-[90]" role="presentation">
          <div className="ds-modal ds-modal-sm ds-section" role="dialog" aria-modal="true" aria-labelledby="slot-details-title">
            <h3 id="slot-details-title" className="text-base font-bold text-slate-800">{slotDetails.instrument?.name || 'Slot details'}</h3>
            <p className="text-xs text-slate-500 font-data tabular-nums mt-1">
              {slotDetails.dateStr} at {formatHour(slotDetails.hour)}
            </p>
            {slotDetails.blockLabel && (
              <div className="mt-3 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                {slotDetails.blockLabel}
              </div>
            )}
            <div className="mt-3 space-y-2 max-h-52 overflow-y-auto">
              {slotDetails.slots.length > 0 ? (
                slotDetails.slots.map((slot, idx) => (
                  <div key={`${slot.userName}-${idx}`} className="ds-card-muted px-2.5 py-2 flex items-center justify-between">
                    <span className={`text-xs ${slot.userName === userName ? 'text-[#00407a] font-bold' : 'text-slate-700'}`}>
                      {slot.userName}
                    </span>
                    <span className="text-[11px] text-slate-400 font-data tabular-nums">
                      {Number(slot.requestedQuantity) || 1} unit
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2">
                  No direct bookings in this slot.
                </div>
              )}
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={closeSlotDetails} className="flex-1 py-2.5 ds-btn ds-btn-secondary">
                Close
              </button>
              {slotDetails.canBook && (
                <button
                  type="button"
                  onClick={() => {
                    closeSlotDetails();
                    setBookingModal({
                      isOpen: true,
                      date: slotDetails.dateStr,
                      hour: slotDetails.hour,
                      instrument: slotDetails.instrument
                    });
                  }}
                  className="flex-1 py-2.5 ds-btn ds-btn-primary text-white"
                >
                  Book slot
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      <BookingModal
        isOpen={bookingModal.isOpen}
        onClose={() => setBookingModal({ ...bookingModal, isOpen: false })}
        initialDate={bookingModal.date}
        initialHour={bookingModal.hour}
        instrument={bookingModal.instrument}
        onConfirm={handleConfirmBooking}
        isBooking={isBookingProcess}
        getConflictPreview={({ repeatOption, isFullDay, isOvernight, isWorkingHours, quantity }) => {
          if (!bookingModal.instrument) return { count: 0, first: '' };
          const slots = buildBookingSlots({
            startDateStr: bookingModal.date,
            startHour: bookingModal.hour,
            repeatCount: repeatOption,
            isFullDay,
            isOvernight,
            isWorkingHours
          });
          const conflicts = findConflicts({ instrument: bookingModal.instrument, requestedQty: quantity, slots });
          return { count: conflicts.length, first: conflicts[0] || '' };
        }}
      />
      <NoteModal isOpen={showNoteModal} onClose={()=>setShowNoteModal(false)} instrument={currentInst} userName={userName} onSave={handleSaveNote} />
      
      {bookingToDelete && (
        <div className="ds-overlay z-[60]" role="presentation">
          <div className="ds-modal ds-modal-sm ds-section text-center" role="dialog" aria-modal="true" aria-labelledby="cancel-booking-title">
            <ShieldAlert className="w-12 h-12 text-red-500 mx-auto mb-4"/>
            <h3 id="cancel-booking-title" className="font-black mb-2 text-lg">Cancel booking?</h3>
            {bookingToDelete.bookingGroupId && <p className="text-[10px] text-orange-500 font-bold bg-orange-50 p-2 rounded-lg mb-4">Batch booking detected. Cancelling all linked slots.</p>}
            <div className="flex gap-3 mt-4">
              <button type="button" onClick={()=>setBookingToDelete(null)} className="flex-1 py-3 ds-btn ds-btn-secondary">Keep booking</button>
              <button type="button" onClick={handleDeleteBooking} className="flex-1 py-3 ds-btn bg-red-500 text-white">Cancel booking</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default MemberApp;
