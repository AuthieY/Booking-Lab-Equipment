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
  const [showSelectionModal, setShowSelectionModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [instruments, setInstruments] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [bookingToDelete, setBookingToDelete] = useState(null);
  const [bookingModal, setBookingModal] = useState({ isOpen: false, date: '', hour: 0, instrument: null });
  const [isBookingProcess, setIsBookingProcess] = useState(false);
  
  const scrollTargetRef = useRef(null);
  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);

  useEffect(() => {
    const timer = setTimeout(() => { if (scrollTargetRef.current) scrollTargetRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 300);
    return () => clearTimeout(timer);
  }, [selectedInstrumentId, viewMode]);

  useEffect(() => {
    const unsubInst = onSnapshot(query(collection(db, 'artifacts', appId, 'public', 'data', 'instruments'), where('labName', '==', labName)), (s) => setInstruments(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubBook = onSnapshot(query(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'), where('labName', '==', labName)), (s) => setBookings(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { unsubInst(); unsubBook(); };
  }, [labName]);

  const handleConfirmBooking = async (repeatCount, isFullDay, subOption, isOvernight, requestedQty) => {
    if (!bookingModal.instrument) return;
    setIsBookingProcess(true);
    const { date: startDateStr, hour: startHour, instrument } = bookingModal; 
    const batch = writeBatch(db); 
    const newSlots = []; 
    const targetDates = [];
    const bookingGroupId = (isFullDay || isOvernight || repeatCount > 0) ? `GRP-${Date.now()}-${Math.random().toString(36).substr(2,4)}` : null;

    for (let i = 0; i <= repeatCount; i++) { 
      const d = new Date(startDateStr); 
      d.setDate(d.getDate() + (i * 7)); 
      targetDates.push(getFormattedDate(d)); 
    }

    targetDates.forEach(dStr => { 
      if (isFullDay) { for (let h = 0; h < 24; h++) newSlots.push({ date: dStr, hour: h }); }
      else if (isOvernight) {
        for (let h = 17; h <= 23; h++) newSlots.push({ date: dStr, hour: h });
        const nextDayStr = getFormattedDate(addDays(new Date(dStr), 1));
        for (let h = 0; h <= 8; h++) newSlots.push({ date: nextDayStr, hour: h });
      } else { newSlots.push({ date: dStr, hour: startHour }); } 
    });

    // --- RESTORED: Conflict Device Logic ---
    const thisInstrumentConflicts = instrument.conflicts || [];
    const enemyIds = instruments.filter(i => thisInstrumentConflicts.includes(i.id) || (i.conflicts && i.conflicts.includes(instrument.id))).map(i => i.id);

    const conflicts = [];
    newSlots.forEach(slot => {
      const currentLoad = bookings.filter(b => b.instrumentId === instrument.id && b.date === slot.date && b.hour === slot.hour)
                                  .reduce((sum, b) => sum + (Number(b.requestedQuantity) || 1), 0);
      const isEnemyBooked = bookings.some(b => enemyIds.includes(b.instrumentId) && b.date === slot.date && b.hour === slot.hour);
      
      if (currentLoad + Number(requestedQty) > (instrument.maxCapacity || 1)) conflicts.push(`${slot.date} ${slot.hour}:00 (Full)`);
      if (isEnemyBooked) conflicts.push(`${slot.date} ${slot.hour}:00 (Device Conflict)`);
    });

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
  const currentInst = instruments.find(i => i.id === selectedInstrumentId);

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden text-sm">
      <div className="flex-none z-50 bg-white shadow-sm">
          <header className="px-4 py-3 flex justify-between items-center border-b">
            <div><h1 className="font-bold text-lg">{labName}</h1><div className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full"><ShieldCheck className="w-3 h-3"/> {userName}</div></div>
            <button onClick={onLogout} className="p-2 text-slate-400 bg-slate-100 rounded-full"><LogOut className="w-5 h-5"/></button>
          </header>
          <div className="p-4 border-b">
              <button onClick={() => setShowSelectionModal(true)} className="w-full p-3 rounded-xl bg-indigo-600 text-white flex justify-between shadow-md font-bold">
                 <div className="flex items-center gap-3"><LayoutGrid className="w-4 h-4"/> <span>{currentInst ? currentInst.name : 'Overview'}</span></div><ChevronRight className="w-5 h-5 opacity-40"/>
              </button>
          </div>
          <div className="flex items-center justify-between px-4 py-2 border-b">
             {selectedInstrumentId && (
               <div className="flex bg-slate-100 rounded-lg p-1">
                 <button onClick={()=>setViewMode('day')} className={`p-1.5 rounded-md ${viewMode==='day'?'bg-white shadow text-indigo-600':'text-slate-400'}`}><LayoutGrid className="w-4 h-4"/></button>
                 <button onClick={()=>setViewMode('week')} className={`p-1.5 rounded-md ${viewMode==='week'?'bg-white shadow text-indigo-600':'text-slate-400'}`}><CalendarDays className="w-4 h-4"/></button>
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

      <div className="flex-1 overflow-y-auto relative">
        {/* VIEW A: OVERVIEW (MATRIX VIEW) */}
        {!selectedInstrumentId && (
           <div className="flex min-w-max">
               <div className="w-14 bg-slate-50 border-r sticky left-0 z-20">
                 {hours.map(h => <div key={h} ref={h === 8 ? scrollTargetRef : null} className="h-24 text-[10px] text-slate-400 text-right pr-2 pt-2 border-b">{h}:00</div>)}
               </div>
               <div className="flex">{instruments.map(inst => (
                 <div key={inst.id} className="w-36 border-r">
                   <div className={`h-8 flex items-center justify-center text-[10px] font-bold sticky top-0 z-10 border-b ${getColorStyle(inst.color).bg} ${getColorStyle(inst.color).text}`}>{inst.name}</div>
                   {hours.map(h => {
                     const slots = bookings.filter(b => b.instrumentId === inst.id && b.date === getFormattedDate(date) && b.hour === h);
                     const totalUsed = slots.reduce((s, b) => s + (Number(b.requestedQuantity) || 1), 0);
                     const isMine = slots.some(s => s.userName === userName);
                     return (
                       <div key={h} onClick={() => { if(isMine) setBookingToDelete(slots.find(s=>s.userName===userName)); else if(totalUsed >= (inst.maxCapacity || 1)) alert("Full"); else setBookingModal({isOpen:true, date:getFormattedDate(date), hour:h, instrument:inst}); }} 
                            className={`h-24 border-b p-1 cursor-pointer transition ${isMine ? 'bg-indigo-50 border-l-4 border-indigo-400' : totalUsed > 0 ? 'bg-slate-50' : 'hover:bg-slate-50'}`}>
                         {slots.map((s, idx) => (<div key={idx} className={`text-[9px] mb-0.5 px-1 rounded truncate ${s.userName === userName ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'}`}>{s.userName}</div>))}
                         {totalUsed > 0 && <div className="text-[8px] text-slate-300 mt-auto">{totalUsed}/{inst.maxCapacity || 1}</div>}
                       </div>
                     );
                   })}
                 </div>
               ))}</div>
           </div>
        )}
        
        {/* VIEW B: SINGLE DAY VIEW */}
        {selectedInstrumentId && viewMode === 'day' && (
            <div className="p-4 space-y-3">
              {hours.map(h => { 
                const slots = bookings.filter(b => b.instrumentId === selectedInstrumentId && b.date === getFormattedDate(date) && b.hour === h); 
                const totalUsed = slots.reduce((s, b) => s + (Number(b.requestedQuantity) || 1), 0);
                const isMine = slots.some(s => s.userName === userName);
                return (
                  <div key={h} ref={h === 8 ? scrollTargetRef : null} className="flex gap-3">
                    <div className="w-10 pt-3 text-right text-xs text-slate-400 font-bold">{h}:00</div>
                    <div onClick={() => { if (isMine) setBookingToDelete(slots.find(s=>s.userName===userName)); else if (totalUsed >= (currentInst.maxCapacity || 1)) alert("Full"); else setBookingModal({ isOpen: true, date: getFormattedDate(date), hour:h, instrument: currentInst }); }} 
                         className={`flex-1 min-h-[4.5rem] rounded-2xl border p-4 transition-all ${isMine ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white border-slate-100 shadow-sm'}`}>
                      <div className="flex justify-between items-center">
                        <div className="flex flex-wrap gap-1.5">
                          {slots.length > 0 ? slots.map((s, i) => (
                            <span key={i} className={`text-[10px] px-2 py-1 rounded-full font-bold ${s.userName === userName ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>{s.userName} ({s.requestedQuantity})</span>
                          )) : <span className="text-xs font-bold text-slate-300">Available</span>}
                        </div>
                        <div className="text-[10px] font-black uppercase opacity-60">{totalUsed}/{currentInst.maxCapacity} Slots</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
        )}

        {/* VIEW C: WEEKLY VIEW (RESTORED!) */}
        {selectedInstrumentId && viewMode === 'week' && (
          <div className="overflow-x-auto pb-4 px-2">
            <div className="min-w-[850px]">
              <div className="grid grid-cols-8 gap-2 mb-2 sticky top-0 z-20 bg-slate-50 py-3">
                <div className="w-12"></div>
                {weekDays.map((d, i) => (<div key={i} className="text-center"><div className="text-[10px] text-slate-400 font-bold uppercase">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][d.getDay()===0?6:d.getDay()-1]}</div><div className="text-sm font-black">{d.getDate()}</div></div>))}
              </div>
              <div className="space-y-2">
                {hours.map(hour => (
                  <div key={hour} ref={hour === 8 ? scrollTargetRef : null} className="grid grid-cols-8 gap-2 h-20">
                    <div className="text-[10px] text-slate-400 font-bold text-right pr-2 pt-2">{hour}:00</div>
                    {weekDays.map((day, i) => {
                      const dateStr = getFormattedDate(day); 
                      const slots = bookings.filter(b => b.instrumentId === currentInst.id && b.date === dateStr && b.hour === hour);
                      const isMine = slots.some(s => s.userName === userName);
                      return (
                        <div key={i} onClick={() => { if (isMine) setBookingToDelete(slots.find(s=>s.userName===userName)); else setBookingModal({isOpen:true, date:dateStr, hour, instrument: currentInst}); }} 
                             className={`rounded-xl border p-1.5 overflow-hidden transition-all ${isMine ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-100 shadow-sm'}`}>
                          {slots.map((s, idx) => (<div key={idx} className={`text-[8px] truncate rounded-sm mb-0.5 font-bold ${s.userName === userName ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'}`}>{s.userName}</div>))}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <InstrumentSelectionModal isOpen={showSelectionModal} onClose={()=>setShowSelectionModal(false)} instruments={instruments} onSelect={(id) => { setSelectedInstrumentId(id); setShowSelectionModal(false); }} currentId={selectedInstrumentId} />
      <BookingModal isOpen={bookingModal.isOpen} onClose={() => setBookingModal({...bookingModal, isOpen: false})} initialDate={bookingModal.date} initialHour={bookingModal.hour} instrument={bookingModal.instrument} onConfirm={handleConfirmBooking} isBooking={isBookingProcess} />
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