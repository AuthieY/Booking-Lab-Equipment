import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  collection, query, where, onSnapshot, doc, serverTimestamp, getDocs, addDoc, runTransaction
} from 'firebase/firestore';
import { 
  ShieldCheck, LogOut, LayoutGrid, ChevronRight, ChevronLeft,
  CalendarDays, StickyNote, ShieldAlert, CircleDot
} from 'lucide-react';
import { auth, db, appId, addAuditLog } from '../../api/firebase';
import { getFormattedDate, addDays, getMonday, getColorStyle } from '../../utils/helpers';
import NoteModal from '../modals/NoteModal';
import BookingModal from '../modals/BookingModal';
import InstrumentSelectionModal from '../modals/InstrumentSelectionModal';
import ToastStack from '../common/ToastStack';
import { useToast } from '../../hooks/useToast';
import {
  buildBookingSlots,
  summarizeBlockingBookings,
  sortSlotsForDisplay,
  getPrimarySlot,
  getOverflowCount,
  buildCancellationDeltasBySlot
} from '../../utils/booking';
import { applyDocChanges } from '../../utils/firestore';
import { measurePerf, measurePerfAsync } from '../../utils/perf';

const REPEAT_LOOKAHEAD_DAYS = 24;
const BOOKING_QUERY_BUFFER_DAYS = 14;
const BOOKING_QUERY_GUARD_DAYS = 7;
const BOOKING_AGGREGATE_COLLECTION = 'booking_slot_aggregates';
const MEMBER_CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour warm-start cache for low-volatility data

const loadCachedPayload = (cacheKey, maxAgeMs) => {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const savedAt = Number(parsed.savedAt) || 0;
    if (savedAt > 0 && Date.now() - savedAt > maxAgeMs) {
      localStorage.removeItem(cacheKey);
      return null;
    }
    return parsed.payload ?? null;
  } catch {
    return null;
  }
};

const saveCachedPayload = (cacheKey, payload) => {
  try {
    localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), payload }));
  } catch {
    // Ignore storage quota/private-mode failures.
  }
};

const buildAggregateDocId = (lab, instrumentId, dateStr, hour) => (
  `${encodeURIComponent(lab)}__${instrumentId}__${dateStr}__${String(hour).padStart(2, '0')}`
);

const normalizeAggregateState = (raw, fallback = { usedQuantity: 0, bookingCount: 0 }) => {
  if (!raw || typeof raw !== 'object') return fallback;
  return {
    usedQuantity: Math.max(0, Number(raw.usedQuantity) || 0),
    bookingCount: Math.max(0, Number(raw.bookingCount) || 0)
  };
};

const MemberApp = ({ labName, userName, onLogout }) => {
  const [viewMode, setViewMode] = useState('day');
  const [date, setDate] = useState(new Date());
  const [selectedInstrumentId, setSelectedInstrumentId] = useState(null); 
  const [overviewInstrumentIds, setOverviewInstrumentIds] = useState([]);
  const [pinnedInstrumentIds, setPinnedInstrumentIds] = useState([]);
  const [hasHydratedPinned, setHasHydratedPinned] = useState(false);
  const [hasLoadedInstruments, setHasLoadedInstruments] = useState(false);
  const [hasLoadedBookings, setHasLoadedBookings] = useState(false);
  const [bookingRefreshToken, setBookingRefreshToken] = useState(0);
  const [isSyncingInstruments, setIsSyncingInstruments] = useState(false);
  const [isSyncingBookings, setIsSyncingBookings] = useState(false);
  const [showSelectionModal, setShowSelectionModal] = useState(false);
  const [selectionModalLaunchSource, setSelectionModalLaunchSource] = useState('default');
  const [isLaunchingSelectionFromFab, setIsLaunchingSelectionFromFab] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [instruments, setInstruments] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [bookingToDelete, setBookingToDelete] = useState(null);
  const [bookingModal, setBookingModal] = useState({ isOpen: false, date: '', hour: 0, instrument: null });
  const [isBookingProcess, setIsBookingProcess] = useState(false);
  const [hasCalendarScrolled, setHasCalendarScrolled] = useState(false);
  const [slotDetails, setSlotDetails] = useState({
    isOpen: false,
    instrument: null,
    dateStr: '',
    hour: 0,
    slots: [],
    ownedBooking: null,
    isBlocked: false,
    isPast: false,
    blockLabel: '',
    totalUsed: 0,
    canBook: false
  });
  
  const scrollTargetRef = useRef(null);
  const selectionModalLaunchTimerRef = useRef(null);
  const { toasts, pushToast, dismissToast } = useToast();
  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const selectedDateStr = useMemo(() => getFormattedDate(date), [date]);
  const now = new Date();
  const todayDateStr = getFormattedDate(now);
  const currentWeekStartStr = getFormattedDate(getMonday(now));
  const isToday = selectedDateStr === todayDateStr;
  const currentHour = now.getHours();
  const currentInst = useMemo(
    () => instruments.find((instrument) => instrument.id === selectedInstrumentId),
    [instruments, selectedInstrumentId]
  );
  const visibleRange = useMemo(() => {
    const startDate = selectedInstrumentId && viewMode === 'week'
      ? getMonday(date)
      : new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const endDate = selectedInstrumentId && viewMode === 'week' ? addDays(startDate, 6) : startDate;
    return {
      startDate,
      endDate,
      startStr: getFormattedDate(startDate),
      endStr: getFormattedDate(endDate)
    };
  }, [date, selectedInstrumentId, viewMode]);
  const buildBookingQueryRange = useCallback((startDate, endDate) => {
    const queryStartDate = addDays(startDate, -BOOKING_QUERY_BUFFER_DAYS);
    const queryEndDate = addDays(endDate, REPEAT_LOOKAHEAD_DAYS + BOOKING_QUERY_BUFFER_DAYS);
    return {
      queryStart: getFormattedDate(queryStartDate),
      queryEnd: getFormattedDate(queryEndDate),
      guardStart: getFormattedDate(addDays(queryStartDate, BOOKING_QUERY_GUARD_DAYS)),
      guardEnd: getFormattedDate(addDays(queryEndDate, -BOOKING_QUERY_GUARD_DAYS))
    };
  }, []);
  const [bookingQueryRange, setBookingQueryRange] = useState(() =>
    buildBookingQueryRange(visibleRange.startDate, visibleRange.endDate)
  );
  const instrumentCacheKey = useMemo(() => `booking_member_instruments:${labName}`, [labName]);

  const formatHour = (hour) => `${String(hour).padStart(2, '0')}:00`;
  const getSlotKey = (dateStr, hour) => `${dateStr}|${hour}`;
  const getInstSlotKey = (instrumentId, dateStr, hour) => `${instrumentId}|${dateStr}|${hour}`;
  const getBookingDocRef = (bookingId) => doc(db, 'artifacts', appId, 'public', 'data', 'bookings', bookingId);
  const activeAuthUid = auth.currentUser?.uid || null;
  const normalizeUserLabel = useCallback((value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' '), []);
  const isLegacyBatchOwnedByCurrentUser = useCallback((slots = []) => {
    const groupIds = Array.from(new Set(slots.map((slot) => slot.bookingGroupId).filter(Boolean)));
    if (groupIds.length !== 1) return false;
    const currentUserNameNormalized = normalizeUserLabel(userName);
    if (!currentUserNameNormalized) return false;

    const hasConflictingNamedOwner = slots.some((slot) => {
      const bookingUserNameNormalized = normalizeUserLabel(slot.userName);
      return Boolean(bookingUserNameNormalized) && bookingUserNameNormalized !== currentUserNameNormalized;
    });
    if (hasConflictingNamedOwner) return false;

    return slots.some((slot) => {
      const ownerUid = typeof slot.authUid === 'string' && slot.authUid.length > 0 ? slot.authUid : null;
      const bookingUserNameNormalized = normalizeUserLabel(slot.userName);
      return !ownerUid && !bookingUserNameNormalized;
    });
  }, [normalizeUserLabel, userName]);
  const canCurrentUserDeleteBooking = useCallback((booking) => {
    if (!booking || typeof booking !== 'object') return false;
    const ownerUid = typeof booking.authUid === 'string' && booking.authUid.length > 0
      ? booking.authUid
      : null;
    const currentUserNameNormalized = normalizeUserLabel(userName);
    const bookingUserNameNormalized = normalizeUserLabel(booking.userName);
    const sameUserName = Boolean(currentUserNameNormalized) && bookingUserNameNormalized === currentUserNameNormalized;
    const sameAuthUid = ownerUid ? (Boolean(activeAuthUid) && ownerUid === activeAuthUid) : false;
    // Prefer identity name matching for stable ownership across anonymous-auth uid rotations.
    return sameUserName || sameAuthUid;
  }, [activeAuthUid, normalizeUserLabel, userName]);
  const pickCurrentUserBooking = useCallback((slots = []) => (
    slots.find((slot) => canCurrentUserDeleteBooking(slot)) || null
  ), [canCurrentUserDeleteBooking]);
  const ownedBookingGroupIds = useMemo(() => {
    const ids = new Set();
    bookings.forEach((booking) => {
      if (!canCurrentUserDeleteBooking(booking)) return;
      if (!booking.bookingGroupId) return;
      ids.add(booking.bookingGroupId);
    });
    return ids;
  }, [bookings, canCurrentUserDeleteBooking]);
  const slotBelongsToCurrentUser = useCallback((slots = []) => {
    if (slots.some((slot) => canCurrentUserDeleteBooking(slot))) return true;
    if (isLegacyBatchOwnedByCurrentUser(slots)) return true;
    return slots.some((slot) => slot.bookingGroupId && ownedBookingGroupIds.has(slot.bookingGroupId));
  }, [canCurrentUserDeleteBooking, isLegacyBatchOwnedByCurrentUser, ownedBookingGroupIds]);
  const resolveOwnedBookingForSlots = useCallback((slots = []) => {
    const ownedBooking = pickCurrentUserBooking(slots);
    if (ownedBooking) return ownedBooking;

    const ownedGroupId = slots.find((slot) => slot.bookingGroupId && ownedBookingGroupIds.has(slot.bookingGroupId))?.bookingGroupId;
    if (ownedGroupId) {
      const ownedGroupBooking = bookings.find((booking) => (
        booking.bookingGroupId === ownedGroupId
        && booking.labName === labName
        && canCurrentUserDeleteBooking(booking)
      ));
      if (ownedGroupBooking) return ownedGroupBooking;

      return slots.find((slot) => slot.bookingGroupId === ownedGroupId) || null;
    }

    if (isLegacyBatchOwnedByCurrentUser(slots)) {
      return slots.find((slot) => slot.bookingGroupId) || slots[0] || null;
    }

    return null;
  }, [pickCurrentUserBooking, ownedBookingGroupIds, bookings, labName, canCurrentUserDeleteBooking, isLegacyBatchOwnedByCurrentUser]);
  const toCancelableBookingPayload = useCallback((booking, slots = []) => {
    if (!booking) return null;
    if (isLegacyBatchOwnedByCurrentUser(slots) && !canCurrentUserDeleteBooking(booking)) {
      return { ...booking, __legacyOwnerAssumption: true };
    }
    return booking;
  }, [isLegacyBatchOwnedByCurrentUser, canCurrentUserDeleteBooking]);
  // Booking lock policy:
  // Allow any slot in current week and future weeks.
  // Block only slots before the current week's Monday.
  const isSlotInPast = (dateStr) => {
    return dateStr < currentWeekStartStr;
  };
  const rowHeightClass = 'h-12 md:h-14';
  const getHourBandClass = (hour) => (hour % 2 === 0 ? 'bg-white' : 'bg-slate-50/35');
  const getHourBorderClass = (hour) => (hour % 2 === 0 ? 'border-b border-slate-200/60' : 'border-b border-slate-100/70');
  const isWorkingHour = (hour) => hour >= 9 && hour < 17;
  const getTimeLabelClass = (hour) => `${rowHeightClass} ${getHourBorderClass(hour)} text-[10px] text-right pr-2 pt-1.5 font-semibold font-data tabular-nums tracking-tight ${getHourBandClass(hour)} ${isToday && hour === currentHour ? 'bg-[#eef8fd] text-[#00407a] ds-current-hour' : isWorkingHour(hour) ? 'text-slate-500' : 'text-slate-400'}`;
  const getSlotCellClass = ({ hour, isBlocked, isMine, totalUsed, isPast }) => {
    const bandClass = getHourBandClass(hour);
    const stateClass = isPast
      ? 'bg-slate-100/75 cursor-not-allowed'
      : isBlocked
        ? 'bg-slate-200/45 cursor-not-allowed'
        : isMine
          ? 'bg-[#edf6fc] border-l-2 border-[#1c7aa0] cursor-pointer'
          : totalUsed > 0
            ? `${bandClass} cursor-pointer`
            : `${bandClass} hover:bg-slate-100/70 cursor-pointer`;
    const interactiveClass = (!isPast && !isBlocked) ? 'ds-slot-interactive' : '';
    return `${rowHeightClass} ${getHourBorderClass(hour)} px-1 py-0.5 transition-colors relative ${stateClass} ${interactiveClass} ${isWorkingHour(hour) ? 'after:absolute after:inset-x-0 after:bottom-0 after:h-[1px] after:bg-emerald-200/45' : ''} ${isToday && hour === currentHour ? 'ring-1 ring-inset ring-[#52bdec]/70' : ''}`;
  };
  const slotOwnerChipClass = (ownerName) => (
    `text-[8px] mb-0.5 px-1 py-0.5 rounded truncate font-medium border ${ownerName === userName
      ? 'bg-[#1c7aa0] border-[#1c7aa0] text-white'
      : 'bg-slate-50 border-slate-200/80 text-slate-600'}`
  );
  const conflictHintClass = 'text-[7px] leading-snug text-slate-600 bg-slate-50 border border-slate-200/80 rounded px-1 py-0.5 mb-1 font-semibold';
  const overflowHintClass = 'text-[7px] px-1 py-0.5 rounded bg-slate-50 text-slate-500 border border-slate-200/80 font-semibold';
  const handleCalendarScroll = useCallback((event) => {
    const scrollTop = Number(event?.currentTarget?.scrollTop) || 0;
    const nextScrolled = scrollTop > 6;
    setHasCalendarScrolled((prev) => (prev === nextScrolled ? prev : nextScrolled));
  }, []);

  const openSlotDetails = useCallback(({ instrument, dateStr, hour, slots, isBlocked, isPast, blockLabel, totalUsed }) => {
    const orderedSlots = sortSlotsForDisplay(slots, userName);
    const ownedBooking = resolveOwnedBookingForSlots(slots);
    setSlotDetails({
      isOpen: true,
      instrument,
      dateStr,
      hour,
      slots: orderedSlots,
      ownedBooking,
      isBlocked,
      isPast,
      blockLabel: blockLabel || '',
      totalUsed,
      canBook: !isPast && !isBlocked && totalUsed < (instrument?.maxCapacity || 1)
    });
  }, [resolveOwnedBookingForSlots, userName]);

  const closeSlotDetails = useCallback(() => {
    setSlotDetails((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const openSlotInteraction = useCallback(({
    instrument,
    dateStr,
    hour,
    slots,
    isBlocked,
    isPast,
    blockLabel,
    totalUsed
  }) => {
    if (isPast) {
      pushToast('Booking before current week is not allowed.', 'warning');
      return;
    }

    const ownedBooking = resolveOwnedBookingForSlots(slots);
    if (ownedBooking) {
      const payload = toCancelableBookingPayload(ownedBooking, slots);
      if (payload) {
        setBookingToDelete(payload);
        return;
      }
      pushToast('Unable to locate your booking in this slot. Refresh and try again.', 'warning');
      return;
    }

    if ((slots?.length || 0) > 0 || isBlocked || totalUsed > 0) {
      openSlotDetails({
        instrument,
        dateStr,
        hour,
        slots,
        isBlocked,
        isPast,
        blockLabel: blockLabel || '',
        totalUsed
      });
      return;
    }

    setBookingModal({ isOpen: true, date: dateStr, hour, instrument });
  }, [openSlotDetails, pushToast, resolveOwnedBookingForSlots, toCancelableBookingPayload]);

  useEffect(() => {
    const requiredEnd = getFormattedDate(addDays(visibleRange.endDate, REPEAT_LOOKAHEAD_DAYS));
    const shouldShiftQueryWindow =
      visibleRange.startStr < bookingQueryRange.guardStart ||
      requiredEnd > bookingQueryRange.guardEnd;

    if (!shouldShiftQueryWindow) return;

    const nextRange = buildBookingQueryRange(visibleRange.startDate, visibleRange.endDate);
    if (
      nextRange.queryStart === bookingQueryRange.queryStart &&
      nextRange.queryEnd === bookingQueryRange.queryEnd
    ) {
      return;
    }
    setBookingQueryRange(nextRange);
  }, [
    visibleRange.startDate,
    visibleRange.endDate,
    visibleRange.startStr,
    bookingQueryRange.guardStart,
    bookingQueryRange.guardEnd,
    bookingQueryRange.queryStart,
    bookingQueryRange.queryEnd,
    buildBookingQueryRange
  ]);

  useEffect(() => {
    const cachedInstruments = loadCachedPayload(instrumentCacheKey, MEMBER_CACHE_TTL_MS);
    if (cachedInstruments?.items && Array.isArray(cachedInstruments.items)) {
      setInstruments(cachedInstruments.items);
      setHasLoadedInstruments(true);
    }
    try {
      localStorage.removeItem(`booking_member_bookings:${labName}`);
    } catch {
      // Ignore storage errors.
    }
  }, [instrumentCacheKey, labName]);

  useEffect(() => {
    if (!hasLoadedInstruments || !hasLoadedBookings) return;

    const timer = setTimeout(() => {
      if (scrollTargetRef.current) {
        scrollTargetRef.current.scrollIntoView({ behavior: 'auto', block: 'start' });
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [selectedInstrumentId, viewMode, overviewInstrumentIds, hasLoadedInstruments, hasLoadedBookings, selectedDateStr]);

  useEffect(() => {
    setHasCalendarScrolled(false);
  }, [selectedInstrumentId, viewMode, selectedDateStr]);

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
    const requestBookingRefresh = () => {
      if (!hasLoadedBookings) return;
      setHasLoadedBookings(false);
      setIsSyncingBookings(true);
      setBookingRefreshToken((prev) => prev + 1);
    };

    const handlePageShow = () => {
      requestBookingRefresh();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      requestBookingRefresh();
    };

    window.addEventListener('pageshow', handlePageShow);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [hasLoadedBookings]);

  useEffect(() => {
    setIsSyncingInstruments(true);
    const instrumentQuery = query(
      collection(db, 'artifacts', appId, 'public', 'data', 'instruments'),
      where('labName', '==', labName)
    );
    const unsubInst = onSnapshot(
      instrumentQuery,
      (snapshot) => {
        setInstruments((prev) => measurePerf(
          'member.instruments.applyDocChanges',
          () => applyDocChanges(prev, snapshot.docChanges()),
          { changes: snapshot.docChanges().length }
        ));
        setHasLoadedInstruments(true);
        setIsSyncingInstruments(false);
      },
      () => {
        setHasLoadedInstruments(true);
        setIsSyncingInstruments(false);
        pushToast('Unable to load instruments right now.', 'error');
      }
    );
    return () => { unsubInst(); };
  }, [labName, pushToast]);

  useEffect(() => {
    setIsSyncingBookings(true);
    const bookingQuery = query(
      collection(db, 'artifacts', appId, 'public', 'data', 'bookings'),
      where('labName', '==', labName),
      where('date', '>=', bookingQueryRange.queryStart),
      where('date', '<=', bookingQueryRange.queryEnd)
    );
    const unsubBook = onSnapshot(
      bookingQuery,
      (snapshot) => {
        setBookings((prev) => measurePerf(
          'member.bookings.applyDocChanges',
          () => applyDocChanges(prev, snapshot.docChanges()),
          { changes: snapshot.docChanges().length }
        ));
        setHasLoadedBookings(true);
        setIsSyncingBookings(false);
      },
      () => {
        setHasLoadedBookings(true);
        setIsSyncingBookings(false);
        pushToast('Unable to load bookings right now.', 'error');
      }
    );
    return () => { unsubBook(); };
  }, [labName, bookingQueryRange.queryEnd, bookingQueryRange.queryStart, pushToast, bookingRefreshToken]);

  useEffect(() => {
    setHasHydratedPinned(false);
    try {
      const key = `booking_pinned_instruments:${labName}:${userName}`;
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      setPinnedInstrumentIds(Array.isArray(parsed) ? parsed : []);
    } catch {
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
    } catch {
      // Ignore storage errors in private mode / restricted environments.
    }
  }, [labName, userName, pinnedInstrumentIds, hasHydratedPinned]);

  useEffect(() => () => {
    if (selectionModalLaunchTimerRef.current) {
      window.clearTimeout(selectionModalLaunchTimerRef.current);
      selectionModalLaunchTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedInstruments) return;
    saveCachedPayload(instrumentCacheKey, { items: instruments });
  }, [hasLoadedInstruments, instrumentCacheKey, instruments]);

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

  const instrumentNameById = useMemo(() => {
    const map = {};
    instruments.forEach((instrument) => {
      map[instrument.id] = instrument.name;
    });
    return map;
  }, [instruments]);

  const getFallbackAggregateState = useCallback((instrumentId, dateStr, hour) => {
    const slots = bookingsByInstrumentSlot.get(getInstSlotKey(instrumentId, dateStr, hour)) || [];
    return {
      usedQuantity: slots.reduce((sum, booking) => sum + (Number(booking.requestedQuantity) || 1), 0),
      bookingCount: slots.length
    };
  }, [bookingsByInstrumentSlot]);

  const getAggregateDocRef = useCallback((instrumentId, dateStr, hour) => (
    doc(
      db,
      'artifacts',
      appId,
      'public',
      'data',
      BOOKING_AGGREGATE_COLLECTION,
      buildAggregateDocId(labName, instrumentId, dateStr, hour)
    )
  ), [labName]);

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

  const getBlockingBookings = useCallback((instrumentId, dateStr, hour) => {
    const enemyIds = conflictIdsByInstrument[instrumentId];
    if (!enemyIds || enemyIds.size === 0) return [];
    const sameSlotBookings = bookingsBySlot.get(getSlotKey(dateStr, hour)) || [];
    return sameSlotBookings.filter((b) => enemyIds.has(b.instrumentId));
  }, [conflictIdsByInstrument, bookingsBySlot]);

  const findConflicts = useCallback(({ instrument, requestedQty, slots }) => {
    const conflicts = [];

    slots.forEach((slot) => {
      const ownBookings = bookingsByInstrumentSlot.get(getInstSlotKey(instrument.id, slot.date, slot.hour)) || [];
      const currentLoad = ownBookings.reduce((sum, b) => sum + (Number(b.requestedQuantity) || 1), 0);
      const blockingBookings = getBlockingBookings(instrument.id, slot.date, slot.hour);

      if (currentLoad + Number(requestedQty) > (instrument.maxCapacity || 1)) {
        conflicts.push(`${slot.date} ${formatHour(slot.hour)} (Full)`);
      }
      if (blockingBookings.length > 0) {
        const blockingDetails = summarizeBlockingBookings(blockingBookings);
        conflicts.push(`${slot.date} ${formatHour(slot.hour)} (${blockingDetails.labelPrefix})`);
      }
    });

    return conflicts;
  }, [bookingsByInstrumentSlot, getBlockingBookings]);

  const getBlockingHintsForDate = useCallback((instrumentId, dateStr) => {
    const enemyIds = conflictIdsByInstrument[instrumentId];
    if (!enemyIds || enemyIds.size === 0) return {};

    const hints = {};
    let hour = 0;

    while (hour < 24) {
      const startBlockers = getBlockingBookings(instrumentId, dateStr, hour);
      const startDetails = summarizeBlockingBookings(startBlockers);

      if (!startDetails.instrumentsText) {
        hour += 1;
        continue;
      }

      const signature = startDetails.signature;
      const start = hour;
      let end = hour + 1;

      while (end < 24) {
        const nextBlockers = getBlockingBookings(instrumentId, dateStr, end);
        const nextDetails = summarizeBlockingBookings(nextBlockers);
        if (nextDetails.signature !== signature) break;
        end += 1;
      }

      const label = startDetails.labelPrefix;
      for (let h = start; h < end; h++) hints[h] = { label, isStart: h === start };
      hour = end;
    }

    return hints;
  }, [conflictIdsByInstrument, getBlockingBookings]);

  const dayMetricInstrumentIds = useMemo(() => {
    if (selectedInstrumentId) return viewMode === 'day' ? [selectedInstrumentId] : [];
    if (overviewInstrumentIds.length === 0) return [];
    return overviewInstrumentIds;
  }, [selectedInstrumentId, viewMode, overviewInstrumentIds]);

  const blockingHintsByInstrumentForDate = useMemo(() => {
    const map = {};
    dayMetricInstrumentIds.forEach((instrumentId) => {
      map[instrumentId] = getBlockingHintsForDate(instrumentId, selectedDateStr);
    });
    return map;
  }, [dayMetricInstrumentIds, selectedDateStr, getBlockingHintsForDate]);
  const weekDays = useMemo(() => {
    const monday = getMonday(date);
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(monday);
      day.setDate(monday.getDate() + index);
      return day;
    });
  }, [date]);

  const daySlotMetricsByInstrument = useMemo(() => {
    if (dayMetricInstrumentIds.length === 0) return {};
    const map = {};
    dayMetricInstrumentIds.forEach((instrumentId) => {
      const hourMap = {};
      for (let hour = 0; hour < 24; hour += 1) {
        const slots = bookingsByInstrumentSlot.get(getInstSlotKey(instrumentId, selectedDateStr, hour)) || [];
        const totalUsed = slots.reduce((sum, booking) => sum + (Number(booking.requestedQuantity) || 1), 0);
        const isMine = slotBelongsToCurrentUser(slots);
        const primarySlot = getPrimarySlot(slots, userName);
        const overflowCount = getOverflowCount(slots);
        const blockHint = blockingHintsByInstrumentForDate[instrumentId]?.[hour];
        const isBlocked = Boolean(blockHint) && !isMine;
        const isPast = isSlotInPast(selectedDateStr);
        hourMap[hour] = { slots, totalUsed, isMine, primarySlot, overflowCount, blockHint, isBlocked, isPast };
      }
      map[instrumentId] = hourMap;
    });
    return map;
  }, [dayMetricInstrumentIds, bookingsByInstrumentSlot, selectedDateStr, slotBelongsToCurrentUser, blockingHintsByInstrumentForDate, currentWeekStartStr]);

  const weeklySlotMetrics = useMemo(() => {
    if (!currentInst || viewMode !== 'week') return new Map();
    const map = new Map();

    weekDays.forEach((day) => {
      const dateStr = getFormattedDate(day);
      const blockingHintsForDay = getBlockingHintsForDate(currentInst.id, dateStr);
      for (let hour = 0; hour < 24; hour += 1) {
        const slots = bookingsByInstrumentSlot.get(getInstSlotKey(currentInst.id, dateStr, hour)) || [];
        const totalUsed = slots.reduce((sum, booking) => sum + (Number(booking.requestedQuantity) || 1), 0);
        const isMine = slotBelongsToCurrentUser(slots);
        const primarySlot = getPrimarySlot(slots, userName);
        const overflowCount = getOverflowCount(slots);
        const blockHint = blockingHintsForDay[hour];
        const isBlocked = Boolean(blockHint) && !isMine;
        const isBlockStart = isBlocked && Boolean(blockHint?.isStart);
        const isPast = isSlotInPast(dateStr);

        map.set(getSlotKey(dateStr, hour), {
          dateStr,
          slots,
          totalUsed,
          isMine,
          primarySlot,
          overflowCount,
          blockLabel: blockHint?.label || '',
          isBlocked,
          isBlockStart,
          isPast
        });
      }
    });

    return map;
  }, [currentInst, viewMode, weekDays, bookingsByInstrumentSlot, slotBelongsToCurrentUser, getBlockingHintsForDate, currentWeekStartStr]);

  const handleConfirmBooking = async (repeatCount, isFullDay, _subOption, isOvernight, isWorkingHours, requestedQty) => {
    if (!bookingModal.instrument) return;
    setIsBookingProcess(true);
    const { date: startDateStr, hour: startHour, instrument } = bookingModal;
    const requestedQuantity = Math.max(1, Number(requestedQty) || 1);
    const newSlots = buildBookingSlots({ startDateStr, startHour, repeatCount, isFullDay, isOvernight, isWorkingHours });
    const bookingToken = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const bookingGroupId = (isFullDay || isOvernight || isWorkingHours || repeatCount > 0) ? `GRP-${bookingToken}` : null;
    const firstPastSlot = newSlots.find((slot) => isSlotInPast(slot.date));
    const conflicts = findConflicts({ instrument, requestedQty: requestedQuantity, slots: newSlots });
    const conflictingInstrumentIds = Array.from(conflictIdsByInstrument[instrument.id] || []);

    if (firstPastSlot) {
      pushToast(`Cannot book before current week start (${currentWeekStartStr}).`, 'warning', 4400);
      setIsBookingProcess(false);
      return;
    }

    if (conflicts.length > 0) {
      pushToast(`Conflict detected: ${conflicts[0]}`, 'warning', 4400);
      setIsBookingProcess(false);
      return;
    }

    try {
      await measurePerfAsync(
        'member.booking.transaction.create',
        () => runTransaction(db, async (transaction) => {
          const instrumentRef = doc(db, 'artifacts', appId, 'public', 'data', 'instruments', instrument.id);
          const instrumentSnap = await transaction.get(instrumentRef);
          if (!instrumentSnap.exists()) {
            const missingError = new Error('Instrument no longer exists.');
            missingError.code = 'BOOKING_INSTRUMENT_MISSING';
            throw missingError;
          }

          const liveInstrument = instrumentSnap.data() || {};
          const liveCapacity = Math.max(1, Number(liveInstrument.maxCapacity ?? instrument.maxCapacity ?? 1));
          const liveConflictInstrumentIds = new Set([
            ...(Array.isArray(liveInstrument.conflicts) ? liveInstrument.conflicts : []),
            ...conflictingInstrumentIds
          ]);
          const aggregateStateCache = new Map();

          const getTransactionAggregateState = async (instrumentId, dateStr, hour) => {
            const cacheKey = getInstSlotKey(instrumentId, dateStr, hour);
            const cached = aggregateStateCache.get(cacheKey);
            if (cached) return cached;

            const aggregateRef = getAggregateDocRef(instrumentId, dateStr, hour);
            const aggregateSnap = await transaction.get(aggregateRef);
            const fallbackState = getFallbackAggregateState(instrumentId, dateStr, hour);
            const normalized = normalizeAggregateState(
              aggregateSnap.exists() ? aggregateSnap.data() : null,
              fallbackState
            );
            const state = {
              ref: aggregateRef,
              instrumentId,
              date: dateStr,
              hour,
              usedQuantity: normalized.usedQuantity,
              bookingCount: normalized.bookingCount
            };
            aggregateStateCache.set(cacheKey, state);
            return state;
          };

          for (const slot of newSlots) {
            const ownState = await getTransactionAggregateState(instrument.id, slot.date, slot.hour);
            if (ownState.usedQuantity + requestedQuantity > liveCapacity) {
              const fullError = new Error(`${slot.date} ${formatHour(slot.hour)} (Full)`);
              fullError.code = 'BOOKING_CAPACITY';
              throw fullError;
            }

            for (const conflictInstrumentId of liveConflictInstrumentIds) {
              if (!conflictInstrumentId || conflictInstrumentId === instrument.id) continue;
              const conflictState = await getTransactionAggregateState(conflictInstrumentId, slot.date, slot.hour);
              if (conflictState.usedQuantity <= 0) continue;

              const blockingBookings = getBlockingBookings(instrument.id, slot.date, slot.hour);
              const summary = summarizeBlockingBookings(blockingBookings);
              const conflictLabel = summary.instrumentsText
                ? summary.labelPrefix
                : `Conflict: ${(instrumentNameById[conflictInstrumentId] || 'another instrument')} is booked`;
              const conflictError = new Error(`${slot.date} ${formatHour(slot.hour)} (${conflictLabel})`);
              conflictError.code = 'BOOKING_CONFLICT';
              throw conflictError;
            }
          }

          for (const slot of newSlots) {
            const ownState = await getTransactionAggregateState(instrument.id, slot.date, slot.hour);
            ownState.usedQuantity += requestedQuantity;
            ownState.bookingCount += 1;
            transaction.set(
              ownState.ref,
              {
                labName,
                instrumentId: instrument.id,
                date: slot.date,
                hour: slot.hour,
                usedQuantity: ownState.usedQuantity,
                bookingCount: ownState.bookingCount,
                updatedAt: serverTimestamp()
              },
              { merge: true }
            );

            const bookingRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'));
            transaction.set(bookingRef, {
              labName,
              instrumentId: instrument.id,
              instrumentName: instrument.name,
              date: slot.date,
              hour: slot.hour,
              userName,
              authUid: auth.currentUser?.uid || null,
              requestedQuantity,
              bookingGroupId,
              createdAt: serverTimestamp()
            });
          }
        }),
        {
          slots: newSlots.length,
          repeatCount,
          mode: isWorkingHours ? 'working_hours' : isFullDay ? 'full_day' : isOvernight ? 'overnight' : 'hourly'
        }
      );
      await addAuditLog(labName, 'BOOKING', `Booked: ${instrument.name} (${requestedQuantity} qty)`, userName);
      setBookingModal({ ...bookingModal, isOpen: false });
      pushToast('Booking confirmed.', 'success');
    } catch (error) {
      if (error?.code === 'BOOKING_CONFLICT' || error?.code === 'BOOKING_CAPACITY') {
        pushToast(`Conflict detected: ${error.message}`, 'warning', 4400);
      } else {
        pushToast('Booking failed. Please try again.', 'error');
      }
    } finally {
      setIsBookingProcess(false);
    }
  };

  const cancelBookingTargets = useCallback(async (targets) => {
    if (!Array.isArray(targets) || targets.length === 0) return 0;
    return measurePerfAsync(
      'member.booking.transaction.cancel',
      () => runTransaction(db, async (transaction) => {
        const uniqueRefsByPath = new Map();
        targets.forEach((target) => {
          if (!target?.ref?.path) return;
          uniqueRefsByPath.set(target.ref.path, target.ref);
        });
        const bookingRefs = Array.from(uniqueRefsByPath.values());
        if (bookingRefs.length === 0) return 0;

        // Phase A: read all target booking docs first.
        const bookingSnaps = await Promise.all(bookingRefs.map((bookingRef) => transaction.get(bookingRef)));
        const existingBookings = bookingSnaps
          .filter((bookingSnap) => bookingSnap.exists())
          .map((bookingSnap) => ({ ref: bookingSnap.ref, booking: bookingSnap.data() || {} }));
        if (existingBookings.length === 0) return 0;

        // Phase B: compute aggregate deltas from valid booking records only.
        const { deltas, malformedCount } = buildCancellationDeltasBySlot(
          existingBookings.map(({ booking }) => booking)
        );
        if (malformedCount > 0) {
          console.warn(`Skipped aggregate updates for ${malformedCount} malformed booking record(s) during cancellation.`);
        }
        const aggregateEntries = Array.from(deltas.values()).map((delta) => {
          const aggregateRef = getAggregateDocRef(delta.instrumentId, delta.date, delta.hour);
          return { delta, aggregateRef };
        });

        // Read all aggregate docs before any writes.
        const aggregateSnaps = await Promise.all(
          aggregateEntries.map(async ({ delta, aggregateRef }) => ({
            delta,
            aggregateRef,
            snapshot: await transaction.get(aggregateRef)
          }))
        );

        const aggregateNextStates = aggregateSnaps.map(({ delta, aggregateRef, snapshot }) => {
          const fallbackState = getFallbackAggregateState(delta.instrumentId, delta.date, delta.hour);
          const normalized = normalizeAggregateState(
            snapshot.exists() ? snapshot.data() : null,
            fallbackState
          );
          return {
            aggregateRef,
            instrumentId: delta.instrumentId,
            date: delta.date,
            hour: delta.hour,
            usedQuantity: Math.max(0, normalized.usedQuantity - delta.usedDelta),
            bookingCount: Math.max(0, normalized.bookingCount - delta.bookingDelta)
          };
        });

        // Phase C: write-only.
        existingBookings.forEach(({ ref }) => {
          transaction.delete(ref);
        });

        aggregateNextStates.forEach((state) => {
          if (state.bookingCount === 0 || state.usedQuantity === 0) {
            transaction.delete(state.aggregateRef);
            return;
          }
          transaction.set(
            state.aggregateRef,
            {
              labName,
              instrumentId: state.instrumentId,
              date: state.date,
              hour: state.hour,
              usedQuantity: state.usedQuantity,
              bookingCount: state.bookingCount,
              updatedAt: serverTimestamp()
            },
            { merge: true }
          );
        });

        return existingBookings.length;
      }),
      { targets: targets.length }
    );
  }, [getAggregateDocRef, getFallbackAggregateState, labName]);

  const handleDeleteBooking = async () => {
    if (!bookingToDelete) return;

    try {
      if (bookingToDelete.bookingGroupId) {
        // Prefer already-loaded bookings for batch cancellation to avoid query/index edge cases.
        let targets = bookings
          .filter((booking) => booking.bookingGroupId === bookingToDelete.bookingGroupId)
          .filter((booking) => booking.labName === labName)
          .filter((booking) => canCurrentUserDeleteBooking(booking))
          .map((booking) => ({ ref: getBookingDocRef(booking.id) }));

        if (targets.length === 0 && bookingToDelete.__legacyOwnerAssumption) {
          targets = bookings
            .filter((booking) => booking.bookingGroupId === bookingToDelete.bookingGroupId)
            .filter((booking) => booking.labName === labName)
            .filter((booking) => {
              const bookingUserNameNormalized = normalizeUserLabel(booking.userName);
              const currentUserNameNormalized = normalizeUserLabel(userName);
              if (bookingUserNameNormalized && currentUserNameNormalized && bookingUserNameNormalized !== currentUserNameNormalized) return false;
              const ownerUid = typeof booking.authUid === 'string' && booking.authUid.length > 0 ? booking.authUid : null;
              if (ownerUid && activeAuthUid && ownerUid !== activeAuthUid) return false;
              return true;
            })
            .map((booking) => ({ ref: getBookingDocRef(booking.id) }));
        }

        // Fallback: if cache window misses linked slots, fetch by bookingGroupId.
        if (targets.length === 0) {
          const groupQuery = query(
            collection(db, 'artifacts', appId, 'public', 'data', 'bookings'),
            where('bookingGroupId', '==', bookingToDelete.bookingGroupId)
          );
          const snapshot = await getDocs(groupQuery);
          const fromOwnedIdentity = snapshot.docs
            .filter((bookingDoc) => bookingDoc.data()?.labName === labName)
            .filter((bookingDoc) => canCurrentUserDeleteBooking(bookingDoc.data()))
            .map((bookingDoc) => ({ ref: bookingDoc.ref }));
          targets = fromOwnedIdentity;

          if (targets.length === 0 && bookingToDelete.__legacyOwnerAssumption) {
            targets = snapshot.docs
              .filter((bookingDoc) => bookingDoc.data()?.labName === labName)
              .filter((bookingDoc) => {
                const data = bookingDoc.data() || {};
                const bookingUserNameNormalized = normalizeUserLabel(data.userName);
                const currentUserNameNormalized = normalizeUserLabel(userName);
                if (bookingUserNameNormalized && currentUserNameNormalized && bookingUserNameNormalized !== currentUserNameNormalized) return false;
                const ownerUid = typeof data.authUid === 'string' && data.authUid.length > 0 ? data.authUid : null;
                if (ownerUid && activeAuthUid && ownerUid !== activeAuthUid) return false;
                return true;
              })
              .map((bookingDoc) => ({ ref: bookingDoc.ref }));
          }
        }

        const cancelledCount = await cancelBookingTargets(targets);
        if (cancelledCount === 0) {
          pushToast('No active slots found for this batch booking.', 'warning');
        } else {
          await addAuditLog(labName, 'CANCEL_BATCH', `Batch cancel: ${bookingToDelete.instrumentName}`, userName);
          pushToast('Batch booking cancelled.', 'success');
        }
      } else {
        const bookingRef = getBookingDocRef(bookingToDelete.id);
        const cancelledCount = await cancelBookingTargets([{ ref: bookingRef }]);
        if (cancelledCount === 0) {
          pushToast('Booking already removed.', 'warning');
        } else {
          await addAuditLog(labName, 'CANCEL', `Cancelled: ${bookingToDelete.instrumentName}`, userName);
          pushToast('Booking cancelled.', 'success');
        }
      }

      setBookingToDelete(null);
    } catch (error) {
      console.error('Booking cancellation failed', {
        code: error?.code || 'unknown',
        message: error?.message || 'unknown',
        bookingId: bookingToDelete?.id || null,
        bookingGroupId: bookingToDelete?.bookingGroupId || null
      }, error);

      if (error?.code === 'permission-denied') {
        pushToast('Cancellation was blocked by Firestore rules. Deploy updated rules and try again.', 'error');
      } else if (error?.code === 'aborted') {
        pushToast('Cancellation hit a temporary sync conflict. Please try again.', 'error');
      } else if (error?.code === 'failed-precondition') {
        pushToast('Cancellation requires a missing Firestore index or rules update.', 'error');
      } else {
        pushToast('Unable to cancel booking. Please try again.', 'error');
      }
    }
  };

  const handleSaveNote = async ({ message, instrumentId }) => {
    const trimmedMessage = String(message || '').trim();
    if (!trimmedMessage) return;

    const targetInstrumentId = instrumentId || selectedInstrumentId || '';
    const inst = instruments.find((i) => i.id === targetInstrumentId);
    if (!inst) {
      pushToast('Please select an instrument.', 'warning');
      return;
    }

    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'notes'), {
        labName,
        instrumentId: inst.id,
        instrumentName: inst.name,
        userName,
        message: trimmedMessage,
        timestamp: serverTimestamp()
      });
      setShowNoteModal(false);
      pushToast('Report sent.', 'success');
    } catch {
      pushToast('Unable to send report. Please try again.', 'error');
    }
  };

  const overviewInstruments = useMemo(() => {
    const selectedSet = new Set(overviewInstrumentIds);
    const pinnedSet = new Set(pinnedInstrumentIds);
    return instruments
      .filter((inst) => selectedSet.has(inst.id))
      .sort((a, b) => {
        const ap = pinnedSet.has(a.id) ? 0 : 1;
        const bp = pinnedSet.has(b.id) ? 0 : 1;
        if (ap !== bp) return ap - bp;
        return a.name.localeCompare(b.name);
      });
  }, [instruments, overviewInstrumentIds, pinnedInstrumentIds]);
  const dateNavigationLabel = useMemo(() => {
    if (viewMode === 'day' || !selectedInstrumentId) {
      return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }
    return `${weekDays[0].getMonth() + 1}/${weekDays[0].getDate()} - ${weekDays[6].getMonth() + 1}/${weekDays[6].getDate()}`;
  }, [date, weekDays, viewMode, selectedInstrumentId]);

  const closeSelectionModal = useCallback(() => {
    if (selectionModalLaunchTimerRef.current) {
      window.clearTimeout(selectionModalLaunchTimerRef.current);
      selectionModalLaunchTimerRef.current = null;
    }
    setIsLaunchingSelectionFromFab(false);
    setSelectionModalLaunchSource('default');
    setShowSelectionModal(false);
  }, []);

  const openSelectionModal = useCallback((source = 'default') => {
    if (selectionModalLaunchTimerRef.current) {
      window.clearTimeout(selectionModalLaunchTimerRef.current);
      selectionModalLaunchTimerRef.current = null;
    }

    if (source === 'fab') {
      setSelectionModalLaunchSource('fab');
      setIsLaunchingSelectionFromFab(true);
      selectionModalLaunchTimerRef.current = window.setTimeout(() => {
        setIsLaunchingSelectionFromFab(false);
        setShowSelectionModal(true);
        selectionModalLaunchTimerRef.current = null;
      }, 90);
      return;
    }

    setSelectionModalLaunchSource('default');
    setShowSelectionModal(true);
  }, []);

  const handleApplySelection = (ids) => {
    const nextIds = ids || [];
    setOverviewInstrumentIds(nextIds);
    setSelectedInstrumentId(nextIds.length === 1 ? nextIds[0] : null);
    closeSelectionModal();
  };

  const handleTogglePinnedInstrument = (instrumentId) => {
    setPinnedInstrumentIds((prev) => (
      prev.includes(instrumentId)
        ? prev.filter((id) => id !== instrumentId)
        : [instrumentId, ...prev]
    ));
  };

  const isCalendarLoading = !hasLoadedInstruments || !hasLoadedBookings;
  const hasAnyInstrumentSelection = selectedInstrumentId || overviewInstruments.length > 0;
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
    isPast,
    blockLabel,
    primarySlot,
    overflowCount
  }) => {
    const timeLabel = `${formatHour(hour)} on ${dateStr}`;
    if (isPast) {
      return `${instrumentName}, ${timeLabel}. Previous week slot. Booking disabled.`;
    }
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

  const buildModalSlots = useCallback(({ repeatOption, isFullDay, isOvernight, isWorkingHours }) => {
    if (!bookingModal.date) return [];
    return buildBookingSlots({
      startDateStr: bookingModal.date,
      startHour: bookingModal.hour,
      repeatCount: repeatOption,
      isFullDay,
      isOvernight,
      isWorkingHours
    });
  }, [bookingModal.date, bookingModal.hour]);

  const getQuantityLimitForModal = useCallback(({ repeatOption, isFullDay, isOvernight, isWorkingHours }) => {
    if (!bookingModal.instrument) return { maxAllowed: 1 };
    const capacity = bookingModal.instrument.maxCapacity || 1;
    const slots = buildModalSlots({ repeatOption, isFullDay, isOvernight, isWorkingHours });
    if (slots.length === 0) return { maxAllowed: capacity };

    const minRemaining = slots.reduce((acc, slot) => {
      const used = (bookingsByInstrumentSlot.get(getInstSlotKey(bookingModal.instrument.id, slot.date, slot.hour)) || [])
        .reduce((sum, booking) => sum + (Number(booking.requestedQuantity) || 1), 0);
      return Math.min(acc, Math.max(0, capacity - used));
    }, capacity);

    return { maxAllowed: minRemaining };
  }, [bookingModal.instrument, buildModalSlots, bookingsByInstrumentSlot]);

  const getConflictPreviewForModal = useCallback(({ repeatOption, isFullDay, isOvernight, isWorkingHours, quantity }) => {
    if (!bookingModal.instrument) return { count: 0, first: '' };
    const slots = buildModalSlots({ repeatOption, isFullDay, isOvernight, isWorkingHours });
    const conflicts = findConflicts({ instrument: bookingModal.instrument, requestedQty: quantity, slots });
    return { count: conflicts.length, first: conflicts[0] || '' };
  }, [bookingModal.instrument, buildModalSlots, findConflicts]);

  return (
    <div className="flex flex-col h-screen ds-page font-sans text-slate-900 overflow-hidden text-sm ds-animate-enter-fast">
      <div className={`flex-none z-50 bg-white/92 backdrop-blur border-b border-[var(--ds-border)] ds-topbar-shell ${hasCalendarScrolled ? 'ds-topbar-scrolled' : ''}`}>
          <header className="px-4 pt-3 pb-2 border-b border-slate-200/60">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="mt-0.5 min-w-0">
                  <h1 className="font-black text-lg leading-tight text-[var(--ds-text-strong)] truncate">{labName}</h1>
                </div>
                <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                  <span className="ds-chip ds-chip-brand text-[11px] shrink-0">
                    <ShieldCheck className="w-3 h-3" /> {userName}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowNoteModal(true)}
                    aria-label={currentInst ? `Report an issue for ${currentInst.name}` : 'Report an issue'}
                    className="ds-fab-report px-2.5 py-1.5 text-[11px] rounded-full inline-flex items-center gap-1.5 shrink-0"
                  >
                    <StickyNote className="w-3.5 h-3.5" />
                    Report issue
                  </button>
                </div>
              </div>
                <button
                  type="button"
                  onClick={onLogout}
                  aria-label="Sign out"
                  className="p-2.5 text-slate-500 bg-slate-100/75 rounded-full ds-transition hover:bg-slate-200/70"
                >
                  <LogOut className="w-5 h-5" />
                </button>
            </div>
          </header>
          <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-200/60">
             {selectedInstrumentId ? (
               <div className="flex ds-glass-inline rounded-lg p-1">
                 <button type="button" aria-label="Switch to day view" aria-pressed={viewMode === 'day'} onClick={()=>setViewMode('day')} className={`px-2.5 py-1.5 rounded-md text-xs font-bold ds-transition ${viewMode==='day'?'bg-white text-[#00407a]':'text-slate-500 hover:text-slate-700'}`}><LayoutGrid className="w-4 h-4"/></button>
                 <button type="button" aria-label="Switch to week view" aria-pressed={viewMode === 'week'} onClick={()=>setViewMode('week')} className={`px-2.5 py-1.5 rounded-md text-xs font-bold ds-transition ${viewMode==='week'?'bg-white text-[#00407a]':'text-slate-500 hover:text-slate-700'}`}><CalendarDays className="w-4 h-4"/></button>
               </div>
             ) : (
               <div className="flex ds-glass-inline rounded-lg p-1 opacity-70" aria-label="View mode switch unavailable until an instrument is selected">
                 <button
                   type="button"
                   disabled
                   aria-label="Day view unavailable"
                   className="px-2.5 py-1.5 rounded-md text-xs font-bold text-slate-400 cursor-not-allowed"
                 >
                   <LayoutGrid className="w-4 h-4" />
                 </button>
                 <button
                   type="button"
                   disabled
                   aria-label="Week view unavailable"
                   className="px-2.5 py-1.5 rounded-md text-xs font-bold text-slate-400 cursor-not-allowed"
                 >
                   <CalendarDays className="w-4 h-4" />
                 </button>
               </div>
             )}
             <div className="ml-auto flex items-center gap-1.5 rounded-lg ds-glass-inline px-1.5 py-1">
                <button type="button" aria-label={(viewMode === 'day' || !selectedInstrumentId) ? 'Go to previous day' : 'Go to previous week'} onClick={() => setDate(addDays(date, (viewMode === 'day' || !selectedInstrumentId) ? -1 : -7))} className="p-1 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-200/70 ds-transition"><ChevronLeft/></button>
                <span className="min-w-[7.5rem] text-center text-sm font-bold text-slate-700 font-data tabular-nums tracking-tight">
                  {dateNavigationLabel}
                </span>
                <button type="button" aria-label={(viewMode === 'day' || !selectedInstrumentId) ? 'Go to next day' : 'Go to next week'} onClick={() => setDate(addDays(date, (viewMode === 'day' || !selectedInstrumentId) ? 1 : 7))} className="p-1 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-200/70 ds-transition"><ChevronRight/></button>
             </div>
             {(isSyncingInstruments || isSyncingBookings) && (hasLoadedInstruments || hasLoadedBookings) && (
               <span className="text-[10px] text-slate-400 font-medium ml-1" aria-live="polite">Syncing...</span>
             )}
          </div>
      </div>

      <div
        className={`flex-1 relative ${selectedInstrumentId && viewMode === 'week' ? 'overflow-hidden' : 'overflow-y-auto'}`}
        onScroll={selectedInstrumentId && viewMode === 'week' ? undefined : handleCalendarScroll}
      >
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
          <div className="border-y border-slate-200/80 bg-white">
            <div className="flex">
              <div className="w-14 md:w-16 bg-slate-50/95 backdrop-blur border-r sticky left-0 z-20">
                {hours.map((h) => (
                  <div key={h} ref={h === 8 ? scrollTargetRef : null} className={getTimeLabelClass(h)}>
                    <span className={`${isWorkingHour(h) ? 'font-bold' : ''}`}>{h}:00</span>
                  </div>
                ))}
              </div>
              <div className="flex-1">
                {hours.map((h) => (
                  <div
                    key={h}
                    className={`${getSlotCellClass({ hour: h, isBlocked: false, isMine: false, totalUsed: 0, isPast: false })} pointer-events-none select-none`}
                  >
                    <div className="text-[9px] text-slate-300 mt-0.5">Available</div>
                  </div>
                ))}
              </div>
            </div>
            {instruments.length === 0 && (
              <div className="text-center text-sm text-[var(--ds-text-muted)] py-4 px-4 border-t border-slate-200/70">
                No instrument has been added yet. Ask an admin to create instruments first.
              </div>
            )}
          </div>
        )}

        {!isCalendarLoading && !selectedInstrumentId && overviewInstruments.length > 0 && (
           <div className="flex min-w-max border-y border-slate-200/80 bg-white">
               <div className="w-14 md:w-16 bg-slate-50/95 backdrop-blur border-r sticky left-0 z-20">
                <div className="h-9 md:h-10 border-b border-slate-200/65 bg-slate-100/90"></div>
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
                 {overviewInstruments.map((inst) => {
                   const colorStyle = getColorStyle(inst.color);
                   return (
                 <div key={inst.id} className="w-[5.5rem] md:w-24 border-r border-slate-200/80">
                   <div
                     className={`h-9 md:h-10 flex items-center justify-center text-[9px] md:text-[10px] font-extrabold tracking-[0.015em] sticky top-0 z-10 border-b border-slate-200/70 px-1 text-center whitespace-normal break-words leading-tight ds-instrument-header-cell ${colorStyle.text}`}
                     style={{ '--ds-inst-accent': colorStyle.accent }}
                   >
                     {inst.name}
                   </div>
                   {hours.map(h => {
                     const metric = daySlotMetricsByInstrument[inst.id]?.[h] || {};
                     const slots = metric.slots || [];
                     const totalUsed = metric.totalUsed || 0;
                     const isMine = Boolean(metric.isMine);
                     const primarySlot = metric.primarySlot || null;
                     const overflowCount = metric.overflowCount || 0;
                     const blockHint = metric.blockHint;
                     const isBlocked = Boolean(metric.isBlocked);
                     const isPast = Boolean(metric.isPast);
                     const handleActivateSlot = () => {
                       openSlotInteraction({
                         instrument: inst,
                         dateStr: selectedDateStr,
                         hour: h,
                         slots,
                         isBlocked,
                         isPast,
                         blockLabel: blockHint?.label || '',
                         totalUsed
                       });
                     };
                     const slotAriaLabel = getSlotAriaLabel({
                       instrumentName: inst.name,
                       dateStr: selectedDateStr,
                       hour: h,
                       totalUsed,
                       maxCapacity: inst.maxCapacity || 1,
                       isMine,
                       isBlocked,
                       isPast,
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
                         className={getSlotCellClass({ hour: h, isBlocked, isMine, totalUsed, isPast })}
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
                                 isPast,
                                 blockLabel: blockHint.label,
                                 totalUsed
                               });
                             }}
                             className={conflictHintClass}
                           >
                             Conflict
                           </button>
                         )}
                         {primarySlot && (
                           <div className={slotOwnerChipClass(primarySlot.userName)}>
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
                                 isPast,
                                 blockLabel: blockHint?.label || '',
                                 totalUsed
                               });
                             }}
                             className={overflowHintClass}
                           >
                             +{overflowCount} more
                           </button>
                         )}
                         {totalUsed > 0 && <div className="text-[7px] text-slate-300 mt-auto font-data tabular-nums">{totalUsed}/{inst.maxCapacity || 1}</div>}
                       </div>
                     );
                   })}
                 </div>
               )})}
               </div>
           </div>
        )}
        
        {/* VIEW B: SINGLE DAY VIEW */}
        {!isCalendarLoading && selectedInstrumentId && viewMode === 'day' && (
            <div className="border-y border-slate-200/80 bg-white">
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
                const metric = daySlotMetricsByInstrument[selectedInstrumentId]?.[h] || {};
                const slots = metric.slots || [];
                const totalUsed = metric.totalUsed || 0;
                const isMine = Boolean(metric.isMine);
                const primarySlot = metric.primarySlot || null;
                const overflowCount = metric.overflowCount || 0;
                const blockHint = metric.blockHint;
                const isBlocked = Boolean(metric.isBlocked);
                const isPast = Boolean(metric.isPast);
                const handleActivateSlot = () => {
                  openSlotInteraction({
                    instrument: currentInst,
                    dateStr: selectedDateStr,
                    hour: h,
                    slots,
                    isBlocked,
                    isPast,
                    blockLabel: blockHint?.label || '',
                    totalUsed
                  });
                };
                const slotAriaLabel = getSlotAriaLabel({
                  instrumentName: currentInst?.name || 'Instrument',
                  dateStr: selectedDateStr,
                  hour: h,
                  totalUsed,
                  maxCapacity: currentInst?.maxCapacity || 1,
                  isMine,
                  isBlocked,
                  isPast,
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
                         className={getSlotCellClass({ hour: h, isBlocked, isMine, totalUsed, isPast })}
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
                            isPast,
                            blockLabel: blockHint.label,
                            totalUsed
                          });
                        }}
                        className={conflictHintClass}
                      >
                        Conflict
                      </button>
                    )}
                    {primarySlot ? (
                      <>
                        <div className={slotOwnerChipClass(primarySlot.userName)}>{primarySlot.userName} ({primarySlot.requestedQuantity})</div>
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
                                isPast,
                                blockLabel: blockHint?.label || '',
                                totalUsed
                              });
                            }}
                            className={overflowHintClass}
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
          <div className="h-full overflow-auto border-y border-slate-200/70 bg-white" onScroll={handleCalendarScroll}>
            <div className="w-max min-w-[43.75rem] md:min-w-[46rem] min-h-full">
              <div className="sticky top-0 z-40 ml-14 md:ml-16 w-[40.25rem] md:w-[42rem]">
                <div className="grid grid-cols-7 ds-week-header-row">
                  {weekDays.map((d, i) => (
                    <div key={i} className="h-10 md:h-11 border-r border-b border-slate-200/65 flex flex-col items-center justify-center ds-week-header-cell">
                      <div className="text-[8px] text-[#1c7aa0] font-bold tracking-[0.08em] uppercase">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][d.getDay()===0?6:d.getDay()-1]}</div>
                      <div className="text-[13px] md:text-sm font-black text-[#00407a] font-data tabular-nums leading-none mt-0.5">{d.getDate()}</div>
                    </div>
                  ))}
                </div>
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
                      const metric = weeklySlotMetrics.get(getSlotKey(dateStr, hour)) || {};
                      const slots = metric.slots || [];
                      const isMine = Boolean(metric.isMine);
                      const primarySlot = metric.primarySlot || null;
                      const overflowCount = metric.overflowCount || 0;
                      const blockLabel = metric.blockLabel || '';
                      const totalUsed = metric.totalUsed || 0;
                      const isBlocked = Boolean(metric.isBlocked);
                      const isBlockStart = Boolean(metric.isBlockStart);
                      const isPast = Boolean(metric.isPast);
                      const handleActivateSlot = () => {
                        openSlotInteraction({
                          instrument: currentInst,
                          dateStr,
                          hour,
                          slots,
                          isBlocked,
                          isPast,
                          blockLabel,
                          totalUsed
                        });
                      };
                      const slotAriaLabel = getSlotAriaLabel({
                        instrumentName: currentInst?.name || 'Instrument',
                        dateStr,
                        hour,
                        totalUsed,
                        maxCapacity: currentInst?.maxCapacity || 1,
                        isMine,
                        isBlocked,
                        isPast,
                        blockLabel,
                        primarySlot,
                        overflowCount
                      });
                      return (
                        <div key={i} onClick={handleActivateSlot} onKeyDown={(event) => handleKeyboardActivation(event, handleActivateSlot)} role="button" tabIndex={0} aria-label={slotAriaLabel}
                             className={getSlotCellClass({ hour, isBlocked, isMine, totalUsed, isPast })}>
                          {isBlocked && isBlockStart && (
                            <button
                              type="button"
                              title={blockLabel}
                              aria-label={`View conflict details for ${currentInst?.name || 'instrument'} at ${formatHour(hour)} on ${dateStr}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                openSlotDetails({
                                  instrument: currentInst,
                                  dateStr,
                                  hour,
                                  slots,
                                  isBlocked,
                                  isPast,
                                  blockLabel,
                                  totalUsed
                                });
                              }}
                              className={conflictHintClass}
                            >
                              Conflict
                            </button>
                          )}
                          {primarySlot && (
                            <div className={slotOwnerChipClass(primarySlot.userName)}>{primarySlot.userName}</div>
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
                                  isPast,
                                  blockLabel,
                                  totalUsed
                                });
                              }}
                              className={overflowHintClass}
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

        {!showSelectionModal && instruments.length > 0 && (
          <div
            className={`fixed z-40 pointer-events-none ${
              hasAnyInstrumentSelection
                ? 'left-1/2 -translate-x-1/2 bottom-4'
                : 'left-[calc(50%+1.75rem)] md:left-[calc(50%+2rem)] -translate-x-1/2 top-1/2 -translate-y-1/2'
            }`}
          >
            <button
              type="button"
              onClick={() => openSelectionModal(hasAnyInstrumentSelection ? 'fab' : 'default')}
              aria-label="Open overview and instrument selection"
              className={`pointer-events-auto ds-fab-overview rounded-full px-4 py-2.5 inline-flex items-center gap-2.5 ${isLaunchingSelectionFromFab ? 'ds-fab-overview-launch' : ''}`}
            >
              <span className="w-5 h-5 rounded-full bg-[rgba(232,245,251,0.34)] border border-[rgba(140,203,232,0.56)] inline-flex items-center justify-center flex-shrink-0">
                <CircleDot className="w-3.5 h-3.5 text-[#1c7aa0]" />
              </span>
              <span className="text-[13px] font-bold tracking-[0.01em]">Select instruments</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-500 ml-0.5 flex-shrink-0" />
            </button>
          </div>
        )}
      </div>

      <InstrumentSelectionModal
        isOpen={showSelectionModal}
        onClose={closeSelectionModal}
        instruments={instruments}
        isLoading={!hasLoadedInstruments}
        selectedOverviewIds={overviewInstrumentIds}
        pinnedInstrumentIds={pinnedInstrumentIds}
        onTogglePin={handleTogglePinnedInstrument}
        onApply={handleApplySelection}
        launchSource={selectionModalLaunchSource}
      />
      {slotDetails.isOpen && (
        <div className="ds-overlay z-[90]" role="presentation">
          <div className="ds-modal ds-modal-sm ds-modal-liquid ds-section ds-animate-modal" role="dialog" aria-modal="true" aria-labelledby="slot-details-title">
            <h3 id="slot-details-title" className="text-base font-bold text-slate-800">{slotDetails.instrument?.name || 'Slot details'}</h3>
            <p className="text-xs text-slate-500 font-data tabular-nums mt-1">
              {slotDetails.dateStr} at {formatHour(slotDetails.hour)}
            </p>
            {slotDetails.blockLabel && (
              <div className="mt-3 text-[11px] text-amber-700 ds-glass-warning rounded-lg px-2 py-1.5">
                {slotDetails.blockLabel}
              </div>
            )}
            <div className="mt-3 space-y-2 max-h-52 overflow-y-auto">
              {slotDetails.slots.length > 0 ? (
                slotDetails.slots.map((slot, idx) => (
                  <div key={`${slot.userName}-${idx}`} className="ds-card-muted ds-glass-row px-2.5 py-2 flex items-center justify-between">
                    <span className={`text-xs ${slot.userName === userName ? 'text-[#00407a] font-bold' : 'text-slate-700'}`}>
                      {slot.userName}
                    </span>
                    <span className="text-[11px] text-slate-400 font-data tabular-nums">
                      {Number(slot.requestedQuantity) || 1} unit
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-400 ds-glass-row rounded-lg px-2.5 py-2">
                  No direct bookings in this slot.
                </div>
              )}
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={closeSlotDetails} className="flex-1 py-2.5 ds-btn ds-btn-secondary ds-btn-glass">
                Close
              </button>
              {slotDetails.ownedBooking && (
                <button
                  type="button"
                  onClick={() => {
                    const payload = toCancelableBookingPayload(slotDetails.ownedBooking, slotDetails.slots);
                    closeSlotDetails();
                    if (payload) {
                      setBookingToDelete(payload);
                      return;
                    }
                    pushToast('Unable to locate your booking in this slot. Refresh and try again.', 'warning');
                  }}
                  className="flex-1 py-2.5 ds-btn bg-red-500 text-white"
                >
                  Cancel booking
                </button>
              )}
              {!slotDetails.ownedBooking && slotDetails.canBook && (
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
        initialHour={bookingModal.hour}
        instrument={bookingModal.instrument}
        onConfirm={handleConfirmBooking}
        isBooking={isBookingProcess}
        getQuantityLimit={getQuantityLimitForModal}
        getConflictPreview={getConflictPreviewForModal}
      />
      <NoteModal
        isOpen={showNoteModal}
        onClose={() => setShowNoteModal(false)}
        instruments={instruments}
        initialInstrumentId={selectedInstrumentId}
        onSave={handleSaveNote}
      />
      
      {bookingToDelete && (
        <div className="ds-overlay z-[60]" role="presentation">
          <div className="ds-modal ds-modal-sm ds-modal-liquid ds-section ds-animate-modal text-center" role="dialog" aria-modal="true" aria-labelledby="cancel-booking-title">
            <ShieldAlert className="w-12 h-12 text-red-500 mx-auto mb-4"/>
            <h3 id="cancel-booking-title" className="font-black mb-2 text-lg">Cancel booking?</h3>
            {bookingToDelete.bookingGroupId && <p className="text-[10px] text-orange-500 font-bold ds-glass-warning p-2 rounded-lg mb-4">Batch booking detected. Cancelling all linked slots.</p>}
            <div className="flex gap-3 mt-4">
              <button type="button" onClick={()=>setBookingToDelete(null)} className="flex-1 py-3 ds-btn ds-btn-secondary ds-btn-glass">Keep booking</button>
              <button type="button" onClick={handleDeleteBooking} className="flex-1 py-3 ds-btn bg-red-500 text-white">Cancel booking</button>
            </div>
          </div>
        </div>
      )}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};
export default MemberApp;
