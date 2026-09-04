import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  collection, query, where, onSnapshot, doc, serverTimestamp, getDocs, addDoc, runTransaction
} from 'firebase/firestore';
import {
  LogOut, LayoutGrid, ChevronRight, ChevronLeft,
  CalendarDays, ShieldAlert, Flag, Pin
} from 'lucide-react';
import { auth, db, appId, addAuditLog } from '../../api/firebase';
import { getFormattedDate, addDays, getMonday, getColorStyle } from '../../utils/helpers';
import NoteModal from '../modals/NoteModal';
import BookingModal from '../modals/BookingModal';
import InstrumentSelectionModal from '../modals/InstrumentSelectionModal';
import ToastStack from '../common/ToastStack';
import ThemeToggle from '../common/ThemeToggle';
import { useToast } from '../../hooks/useToast';
import {
  buildBookingSlots,
  summarizeBlockingBookings,
  sortSlotsForDisplay,
  getPrimarySlot,
  getOverflowCount,
  buildCancellationDeltasBySlot,
  isBookingOwnedByUser
} from '../../utils/booking';
import { applyDocChanges } from '../../utils/firestore';
import { getArrowTarget, isSlotNavigationKey } from '../../utils/slotNavigation';
import { measurePerf, measurePerfAsync } from '../../utils/perf';

const REPEAT_LOOKAHEAD_DAYS = 24;
const BOOKING_QUERY_BUFFER_DAYS = 14;
const BOOKING_QUERY_GUARD_DAYS = 7;
const BOOKING_AGGREGATE_COLLECTION = 'booking_slot_aggregates';
const MEMBER_CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour warm-start cache for low-volatility data
const DEFAULT_SCROLL_HOUR = 6;

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
  const [streamError, setStreamError] = useState(false); // render-only: subscription health for the toolbar tick
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
  // Render-only minute clock: positions the now-needle, drives nothing else.
  const [clockNow, setClockNow] = useState(() => new Date());
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
  const lastScrollKeyRef = useRef(null);
  // Scrollable calendar column: the arrow-key slot cursor looks up target
  // cells inside it via data-slot-row / data-slot-col.
  const calendarRegionRef = useRef(null);
  // Render-only latch: the full skeleton shows only before the FIRST
  // successful load; later refetches keep the grid and show the sync sweep.
  const hasEverLoadedRef = useRef(false);
  const selectionModalLaunchTimerRef = useRef(null);
  const { toasts, pushToast, dismissToast } = useToast();
  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const selectedDateStr = useMemo(() => getFormattedDate(date), [date]);
  const now = new Date();
  const todayDateStr = getFormattedDate(now);
  const currentWeekStartStr = getFormattedDate(getMonday(now));
  const isToday = selectedDateStr === todayDateStr;
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
  const canCurrentUserDeleteBooking = useCallback((booking) => (
    isBookingOwnedByUser(booking, { userName, authUid: activeAuthUid })
  ), [userName, activeAuthUid]);
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
    return slots.some((slot) => slot.bookingGroupId && ownedBookingGroupIds.has(slot.bookingGroupId));
  }, [canCurrentUserDeleteBooking, ownedBookingGroupIds]);
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
    }
    return null;
  }, [pickCurrentUserBooking, ownedBookingGroupIds, bookings, labName, canCurrentUserDeleteBooking]);
  // Booking lock policy:
  // Allow any slot in current week and future weeks.
  // Block only slots before the current week's Monday.
  const isSlotInPast = (dateStr) => {
    return dateStr < currentWeekStartStr;
  };
  const rowHeightClass = 'h-12 md:h-14';
  const isWorkingHour = (hour) => hour >= 9 && hour < 17;
  // Working hours sit on paper, off-hours (and weekend columns) on the muted band.
  const getHourBandClass = (hour, isWeekend = false) => (
    (!isWeekend && isWorkingHour(hour)) ? 'bg-[var(--ds-surface)]' : 'bg-[var(--ds-surface-muted)]'
  );
  // Hairlines between hours; a stronger rule at each 6-hour mark (06/12/18).
  const getHourBorderClass = (hour) => (
    (hour + 1) % 6 === 0 ? 'border-b border-[var(--ds-rule-strong)]' : 'border-b border-[var(--ds-rule)]'
  );
  const getTimeLabelClass = (hour) => `${rowHeightClass} ${getHourBorderClass(hour)} text-[11px] text-right pr-2 pt-1.5 font-medium font-data-mono tabular-nums tracking-tight ${getHourBandClass(hour)} ${isWorkingHour(hour) ? 'text-[color:var(--ds-text-muted)]' : 'text-[color:var(--ds-text-soft)]'}`;
  const getSlotCellClass = ({ hour, isBlocked, isMine, isPast, isFull = false, isWeekend = false }) => {
    const bandClass = getHourBandClass(hour, isWeekend);
    const stateClass = isPast
      ? 'bg-[var(--ds-surface-muted)] cursor-not-allowed'
      : isBlocked
        ? 'ds-hatch cursor-not-allowed'
        : isMine
          ? 'bg-[var(--ds-brand-100)] border-l-2 border-l-[var(--ds-brand-700)] cursor-pointer'
          : isFull
            ? 'bg-[var(--ds-full-bg)] cursor-pointer'
            : `${bandClass} cursor-pointer`;
    const interactiveClass = (!isPast && !isBlocked) ? 'ds-slot-interactive' : '';
    return `${rowHeightClass} ${getHourBorderClass(hour)} px-1 py-0.5 transition-colors relative overflow-hidden scroll-mt-10 md:scroll-mt-11 ${stateClass} ${interactiveClass}`;
  };
  // Ledger lines, not bubbles: owner is plain truncated ink; yours reads petrol.
  const slotOwnerChipClass = (ownerName) => (
    `block w-full text-left truncate pr-7 text-[11px] md:text-xs leading-tight ${ownerName === userName
      ? 'font-semibold text-[color:var(--ds-brand-700)]'
      : 'font-medium text-[color:var(--ds-text)]'}`
  );
  const conflictHintClass = 'ds-stamp ds-stamp-warning max-w-full truncate text-left mb-0.5';
  const overflowHintClass = 'inline-flex mr-1 text-[11px] font-medium underline text-[color:var(--ds-text-muted)]';
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
      setBookingToDelete(ownedBooking);
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
  }, [openSlotDetails, pushToast, resolveOwnedBookingForSlots]);

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
    // Scroll to the default hour only when the visible calendar changes, not on
    // background refetches (the grid stays mounted while syncing).
    const scrollKey = `${selectedInstrumentId}|${viewMode}|${selectedDateStr}|${overviewInstrumentIds.join(',')}`;

    const timer = setTimeout(() => {
      if (lastScrollKeyRef.current === scrollKey) return;
      lastScrollKeyRef.current = scrollKey;
      if (scrollTargetRef.current) {
        scrollTargetRef.current.scrollIntoView({ behavior: 'auto', block: 'start' });
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [selectedInstrumentId, viewMode, overviewInstrumentIds, hasLoadedInstruments, hasLoadedBookings, selectedDateStr]);

  useEffect(() => {
    setHasCalendarScrolled(false);
  }, [selectedInstrumentId, viewMode, selectedDateStr]);

  // Render-only 60s tick so the now-needle tracks the true minute.
  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);

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
        setStreamError(false);
      },
      (error) => {
        setHasLoadedInstruments(true);
        setIsSyncingInstruments(false);
        setStreamError(true);
        if (error?.code === 'permission-denied') {
          pushToast('Your session is no longer valid. Please sign in again.', 'warning');
          onLogout();
          return;
        }
        pushToast('Unable to load instruments right now.', 'error');
      }
    );
    return () => { unsubInst(); };
  }, [labName, pushToast, onLogout]);

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
        setStreamError(false);
      },
      (error) => {
        setHasLoadedBookings(true);
        setIsSyncingBookings(false);
        setStreamError(true);
        if (error?.code === 'permission-denied') {
          pushToast('Your session is no longer valid. Please sign in again.', 'warning');
          onLogout();
          return;
        }
        pushToast('Unable to load bookings right now.', 'error');
      }
    );
    return () => { unsubBook(); };
  }, [labName, bookingQueryRange.queryEnd, bookingQueryRange.queryStart, pushToast, bookingRefreshToken, onLogout]);

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

  const handleConfirmBooking = async (repeatCount, isFullDay, selectedUnit, isOvernight, isWorkingHours, requestedQty, bookingComment) => {
    if (!bookingModal.instrument) return;
    // Rules require authUid to match the signed-in uid on every booking.
    if (!auth.currentUser?.uid) {
      pushToast('Secure session unavailable. Please refresh and try again.', 'error');
      return;
    }
    setIsBookingProcess(true);
    const { date: startDateStr, hour: startHour, instrument } = bookingModal;
    const requestedQuantity = Math.max(1, Number(requestedQty) || 1);
    const normalizedSelectedUnit = typeof selectedUnit === 'string' ? selectedUnit.trim() : '';
    const normalizedBookingComment = typeof bookingComment === 'string' ? bookingComment.trim() : '';
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
              selectedUnit: normalizedSelectedUnit || null,
              date: slot.date,
              hour: slot.hour,
              userName,
              authUid: auth.currentUser.uid,
              requestedQuantity,
              bookingComment: normalizedBookingComment || null,
              bookingGroupId,
              createdAt: serverTimestamp()
            });
          }
        }),
        {
          slots: newSlots.length,
          repeatCount,
          mode: isWorkingHours ? 'working_hours' : isFullDay ? 'full_day' : isOvernight ? 'overnight' : 'hourly',
          hasUnit: Boolean(normalizedSelectedUnit),
          hasComment: Boolean(normalizedBookingComment)
        }
      );
      await addAuditLog(
        labName,
        'BOOKING',
        `Booked: ${instrument.name}${normalizedSelectedUnit ? ` [${normalizedSelectedUnit}]` : ''} (${requestedQuantity} qty)`,
        userName
      );
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

        const ownedBookings = existingBookings.filter(({ booking }) => (
          booking.labName === labName && canCurrentUserDeleteBooking(booking)
        ));
        if (ownedBookings.length === 0) return 0;
        if (ownedBookings.length !== existingBookings.length) {
          console.warn(`Skipped ${existingBookings.length - ownedBookings.length} non-owned booking(s) during cancellation.`);
        }

        // Phase B: compute aggregate deltas from valid booking records only.
        const { deltas, malformedCount } = buildCancellationDeltasBySlot(
          ownedBookings.map(({ booking }) => booking)
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
        ownedBookings.forEach(({ ref }) => {
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

        return ownedBookings.length;
      }),
      { targets: targets.length }
    );
  }, [canCurrentUserDeleteBooking, getAggregateDocRef, getFallbackAggregateState, labName]);

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

        // Fallback: if cache window misses linked slots, fetch by bookingGroupId.
        // The labName clause keeps the query provable under the security rules.
        if (targets.length === 0) {
          const groupQuery = query(
            collection(db, 'artifacts', appId, 'public', 'data', 'bookings'),
            where('bookingGroupId', '==', bookingToDelete.bookingGroupId),
            where('labName', '==', labName)
          );
          const snapshot = await getDocs(groupQuery);
          const fromOwnedIdentity = snapshot.docs
            .filter((bookingDoc) => bookingDoc.data()?.labName === labName)
            .filter((bookingDoc) => canCurrentUserDeleteBooking(bookingDoc.data()))
            .map((bookingDoc) => ({ ref: bookingDoc.ref }));
          targets = fromOwnedIdentity;
        }

        const cancelledCount = await cancelBookingTargets(targets);
        if (cancelledCount === 0) {
          pushToast('No active slots found for this batch booking.', 'warning');
        } else {
          await addAuditLog(labName, 'CANCEL_BATCH', `Batch cancel: ${bookingToDelete.instrumentName}`, userName);
          pushToast('Batch booking cancelled.', 'success');
        }
      } else {
        if (!canCurrentUserDeleteBooking(bookingToDelete)) {
          pushToast('You can only cancel your own bookings.', 'warning');
          setBookingToDelete(null);
          return;
        }
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
  // Desktop rail lists every instrument in the modal's order: pinned first, then name.
  const railInstruments = useMemo(() => {
    const pinnedSet = new Set(pinnedInstrumentIds);
    return [...instruments].sort((a, b) => {
      const ap = pinnedSet.has(a.id) ? 0 : 1;
      const bp = pinnedSet.has(b.id) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return a.name.localeCompare(b.name);
    });
  }, [instruments, pinnedInstrumentIds]);
  const dateNavigationLabel = useMemo(() => {
    // Display-only reformat: 'WED 03 SEP' for days, '01 SEP – 07 SEP' for weeks.
    const formatDayTicket = (d) => {
      const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
      const month = d.toLocaleDateString('en-US', { month: 'short' });
      return `${weekday} ${String(d.getDate()).padStart(2, '0')} ${month}`.toUpperCase();
    };
    if (viewMode === 'day' || !selectedInstrumentId) {
      return formatDayTicket(date);
    }
    const formatShortTicket = (d) => (
      `${String(d.getDate()).padStart(2, '0')} ${d.toLocaleDateString('en-US', { month: 'short' })}`.toUpperCase()
    );
    return `${formatShortTicket(weekDays[0])} – ${formatShortTicket(weekDays[6])}`;
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

  // Rail rows mirror the selection modal: toggle membership, then "Apply".
  const handleRailToggleInstrument = (instrumentId) => {
    const nextIds = overviewInstrumentIds.includes(instrumentId)
      ? overviewInstrumentIds.filter((id) => id !== instrumentId)
      : [...overviewInstrumentIds, instrumentId];
    handleApplySelection(nextIds);
  };

  // Same as the modal's single-selection Apply ("Open instrument calendar").
  const handleRailOpenInstrument = (instrumentId) => {
    handleApplySelection([instrumentId]);
  };

  const isCalendarLoading = !hasLoadedInstruments || !hasLoadedBookings;
  if (!isCalendarLoading) hasEverLoadedRef.current = true;
  const hasEverLoaded = hasEverLoadedRef.current;
  const showSkeleton = isCalendarLoading && !hasEverLoaded;
  const showGrid = !showSkeleton;
  const isSyncing = isSyncingInstruments || isSyncingBookings;
  const isWeekPane = Boolean(selectedInstrumentId) && viewMode === 'week';
  const weekContainsToday = weekDays.some((day) => getFormattedDate(day) === todayDateStr);
  const nowMinuteOfDay = clockNow.getHours() * 60 + clockNow.getMinutes();
  // Grid rows are h-12 (3rem) / md:h-14 (3.5rem); offsets cover sticky headers.
  const renderNowNeedle = (offsetBaseRem = 0, offsetMdRem = 0) => (
    <>
      <div
        className="ds-now-needle md:hidden"
        aria-hidden="true"
        style={{ top: `calc(${offsetBaseRem}rem + ${nowMinuteOfDay} * (3rem / 60))` }}
      />
      <div
        className="ds-now-needle hidden md:block"
        aria-hidden="true"
        style={{ top: `calc(${offsetMdRem}rem + ${nowMinuteOfDay} * (3.5rem / 60))` }}
      />
    </>
  );
  const hasAnyInstrumentSelection = selectedInstrumentId || overviewInstruments.length > 0;
  const skeletonColumns = selectedInstrumentId ? (viewMode === 'week' ? 7 : 1) : Math.max(overviewInstruments.length, 4);
  const skeletonRows = 12;
  const handleKeyboardActivation = (event, action) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      action();
    }
  };
  // Arrow keys / Home / End move focus between slot cells (the focus-visible
  // ring is the cursor); every other key falls through to activation.
  const handleSlotKeyDown = (event, action, colCount) => {
    if (!isSlotNavigationKey(event.key)) {
      handleKeyboardActivation(event, action);
      return;
    }
    event.preventDefault();
    const cell = event.currentTarget;
    const target = getArrowTarget({
      key: event.key,
      row: cell?.dataset?.slotRow,
      col: cell?.dataset?.slotCol,
      rowCount: hours.length,
      colCount
    });
    if (!target) return;
    const nextCell = calendarRegionRef.current?.querySelector(
      `[data-slot-row="${target.row}"][data-slot-col="${target.col}"]`
    );
    if (nextCell && nextCell !== cell) {
      nextCell.focus({ preventScroll: true });
      nextCell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
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
    <div className="flex flex-col h-screen ds-page font-sans overflow-hidden text-sm ds-animate-enter-fast">
      <div className={`flex-none z-50 ds-topbar-shell ${hasCalendarScrolled ? 'ds-topbar-scrolled' : ''}`}>
          <div className="ds-frame">
          <header className="px-4 pt-3 pb-1.5">
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-base font-bold leading-tight text-[color:var(--ds-text-strong)] truncate min-w-0">{labName}</h1>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[12px] text-[color:var(--ds-text-muted)] truncate max-w-[9rem] sm:max-w-none">{userName} · Member</span>
                <button
                  type="button"
                  onClick={() => setShowNoteModal(true)}
                  aria-label={currentInst ? `Report an issue for ${currentInst.name}` : 'Report an issue'}
                  className="ds-icon-btn-glass shrink-0"
                >
                  <Flag className="w-4 h-4" />
                </button>
                <ThemeToggle />
                <button
                  type="button"
                  onClick={onLogout}
                  aria-label="Sign out"
                  className="w-8 h-8 inline-flex items-center justify-center rounded-[4px] text-[color:var(--ds-text-muted)] hover:bg-[var(--ds-surface-muted)] hover:text-[color:var(--ds-text)] ds-transition shrink-0"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </header>
          <div className="flex items-center gap-2 px-4">
             {selectedInstrumentId ? (
               <div className="flex items-stretch gap-1">
                 <button type="button" aria-label="Switch to day view" aria-pressed={viewMode === 'day'} onClick={()=>setViewMode('day')} className={`ds-tab px-2 py-2 text-[12px] font-semibold inline-flex items-center gap-1.5 ${viewMode==='day' ? 'ds-tab-active' : 'ds-tab-inactive'}`}><LayoutGrid className="w-4 h-4"/><span className="hidden sm:inline">Day</span></button>
                 <button type="button" aria-label="Switch to week view" aria-pressed={viewMode === 'week'} onClick={()=>setViewMode('week')} className={`ds-tab px-2 py-2 text-[12px] font-semibold inline-flex items-center gap-1.5 ${viewMode==='week' ? 'ds-tab-active' : 'ds-tab-inactive'}`}><CalendarDays className="w-4 h-4"/><span className="hidden sm:inline">Week</span></button>
               </div>
             ) : (
               <div className="flex items-stretch gap-1 opacity-60" aria-label="View mode switch unavailable until an instrument is selected">
                 <button
                   type="button"
                   disabled
                   aria-label="Day view unavailable"
                   className="ds-tab ds-tab-inactive px-2 py-2 text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-not-allowed"
                 >
                   <LayoutGrid className="w-4 h-4" /><span className="hidden sm:inline">Day</span>
                 </button>
                 <button
                   type="button"
                   disabled
                   aria-label="Week view unavailable"
                   className="ds-tab ds-tab-inactive px-2 py-2 text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-not-allowed"
                 >
                   <CalendarDays className="w-4 h-4" /><span className="hidden sm:inline">Week</span>
                 </button>
               </div>
             )}
             <div className="ml-auto flex items-center gap-2 min-w-0">
                <span className="inline-flex items-center gap-1.5 shrink-0" aria-live="polite">
                  {isSyncing ? (
                    <>
                      <span className="ds-live-dot ds-live-dot-sync" aria-hidden="true" />
                      <span className="ds-microcaps text-[color:var(--ds-brand-700)] hidden sm:inline">Sync</span>
                    </>
                  ) : streamError ? (
                    <span className="ds-stamp ds-stamp-warning">Offline</span>
                  ) : hasEverLoaded ? (
                    <>
                      <span className="ds-live-dot" aria-hidden="true" />
                      <span className="ds-microcaps text-[color:var(--ds-success-text)] hidden sm:inline">Live</span>
                    </>
                  ) : null}
                </span>
                <div className="flex items-center gap-1">
                  <button type="button" aria-label={(viewMode === 'day' || !selectedInstrumentId) ? 'Go to previous day' : 'Go to previous week'} onClick={() => setDate(addDays(date, (viewMode === 'day' || !selectedInstrumentId) ? -1 : -7))} className="p-2 rounded-[4px] text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] hover:bg-[var(--ds-surface-muted)] ds-transition"><ChevronLeft className="w-4 h-4"/></button>
                  <span className="min-w-[7.5rem] text-center text-[13px] font-medium uppercase text-[color:var(--ds-text-strong)] font-data-mono tabular-nums tracking-tight">
                    {dateNavigationLabel}
                  </span>
                  <button type="button" aria-label={(viewMode === 'day' || !selectedInstrumentId) ? 'Go to next day' : 'Go to next week'} onClick={() => setDate(addDays(date, (viewMode === 'day' || !selectedInstrumentId) ? 1 : 7))} className="p-2 rounded-[4px] text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] hover:bg-[var(--ds-surface-muted)] ds-transition"><ChevronRight className="w-4 h-4"/></button>
                </div>
             </div>
          </div>
          </div>
          <div className={`ds-sync-rule ${isSyncing ? 'ds-sync-rule-active' : ''}`} aria-hidden="true" />
      </div>

      <div className="flex-1 relative min-h-0 overflow-hidden">
        <div className="ds-frame h-full min-h-0 lg:flex lg:flex-row">
        {/* Desktop instrument rail (lg+): persistent stand-in for the selection modal. */}
        <aside
          className="hidden lg:flex lg:flex-col w-60 shrink-0 min-h-0 self-stretch ds-card overflow-hidden lg:ml-4 lg:my-3"
          aria-label="Instruments"
        >
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--ds-rule-strong)]">
            <span className="ds-microcaps text-[color:var(--ds-text-muted)]">Instruments</span>
            <span
              className="ds-ticket font-data"
              title={`${overviewInstrumentIds.length} of ${instruments.length} instruments shown`}
            >
              {overviewInstrumentIds.length}/{instruments.length}
            </span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-[var(--ds-rule)]">
            {!hasLoadedInstruments && (
              <div role="status" aria-live="polite" aria-label="Loading instruments" className="divide-y divide-[var(--ds-rule)]">
                {Array.from({ length: 3 }, (_, index) => (
                  <div key={`rail-skeleton-${index}`} className="flex items-center gap-2 px-3 py-3 animate-pulse" aria-hidden="true">
                    <div className="w-2 h-2 rounded-full bg-[var(--ds-rule-strong)] shrink-0" />
                    <div className="h-3 bg-[var(--ds-surface-muted)] rounded-[2px] flex-1" />
                    <div className="h-3 w-6 bg-[var(--ds-surface-muted)] rounded-[2px] shrink-0" />
                  </div>
                ))}
              </div>
            )}
            {hasLoadedInstruments && instruments.length === 0 && (
              <p className="px-3 py-3 text-[11px] text-[color:var(--ds-text-muted)]">No instruments yet</p>
            )}
            {hasLoadedInstruments && railInstruments.map((inst) => {
              const isSelected = overviewInstrumentIds.includes(inst.id);
              const isPinned = pinnedInstrumentIds.includes(inst.id);
              const isOpenInstrument = selectedInstrumentId === inst.id;
              const accent = getColorStyle(inst.color).accent;
              const toggleRow = () => handleRailToggleInstrument(inst.id);
              return (
                <div
                  key={inst.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  aria-label={`${isSelected ? 'Deselect' : 'Select'} ${inst.name}${isPinned ? ', pinned' : ''}${inst.isUnderMaintenance ? ', under maintenance' : ''}${isOpenInstrument ? ', currently open' : ''}`}
                  onClick={toggleRow}
                  onKeyDown={(event) => handleKeyboardActivation(event, toggleRow)}
                  className={`flex items-center gap-2 px-3 py-2 text-left cursor-pointer ds-transition ${isSelected ? 'ds-glass-choice-active' : 'ds-glass-choice'}`}
                >
                  <span aria-hidden="true" className="w-2 h-2 rounded-full shrink-0 ring-1 ring-[var(--ds-rule-strong)]" style={{ backgroundColor: accent }} />
                  <span className="min-w-0 flex-1 flex items-center gap-1.5">
                    <span className="text-[13px] font-medium leading-tight text-[color:var(--ds-text-strong)] truncate">{inst.name}</span>
                    {inst.isUnderMaintenance && (
                      <span className="ds-stamp ds-stamp-warning shrink-0">Maint</span>
                    )}
                  </span>
                  <span className="text-[11px] font-data tabular-nums text-[color:var(--ds-text-soft)] shrink-0">
                    × {inst.maxCapacity || 1}
                  </span>
                  {isOpenInstrument ? (
                    <span className="ds-stamp ds-stamp-brand shrink-0">Open</span>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRailOpenInstrument(inst.id);
                      }}
                      onKeyDown={(e) => e.stopPropagation()}
                      aria-label={`Open ${inst.name} calendar`}
                      title="Open calendar"
                      className="w-7 h-7 inline-flex items-center justify-center rounded-[4px] shrink-0 text-[color:var(--ds-text-soft)] hover:text-[color:var(--ds-text)] hover:bg-[var(--ds-surface-muted)] ds-transition"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTogglePinnedInstrument(inst.id);
                    }}
                    onKeyDown={(e) => e.stopPropagation()}
                    aria-label={`${isPinned ? 'Unpin' : 'Pin'} ${inst.name}`}
                    aria-pressed={isPinned}
                    title={isPinned ? 'Unpin' : 'Pin to top'}
                    className={`w-7 h-7 inline-flex items-center justify-center rounded-[4px] shrink-0 ds-transition ${isPinned ? 'text-[color:var(--ds-brand-700)] bg-[var(--ds-brand-100)]' : 'text-[color:var(--ds-text-soft)] hover:text-[color:var(--ds-text-muted)]'}`}
                  >
                    <Pin className={`w-3.5 h-3.5 ${isPinned ? 'fill-current' : ''}`} />
                  </button>
                </div>
              );
            })}
          </div>
        </aside>
        <div
          ref={calendarRegionRef}
          className={`min-w-0 lg:flex-1 h-full min-h-0 ${isWeekPane ? 'overflow-hidden flex flex-col' : 'overflow-y-auto'}`}
          onScroll={isWeekPane ? undefined : handleCalendarScroll}
        >
        {/* Single-instrument masthead: accent tick, name, capacity, report. */}
        {currentInst && (
          <div
            className="flex-none flex items-center gap-3 px-4 py-2 bg-[var(--ds-surface)] border-b border-[var(--ds-rule)]"
            style={{ borderTop: `2px solid ${getColorStyle(currentInst.color).accent}` }}
          >
            <h2 className="text-[15px] font-bold leading-tight text-[color:var(--ds-text-strong)] truncate">{currentInst.name}</h2>
            <span className="ds-microcaps font-data-mono text-[color:var(--ds-text-muted)] shrink-0">Capacity {currentInst.maxCapacity || 1}</span>
            <button
              type="button"
              onClick={() => setShowNoteModal(true)}
              aria-label={`Report an issue for ${currentInst.name}`}
              className="ds-icon-btn-glass ml-auto shrink-0"
            >
              <Flag className="w-4 h-4" />
            </button>
          </div>
        )}
        {showSkeleton && (
          <div className="border-y border-[var(--ds-rule)] bg-[var(--ds-surface)] animate-pulse" role="status" aria-live="polite" aria-label="Loading calendar">
            <div className="h-9 md:h-10 border-b border-[var(--ds-rule)] bg-[var(--ds-surface-muted)]" />
            <div className="flex min-w-max">
              <div className="w-14 md:w-16 bg-[var(--ds-surface-muted)] border-r border-[var(--ds-rule)]">
                {Array.from({ length: skeletonRows }, (_, rowIndex) => (
                  <div key={`skeleton-time-${rowIndex}`} className={`${rowHeightClass} border-b border-[var(--ds-rule)] px-2 py-2`}>
                    <div className="h-2.5 bg-[var(--ds-rule)] rounded-[2px] w-8 ml-auto" />
                  </div>
                ))}
              </div>
              <div className="flex">
                {Array.from({ length: skeletonColumns }, (_, colIndex) => (
                  <div key={`skeleton-col-${colIndex}`} className="w-[5.5rem] md:w-24 border-r border-[var(--ds-rule)]">
                    <div className="h-9 md:h-10 border-b border-[var(--ds-rule)] bg-[var(--ds-surface-muted)] px-2 py-2">
                      <div className="h-2.5 bg-[var(--ds-rule)] rounded-[2px] w-3/4 mx-auto" />
                    </div>
                    {Array.from({ length: skeletonRows }, (_, rowIndex) => (
                      <div key={`skeleton-cell-${colIndex}-${rowIndex}`} className={`${rowHeightClass} border-b border-[var(--ds-rule)] px-1 py-1`}>
                        <div className="h-3 bg-[var(--ds-surface-muted)] rounded-[2px] w-5/6 mx-auto" />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* VIEW A: OVERVIEW (MATRIX VIEW) */}
        {showGrid && !selectedInstrumentId && overviewInstruments.length === 0 && (
          <>
            <div className="ds-card-muted sticky top-3 z-30 mx-4 my-3 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <p className="text-[12px] leading-relaxed text-[color:var(--ds-text-muted)]">
                {instruments.length === 0
                  ? 'No instrument has been added yet. Ask an admin to create instruments first.'
                  : 'Choose instruments to lay out the timetable.'}
              </p>
            </div>
            <div className="border-y border-[var(--ds-rule-strong)] bg-[var(--ds-surface)] opacity-60">
              <div className="flex">
                <div className="w-14 md:w-16 bg-[var(--ds-surface)] border-r border-[var(--ds-rule-strong)] sticky left-0 z-20">
                  {hours.map((h) => (
                    <div key={h} ref={h === DEFAULT_SCROLL_HOUR ? scrollTargetRef : null} className={getTimeLabelClass(h)}>
                      <span className={`${isWorkingHour(h) ? 'font-bold' : ''}`}>{h}:00</span>
                    </div>
                  ))}
                </div>
                <div className="flex-1 relative">
                  {isToday && renderNowNeedle(0, 0)}
                  {hours.map((h) => (
                    <div
                      key={h}
                      className={`${getSlotCellClass({ hour: h, isBlocked: false, isMine: false, isPast: false })} pointer-events-none select-none`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {showGrid && !selectedInstrumentId && overviewInstruments.length > 0 && (
           <div className="flex min-w-max border-y border-[var(--ds-rule-strong)] bg-[var(--ds-surface)]">
               <div className="w-14 md:w-16 bg-[var(--ds-surface)] border-r border-[var(--ds-rule-strong)] sticky left-0 z-20">
                <div className="h-9 md:h-10 border-b border-[var(--ds-rule-strong)] bg-[var(--ds-surface)]"></div>
                 {hours.map(h => (
                   <div
                     key={h}
                     ref={h === DEFAULT_SCROLL_HOUR ? scrollTargetRef : null}
                     className={getTimeLabelClass(h)}
                   >
                     <span className={`${isWorkingHour(h) ? 'font-bold' : ''}`}>{h}:00</span>
                   </div>
                 ))}
               </div>
               <div className="flex relative">
                 {isToday && renderNowNeedle(2.25, 2.5)}
                 {overviewInstruments.map((inst, instrumentIndex) => {
                   const colorStyle = getColorStyle(inst.color);
                   return (
                 <div key={inst.id} className="w-[5.5rem] md:w-24 border-r border-[var(--ds-rule)]">
                   <div
                     className="h-9 md:h-10 flex items-center justify-center ds-microcaps text-[color:var(--ds-text)] sticky top-0 z-10 px-1 text-center whitespace-normal break-words leading-tight ds-instrument-header-cell"
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
                     const isFull = totalUsed >= (inst.maxCapacity || 1);
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
                         onKeyDown={(event) => handleSlotKeyDown(event, handleActivateSlot, overviewInstruments.length)}
                         role="button"
                         tabIndex={0}
                         aria-label={slotAriaLabel}
                         data-slot-row={h}
                         data-slot-col={instrumentIndex}
                         className={getSlotCellClass({ hour: h, isBlocked, isMine, isPast, isFull })}
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
                             {blockHint.label}
                           </button>
                         )}
                         {primarySlot && (
                           <div className={slotOwnerChipClass(primarySlot.userName)}>
                             {primarySlot.userName}
                           </div>
                         )}
                         {isFull && !isMine && !isBlocked && !isPast && (
                           <span className="ds-stamp ds-stamp-full">Full</span>
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
                         {totalUsed > 0 && (
                           <div className="absolute top-0.5 right-1 text-[10px] font-data tabular-nums text-[color:var(--ds-text-soft)] pointer-events-none">
                             {totalUsed}/{inst.maxCapacity || 1}
                           </div>
                         )}
                       </div>
                     );
                   })}
                 </div>
               )})}
               </div>
           </div>
        )}
        
        {/* VIEW B: SINGLE DAY VIEW */}
        {showGrid && selectedInstrumentId && viewMode === 'day' && (
            <div className="border-y border-[var(--ds-rule-strong)] bg-[var(--ds-surface)]">
              <div className="flex min-w-max">
                <div className="w-14 md:w-16 bg-[var(--ds-surface)] border-r border-[var(--ds-rule-strong)] sticky left-0 z-20">
                  {hours.map(h => (
                    <div key={h} ref={h === DEFAULT_SCROLL_HOUR ? scrollTargetRef : null} className={getTimeLabelClass(h)}>
                      <span className={`${isWorkingHour(h) ? 'font-bold' : ''}`}>{h}:00</span>
                    </div>
                  ))}
                </div>
                <div className="flex-1 relative">
              {isToday && renderNowNeedle(0, 0)}
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
                const isFull = totalUsed >= (currentInst?.maxCapacity || 1);
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
                  <div key={h} ref={h === DEFAULT_SCROLL_HOUR ? scrollTargetRef : null}
                    onClick={handleActivateSlot}
                    onKeyDown={(event) => handleSlotKeyDown(event, handleActivateSlot, 1)}
                    role="button"
                         tabIndex={0}
                         aria-label={slotAriaLabel}
                         data-slot-row={h}
                         data-slot-col={0}
                         className={getSlotCellClass({ hour: h, isBlocked, isMine, isPast, isFull })}
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
                        {blockHint.label}
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
                    ) : null}
                    {isFull && !isMine && !isBlocked && !isPast && (
                      <span className="ds-stamp ds-stamp-full">Full</span>
                    )}
                    {totalUsed > 0 && (
                      <div className="absolute top-0.5 right-1 text-[10px] font-data tabular-nums text-[color:var(--ds-text-soft)] pointer-events-none">
                        {totalUsed}/{currentInst?.maxCapacity || 1}
                      </div>
                    )}
                  </div>
                );
              })}
                </div>
              </div>
            </div>
        )}

        {/* VIEW C: WEEKLY VIEW (RESTORED!) */}
        {showGrid && selectedInstrumentId && viewMode === 'week' && (
          <div className="relative flex-1 min-h-0">
          <div className="h-full overflow-auto border-y border-[var(--ds-rule)] bg-[var(--ds-surface)] [scroll-snap-type:x_proximity] [scroll-padding-left:3.5rem] md:[scroll-padding-left:4rem]" onScroll={handleCalendarScroll}>
            <div className="min-w-[43.75rem] md:min-w-[46rem] min-h-full">
              <div className="sticky top-0 z-40 grid grid-cols-[3.5rem_repeat(7,minmax(5.75rem,1fr))] md:grid-cols-[4rem_repeat(7,minmax(6rem,1fr))] ds-week-header-row">
                  <div className="h-10 md:h-11 ds-week-header-cell border-r border-[var(--ds-rule)] sticky left-0 z-10" aria-hidden="true" />
                  {weekDays.map((d, i) => {
                    const headerDateStr = getFormattedDate(d);
                    const isTodayColumn = headerDateStr === todayDateStr;
                    const isPastDay = isSlotInPast(headerDateStr);
                    const isWeekendColumn = i >= 5;
                    return (
                    <div key={i} className={`h-10 md:h-11 border-r border-[var(--ds-rule)] flex flex-col items-center justify-center ds-week-header-cell snap-start ${isWeekendColumn ? 'bg-[var(--ds-surface-muted)]' : ''} ${isTodayColumn ? 'border-b-2 border-b-[var(--ds-signal)]' : ''} ${isPastDay ? 'opacity-45' : ''}`}>
                      <div className="ds-microcaps text-[color:var(--ds-text-muted)]">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][d.getDay()===0?6:d.getDay()-1]}</div>
                      <div className="text-[13px] font-data-mono tabular-nums font-medium text-[color:var(--ds-text-strong)] leading-none mt-0.5">{d.getDate()}</div>
                    </div>
                    );
                  })}
              </div>
              <div className="relative">
                {weekContainsToday && (() => {
                  const todayIndex = weekDays.findIndex((d) => getFormattedDate(d) === todayDateStr);
                  return todayIndex >= 0 ? (
                    <div className="absolute inset-0 grid grid-cols-[3.5rem_repeat(7,minmax(5.75rem,1fr))] md:grid-cols-[4rem_repeat(7,minmax(6rem,1fr))] pointer-events-none z-[5]" aria-hidden="true">
                      <div className="relative" style={{ gridColumn: todayIndex + 2 }}>{renderNowNeedle(0, 0)}</div>
                    </div>
                  ) : null;
                })()}
                {hours.map(hour => {
                  return (
                  <div key={hour} ref={hour === DEFAULT_SCROLL_HOUR ? scrollTargetRef : null} className="grid grid-cols-[3.5rem_repeat(7,minmax(5.75rem,1fr))] md:grid-cols-[4rem_repeat(7,minmax(6rem,1fr))]">
                    <div className={`${getTimeLabelClass(hour)} sticky left-0 z-10`}>
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
                      const isFull = totalUsed >= (currentInst?.maxCapacity || 1);
                      const isWeekendColumn = i >= 5;
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
                        <div key={i} onClick={handleActivateSlot} onKeyDown={(event) => handleSlotKeyDown(event, handleActivateSlot, weekDays.length)} role="button" tabIndex={0} aria-label={slotAriaLabel}
                             data-slot-row={hour} data-slot-col={i}
                             className={`${getSlotCellClass({ hour, isBlocked, isMine, isPast, isFull, isWeekend: isWeekendColumn })} border-r border-[var(--ds-rule)] ${isPast ? 'opacity-45' : ''}`}>
                          {isPast && hour === 0 && (
                            <span className="ds-stamp ds-stamp-full">Closed</span>
                          )}
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
                              {blockLabel}
                            </button>
                          )}
                          {primarySlot && (
                            <div className={slotOwnerChipClass(primarySlot.userName)}>{primarySlot.userName}</div>
                          )}
                          {isFull && !isMine && !isBlocked && !isPast && (
                            <span className="ds-stamp ds-stamp-full">Full</span>
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
                          {totalUsed > 0 && (
                            <div className="absolute top-0.5 right-1 text-[10px] font-data tabular-nums text-[color:var(--ds-text-soft)] pointer-events-none">
                              {totalUsed}/{currentInst?.maxCapacity || 1}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )})}
              </div>
            </div>
          </div>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-[var(--ds-bg)] to-transparent" aria-hidden="true" />
          </div>
        )}
        </div>
        </div>

        {!showSelectionModal && instruments.length > 0 && (
          <div
            className={`fixed z-40 pointer-events-none lg:hidden ${
              hasAnyInstrumentSelection
                ? 'left-1/2 -translate-x-1/2 bottom-4'
                : 'left-[calc(50%+1.75rem)] md:left-[calc(50%+2rem)] -translate-x-1/2 top-1/2 -translate-y-1/2'
            }`}
          >
            <button
              type="button"
              onClick={() => openSelectionModal(hasAnyInstrumentSelection ? 'fab' : 'default')}
              aria-label="Open overview and instrument selection"
              className={`pointer-events-auto ds-fab-overview rounded-[4px] px-4 py-2.5 inline-flex items-center gap-2 ${isLaunchingSelectionFromFab ? 'ds-fab-overview-launch' : ''}`}
            >
              <span className="text-[12px] font-semibold tracking-[0.01em]">Select instruments</span>
              <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
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
            <h3 id="slot-details-title" className="text-base font-bold text-[color:var(--ds-text-strong)]">{slotDetails.instrument?.name || 'Slot details'}</h3>
            <p className="text-xs text-[color:var(--ds-text-muted)] font-data-mono tabular-nums mt-1">
              {slotDetails.dateStr} at {formatHour(slotDetails.hour)}
            </p>
            {slotDetails.blockLabel && (
              <div className="mt-3 flex items-start gap-2 ds-glass-warning rounded-[4px] px-2 py-1.5">
                <span className="ds-stamp ds-stamp-warning shrink-0">Blocked</span>
                <span className="text-[11px] leading-snug text-[color:var(--ds-warning-text)]">{slotDetails.blockLabel}</span>
              </div>
            )}
            <div className="mt-3 space-y-2 max-h-52 overflow-y-auto">
              {slotDetails.slots.length > 0 ? (
                slotDetails.slots.map((slot, idx) => (
                  <div key={`${slot.userName}-${idx}`} className="ds-glass-row rounded-[4px] px-2.5 py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className={`text-xs truncate ${slot.userName === userName ? 'text-[color:var(--ds-brand-700)] font-semibold' : 'text-[color:var(--ds-text)]'}`}>
                        {slot.userName}
                      </div>
                      {slot.selectedUnit && (
                        <div className="text-[11px] text-[color:var(--ds-text-muted)] truncate mt-0.5">
                          {slot.selectedUnit}
                        </div>
                      )}
                      {slot.bookingComment && (
                        <div className="text-[11px] text-[color:var(--ds-text-muted)] whitespace-pre-wrap break-words mt-1 leading-relaxed">
                          {slot.bookingComment}
                        </div>
                      )}
                    </div>
                    <span className="text-[11px] text-[color:var(--ds-text-soft)] font-data tabular-nums">
                      {Number(slot.requestedQuantity) || 1} unit
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-xs text-[color:var(--ds-text-muted)] ds-glass-row rounded-[4px] px-2.5 py-2">
                  No direct bookings in this slot.
                </div>
              )}
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={closeSlotDetails} className="flex-1 py-2.5 ds-btn ds-btn-secondary">
                Close
              </button>
              {slotDetails.ownedBooking && (
                <button
                  type="button"
                  onClick={() => {
                    closeSlotDetails();
                    setBookingToDelete(slotDetails.ownedBooking);
                  }}
                  className="flex-1 py-2.5 ds-btn bg-[var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]"
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
                  className="flex-1 py-2.5 ds-btn ds-btn-primary"
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
            <ShieldAlert className="w-12 h-12 text-[color:var(--ds-danger-text)] mx-auto mb-4"/>
            <h3 id="cancel-booking-title" className="font-bold mb-2 text-lg text-[color:var(--ds-text-strong)]">Cancel booking?</h3>
            {bookingToDelete.bookingGroupId && <p className="text-[11px] text-[color:var(--ds-warning-text)] font-semibold ds-glass-warning p-2 rounded-[4px] mb-4">Batch booking detected. Cancelling all linked slots.</p>}
            <div className="flex gap-3 mt-4">
              <button type="button" onClick={()=>setBookingToDelete(null)} className="flex-1 py-3 ds-btn ds-btn-secondary">Keep booking</button>
              <button type="button" onClick={handleDeleteBooking} className="flex-1 py-3 ds-btn bg-[var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]">Cancel booking</button>
            </div>
          </div>
        </div>
      )}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};
export default MemberApp;
