import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  collection, query, where, onSnapshot, deleteDoc, doc, serverTimestamp, writeBatch, getDocs, addDoc 
} from 'firebase/firestore';
import { 
  ShieldCheck, LogOut, ArrowRightLeft, LayoutGrid, ChevronRight, ChevronLeft, 
  CalendarDays, MapPin, Wrench, StickyNote, Plus, ShieldAlert, User
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
  const [showSelectionModal, setShowSelectionModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [instruments, setInstruments] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [bookingToDelete, setBookingToDelete] = useState(null);
  const [bookingModal, setBookingModal] = useState({ isOpen: false, date: '', hour: 0, instrument: null });
  const [isBookingProcess, setIsBookingProcess] = useState(false);
  
  const scrollTargetRef = useRef(null);
  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const selectedDateStr = useMemo(() => getFormattedDate(date), [date]);
  const isToday = useMemo(() => getFormattedDate(new Date()) === selectedDateStr, [selectedDateStr]);
  const currentHour = new Date().getHours();

  const formatHour = (hour) => `${String(hour).padStart(2, '0')}:00`;
  const getSlotKey = (dateStr, hour) => `${dateStr}|${hour}`;
  const getInstSlotKey = (instrumentId, dateStr, hour) => `${instrumentId}|${dateStr}|${hour}`;
  const getHourBandClass = (hour) => (hour % 2 === 0 ? 'bg-white' : 'bg-slate-50/45');
  const isWorkingHour = (hour) => hour >= 9 && hour < 17;
  const getTimeLabelClass = (hour) => `h-24 text-[10px] text-right pr-2 pt-2 border-b border-slate-200 font-semibold ${getHourBandClass(hour)} ${isToday && hour === currentHour ? 'bg-[#e6f7fc] text-[#00407a]' : isWorkingHour(hour) ? 'text-slate-500' : 'text-slate-400'}`;
  const getSlotCellClass = ({ hour, isBlocked, isMine, totalUsed }) => (
    `h-24 border-b border-slate-200 p-1 transition relative ${isBlocked ? 'bg-slate-200/70 cursor-not-allowed' : isMine ? 'bg-[#e6f7fc] border-l-4 border-[#1c7aa0] cursor-pointer' : totalUsed > 0 ? `${getHourBandClass(hour)} cursor-pointer` : `${getHourBandClass(hour)} hover:bg-slate-100 cursor-pointer`} ${isWorkingHour(hour) ? 'after:absolute after:inset-x-0 after:bottom-0 after:h-[1px] after:bg-emerald-200/50' : ''} ${isToday && hour === currentHour ? 'ring-2 ring-inset ring-[#52bdec]' : ''}`
  );

  useEffect(() => {
    const timer = setTimeout(() => { if (scrollTargetRef.current) scrollTargetRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 300);
    return () => clearTimeout(timer);
  }, [selectedInstrumentId, viewMode]);

  useEffect(() => {
    const unsubInst = onSnapshot(query(collection(db, 'artifacts', appId, 'public', 'data', 'instruments'), where('labName', '==', labName)), (s) => setInstruments(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubBook = onSnapshot(query(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'), where('labName', '==', labName)), (s) => setBookings(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { unsubInst(); unsubBook(); };
  }, [labName]);

  useEffect(() => {
    const validIds = new Set(instruments.map((i) => i.id));
    setOverviewInstrumentIds((prev) => prev.filter((id) => validIds.has(id)));

    if (selectedInstrumentId && !validIds.has(selectedInstrumentId)) {
      setSelectedInstrumentId(null);
    }
  }, [instruments]);

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
        const blockingNames = [...new Set(blockingBookings.map((b) => b.instrumentName))].join(', ');
        conflicts.push(`${slot.date} ${formatHour(slot.hour)} (Conflict: ${blockingNames})`);
      }
    });

    return conflicts;
  };

  const getBlockingHintsForDate = (instrumentId, dateStr) => {
    const hints = {};
    let hour = 0;

    while (hour < 24) {
      const startBlockers = getBlockingBookings(instrumentId, dateStr, hour);
      const startNames = [...new Set(startBlockers.map((b) => b.instrumentName))].sort();

      if (startNames.length === 0) {
        hour += 1;
        continue;
      }

      const signature = startNames.join('|');
      const start = hour;
      let end = hour + 1;

      while (end < 24) {
        const nextBlockers = getBlockingBookings(instrumentId, dateStr, end);
        const nextNames = [...new Set(nextBlockers.map((b) => b.instrumentName))].sort();
        if (nextNames.join('|') !== signature) break;
        end += 1;
      }

      const label = `${startNames.join(' & ')} booked ${formatHour(start)}-${formatHour(end)}`;
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
    } catch (e) { alert("Failed"); } finally { setIsBookingProcess(false); }
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
    } catch (e) { alert("Failed to cancel"); }
  };

  const handleSaveNote = async (msg) => {
    const inst = instruments.find(i => i.id === selectedInstrumentId);
    if (!inst) return;
    try {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'notes'), { labName, instrumentId: inst.id, instrumentName: inst.name, userName, message: msg, timestamp: serverTimestamp() });
        setShowNoteModal(false); alert("Note sent.");
    } catch (e) { alert("Failed"); }
  };

  const weekDays = useMemo(() => { const m = getMonday(date); return Array.from({ length: 7 }, (_, i) => { const d = new Date(m); d.setDate(m.getDate() + i); return d; }); }, [date]);
  const overviewInstruments = useMemo(() => instruments.filter((inst) => overviewInstrumentIds.includes(inst.id)), [instruments, overviewInstrumentIds]);
  const currentInst = instruments.find(i => i.id === selectedInstrumentId);
  const overviewLabel = useMemo(() => {
    if (currentInst) return currentInst.name;
    if (overviewInstruments.length === 0) return 'Select Instruments';
    if (overviewInstruments.length === instruments.length) return 'Overview';
    return `Overview (${overviewInstruments.length})`;
  }, [currentInst, overviewInstruments.length, instruments.length]);

  const handleApplySelection = (ids) => {
    const nextIds = ids || [];
    setOverviewInstrumentIds(nextIds);
    setSelectedInstrumentId(nextIds.length === 1 ? nextIds[0] : null);
    setShowSelectionModal(false);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden text-sm">
      <div className="flex-none z-50 bg-white shadow-sm">
          <header className="px-4 py-3 flex justify-between items-center border-b">
            <div><h1 className="font-bold text-lg">{labName}</h1><div className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full"><ShieldCheck className="w-3 h-3"/> {userName}</div></div>
            <button onClick={onLogout} className="p-2 text-slate-400 bg-slate-100 rounded-full"><LogOut className="w-5 h-5"/></button>
          </header>
          <div className="p-4 border-b">
              <button onClick={() => setShowSelectionModal(true)} className="w-full p-3 rounded-xl bg-[#00407a] text-white flex justify-between shadow-md font-bold">
                 <div className="flex items-center gap-3"><LayoutGrid className="w-4 h-4"/> <span>{overviewLabel}</span></div><ChevronRight className="w-5 h-5 opacity-40"/>
              </button>
          </div>
          <div className="flex items-center justify-between px-4 py-2 border-b">
             {selectedInstrumentId && (
               <div className="flex bg-slate-100 rounded-lg p-1">
                 <button onClick={()=>setViewMode('day')} className={`p-1.5 rounded-md ${viewMode==='day'?'bg-white shadow text-[#00407a]':'text-slate-400'}`}><LayoutGrid className="w-4 h-4"/></button>
                 <button onClick={()=>setViewMode('week')} className={`p-1.5 rounded-md ${viewMode==='week'?'bg-white shadow text-[#00407a]':'text-slate-400'}`}><CalendarDays className="w-4 h-4"/></button>
               </div>
             )}
             <div className="flex items-center gap-4 flex-1 justify-end font-bold text-slate-600">
                <button onClick={() => setDate(addDays(date, (viewMode === 'day' || !selectedInstrumentId) ? -1 : -7))}><ChevronLeft/></button>
                <span>{(viewMode === 'day' || !selectedInstrumentId) ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : `${weekDays[0].getMonth()+1}/${weekDays[0].getDate()} - ${weekDays[6].getDate()}`}</span>
                <button onClick={() => setDate(addDays(date, (viewMode === 'day' || !selectedInstrumentId) ? 1 : 7))}><ChevronRight/></button>
             </div>
          </div>
          {selectedInstrumentId && currentInst && (
             <div className="px-4 py-2 bg-slate-50 text-xs text-slate-500 flex items-center gap-2 border-b border-slate-200">
                <MapPin className="w-3 h-3"/> {currentInst.location || 'No Location'}
                {currentInst.isUnderMaintenance && <span className="bg-orange-100 text-orange-600 px-2 rounded font-bold uppercase">Maintenance</span>}
                <button onClick={()=>setShowNoteModal(true)} className="ml-auto flex items-center gap-1 bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded font-bold"><StickyNote className="w-3 h-3"/> Report Issue</button>
             </div>
          )}
      </div>

      <div className={`flex-1 relative ${selectedInstrumentId && viewMode === 'week' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        {/* VIEW A: OVERVIEW (MATRIX VIEW) */}
        {!selectedInstrumentId && overviewInstruments.length === 0 && (
           <div className="h-full flex items-center justify-center p-6">
             <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-6 text-center shadow-sm">
               <h3 className="text-lg font-black text-slate-800">Choose Instruments For Your View</h3>
               <p className="text-sm text-slate-500 mt-2">
                 Start by selecting the instruments you want to display.
               </p>
               <p className="text-xs text-slate-400 mt-1">
                 Select 1 instrument to open its individual view, or select multiple for overview.
               </p>
               <button
                 onClick={() => setShowSelectionModal(true)}
                 className="mt-5 w-full py-3 rounded-xl bg-[#00407a] text-white font-bold"
               >
                 Select Instruments
               </button>
             </div>
           </div>
        )}

        {!selectedInstrumentId && overviewInstruments.length > 0 && (
           <div className="flex min-w-max border-y border-slate-200">
               <div className="w-16 bg-slate-50/95 backdrop-blur border-r sticky left-0 z-20 shadow-[2px_0_0_rgba(148,163,184,0.12)]">
                 <div className="h-10 border-b bg-slate-100"></div>
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
                 <div key={inst.id} className="w-24 border-r border-slate-200">
                   <div className={`h-10 flex items-center justify-center text-[10px] font-bold sticky top-0 z-10 border-b border-slate-200 shadow-sm px-1 text-center whitespace-normal leading-tight ${getColorStyle(inst.color).bg} ${getColorStyle(inst.color).text}`}>{inst.name}</div>
                   {hours.map(h => {
                     const slots = bookingsByInstrumentSlot.get(getInstSlotKey(inst.id, selectedDateStr, h)) || [];
                     const totalUsed = slots.reduce((s, b) => s + (Number(b.requestedQuantity) || 1), 0);
                     const isMine = slots.some(s => s.userName === userName);
                     const blockHint = blockingHintsByInstrumentForDate[inst.id]?.[h];
                     const isBlocked = Boolean(blockHint) && !isMine;
                     return (
                       <div
                         key={h}
                         onClick={() => {
                           if (isMine) setBookingToDelete(slots.find(s => s.userName === userName));
                           else if (isBlocked) return;
                           else if (totalUsed >= (inst.maxCapacity || 1)) alert("Full");
                           else setBookingModal({ isOpen: true, date: selectedDateStr, hour: h, instrument: inst });
                         }}
                         className={getSlotCellClass({ hour: h, isBlocked, isMine, totalUsed })}
                       >
                         {isBlocked && blockHint?.isStart && (
                           <div className="text-[8px] leading-tight text-slate-500 bg-white/70 rounded px-1 py-0.5 mb-1">
                             {blockHint.label}
                           </div>
                         )}
                         {slots.map((s, idx) => (<div key={idx} className={`text-[9px] mb-0.5 px-1 rounded truncate ${s.userName === userName ? 'bg-[#00407a] text-white' : 'bg-slate-200 text-slate-600'}`}>{s.userName}</div>))}
                         {totalUsed > 0 && <div className="text-[8px] text-slate-300 mt-auto">{totalUsed}/{inst.maxCapacity || 1}</div>}
                       </div>
                     );
                   })}
                 </div>
               ))}
               </div>
           </div>
        )}
        
        {/* VIEW B: SINGLE DAY VIEW */}
        {selectedInstrumentId && viewMode === 'day' && (
            <div className="border-y border-slate-200">
              <div className={`h-8 border-b border-slate-200 text-[10px] font-bold flex items-center px-4 ${getColorStyle(currentInst?.color || 'blue').bg} ${getColorStyle(currentInst?.color || 'blue').text}`}>
                {currentInst?.name}
              </div>
              <div className="flex min-w-max">
                <div className="w-16 bg-slate-50/95 backdrop-blur border-r sticky left-0 z-20 shadow-[2px_0_0_rgba(148,163,184,0.12)]">
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
                const blockHint = blockingHintsByInstrumentForDate[selectedInstrumentId]?.[h];
                const isBlocked = Boolean(blockHint) && !isMine;
                return (
                  <div key={h} ref={h === 8 ? scrollTargetRef : null}
                    onClick={() => { if (isMine) setBookingToDelete(slots.find(s=>s.userName===userName)); else if (isBlocked) return; else if (totalUsed >= (currentInst.maxCapacity || 1)) alert("Full"); else setBookingModal({ isOpen: true, date: selectedDateStr, hour:h, instrument: currentInst }); }} 
                    className={getSlotCellClass({ hour: h, isBlocked, isMine, totalUsed })}
                  >
                    {isBlocked && blockHint?.isStart && <div className="text-[8px] leading-tight text-slate-500 bg-white/70 rounded px-1 py-0.5 mb-1">{blockHint.label}</div>}
                    {slots.length > 0 ? slots.map((s, i) => (
                      <div key={i} className={`text-[9px] mb-0.5 px-1 rounded truncate ${s.userName === userName ? 'bg-[#00407a] text-white' : 'bg-slate-200 text-slate-600'}`}>{s.userName} ({s.requestedQuantity})</div>
                    )) : <div className="text-[9px] text-slate-300 mt-0.5">Available</div>}
                    {totalUsed > 0 && <div className="text-[8px] text-slate-300 mt-auto">{totalUsed}/{currentInst.maxCapacity || 1}</div>}
                  </div>
                );
              })}
                </div>
              </div>
            </div>
        )}

        {/* VIEW C: WEEKLY VIEW (RESTORED!) */}
        {selectedInstrumentId && viewMode === 'week' && (
          <div className="h-full overflow-auto border-y border-slate-200">
            <div className="min-w-[50rem] min-h-full">
              <div className="grid grid-cols-[4rem_repeat(7,6.5rem)] sticky top-0 z-40 shadow-sm">
                <div className="h-12 border-r border-b border-slate-200 bg-slate-100"></div>
                {weekDays.map((d, i) => (
                  <div key={i} className={`h-12 border-r border-b border-slate-200 flex flex-col items-center justify-center ${getColorStyle(currentInst?.color || 'blue').bg}`}>
                    <div className="text-[10px] text-slate-500 font-bold uppercase">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][d.getDay()===0?6:d.getDay()-1]}</div>
                    <div className="text-xs font-black text-slate-700">{d.getDate()}</div>
                  </div>
                ))}
              </div>
              <div>
                {hours.map(hour => {
                  return (
                  <div key={hour} ref={hour === 8 ? scrollTargetRef : null} className="grid grid-cols-[4rem_repeat(7,6.5rem)]">
                    <div className={getTimeLabelClass(hour)}>
                      <span className={`${isWorkingHour(hour) ? 'font-bold' : ''}`}>{hour}:00</span>
                    </div>
                    {weekDays.map((day, i) => {
                      const dateStr = getFormattedDate(day); 
                      const slots = bookingsByInstrumentSlot.get(getInstSlotKey(currentInst.id, dateStr, hour)) || [];
                      const isMine = slots.some(s => s.userName === userName);
                      const blockingBookings = getBlockingBookings(currentInst.id, dateStr, hour);
                      const blockingNames = [...new Set(blockingBookings.map((b) => b.instrumentName))];
                      const totalUsed = slots.reduce((s, b) => s + (Number(b.requestedQuantity) || 1), 0);
                      const isBlocked = blockingNames.length > 0 && !isMine;
                      return (
                        <div key={i} onClick={() => { if (isMine) setBookingToDelete(slots.find(s=>s.userName===userName)); else if (isBlocked) return; else setBookingModal({isOpen:true, date:dateStr, hour, instrument: currentInst}); }} 
                             className={getSlotCellClass({ hour, isBlocked, isMine, totalUsed })}>
                          {isBlocked && <div className="text-[8px] truncate mb-0.5">{blockingNames.join(' & ')}</div>}
                          {slots.map((s, idx) => (<div key={idx} className={`text-[8px] truncate rounded-sm mb-0.5 font-bold ${s.userName === userName ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'}`}>{s.userName}</div>))}
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
        selectedOverviewIds={overviewInstrumentIds}
        onApply={handleApplySelection}
      />
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
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-6 backdrop-blur-sm">
          <div className="bg-white w-full max-w-xs rounded-3xl p-6 text-center shadow-2xl">
            <ShieldAlert className="w-12 h-12 text-red-500 mx-auto mb-4"/>
            <h3 className="font-black mb-2 text-lg">Cancel Booking?</h3>
            {bookingToDelete.bookingGroupId && <p className="text-[10px] text-orange-500 font-bold bg-orange-50 p-2 rounded-lg mb-4">Batch booking detected. Cancelling all linked slots.</p>}
            <div className="flex gap-3 mt-4">
              <button onClick={()=>setBookingToDelete(null)} className="flex-1 py-3 bg-slate-100 font-bold rounded-xl text-slate-600">Back</button>
              <button onClick={handleDeleteBooking} className="flex-1 py-3 bg-red-500 text-white font-bold rounded-xl shadow-lg">Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default MemberApp;
