// src/utils/helpers.js

/**
 * Format a Date as YYYY-MM-DD.
 */
export const getFormattedDate = (date) => date.toISOString().split('T')[0];

/**
 * Add or subtract days from a date.
 */
export const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

/**
 * Get the Monday of the week that contains the given date.
 */
export const getMonday = (d) => {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); 
  return new Date(date.setDate(diff));
};

/**
 * Format a Firebase Timestamp as a compact display string.
 */
export const formatTime = (timestamp) => {
  if(!timestamp) return '';
  const d = timestamp.toDate();
  return `${d.getMonth()+1}/${d.getDate()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
};

/**
 * Color palette definitions.
 */
export const COLOR_PALETTE = [
  { id: 'blue', type: 'solid', label: 'Blue', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', darkBg: 'bg-blue-600', accent: '#2563eb' },
  { id: 'red', type: 'solid', label: 'Red', bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', darkBg: 'bg-red-500', accent: '#ef4444' },
  { id: 'green', type: 'solid', label: 'Green', bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', darkBg: 'bg-green-600', accent: '#16a34a' },
  { id: 'amber', type: 'solid', label: 'Amber', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', darkBg: 'bg-amber-500', accent: '#f59e0b' },
  { id: 'purple', type: 'solid', label: 'Purple', bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', darkBg: 'bg-purple-600', accent: '#9333ea' },
  { id: 'teal', type: 'solid', label: 'Teal', bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700', darkBg: 'bg-teal-600', accent: '#0d9488' },
  { id: 'indigo', type: 'solid', label: 'Indigo', bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', darkBg: 'bg-indigo-600', accent: '#4f46e5' },
  { id: 'pink', type: 'solid', label: 'Pink', bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-700', darkBg: 'bg-pink-600', accent: '#db2777' },
  { id: 'orange', type: 'solid', label: 'Orange', bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', darkBg: 'bg-orange-600', accent: '#ea580c' },
  { id: 'slate', type: 'solid', label: 'Slate', bg: 'bg-slate-100', border: 'border-slate-300', text: 'text-slate-700', darkBg: 'bg-slate-700', accent: '#475569' },
  { id: 'rose', type: 'solid', label: 'Rose', bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', darkBg: 'bg-rose-600', accent: '#e11d48' },
  { id: 'cyan', type: 'solid', label: 'Cyan', bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-700', darkBg: 'bg-cyan-600', accent: '#0891b2' },
  { id: 'lime', type: 'solid', label: 'Lime', bg: 'bg-lime-50', border: 'border-lime-200', text: 'text-lime-700', darkBg: 'bg-lime-600', accent: '#65a30d' },
  { id: 'violet', type: 'solid', label: 'Violet', bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', darkBg: 'bg-violet-600', accent: '#7c3aed' },
  { id: 'uni-blue', type: 'solid', label: 'Uni Blue', bg: 'bg-[#e6f3fb]', border: 'border-[#52bdec]', text: 'text-[#00407a]', darkBg: 'bg-[#00407a]', accent: '#00407a' },

  { id: 'grad-ocean', type: 'gradient', label: 'Ocean', bg: 'bg-gradient-to-r from-cyan-50 to-blue-100', border: 'border-cyan-200', text: 'text-cyan-800', darkBg: 'bg-gradient-to-r from-[#00407a] to-[#1c7aa0]', accent: '#1c7aa0' },
  { id: 'grad-sky', type: 'gradient', label: 'Sky', bg: 'bg-gradient-to-r from-sky-50 to-cyan-100', border: 'border-sky-200', text: 'text-sky-800', darkBg: 'bg-gradient-to-r from-[#52bdec] to-[#1c7aa0]', accent: '#1c7aa0' },
  { id: 'grad-forest', type: 'gradient', label: 'Forest', bg: 'bg-gradient-to-r from-emerald-50 to-teal-100', border: 'border-emerald-200', text: 'text-emerald-800', darkBg: 'bg-gradient-to-r from-emerald-600 to-teal-700', accent: '#0f766e' },
  { id: 'grad-sunset', type: 'gradient', label: 'Sunset', bg: 'bg-gradient-to-r from-orange-50 to-rose-100', border: 'border-orange-200', text: 'text-orange-800', darkBg: 'bg-gradient-to-r from-orange-500 to-rose-600', accent: '#f97316' },
  { id: 'grad-violet', type: 'gradient', label: 'Violet', bg: 'bg-gradient-to-r from-fuchsia-50 to-violet-100', border: 'border-violet-200', text: 'text-violet-800', darkBg: 'bg-gradient-to-r from-violet-600 to-fuchsia-600', accent: '#7c3aed' },
  { id: 'grad-midnight', type: 'gradient', label: 'Midnight', bg: 'bg-gradient-to-r from-slate-100 to-blue-100', border: 'border-slate-300', text: 'text-slate-800', darkBg: 'bg-gradient-to-r from-slate-800 to-blue-900', accent: '#1e293b' },
  { id: 'grad-lagoon', type: 'gradient', label: 'Lagoon', bg: 'bg-gradient-to-r from-teal-50 to-cyan-100', border: 'border-teal-200', text: 'text-teal-800', darkBg: 'bg-gradient-to-r from-teal-600 to-cyan-700', accent: '#0f766e' },
  { id: 'grad-dawn', type: 'gradient', label: 'Dawn', bg: 'bg-gradient-to-r from-pink-50 to-amber-100', border: 'border-pink-200', text: 'text-pink-800', darkBg: 'bg-gradient-to-r from-pink-600 to-amber-500', accent: '#db2777' },
  { id: 'grad-royal', type: 'gradient', label: 'Royal', bg: 'bg-gradient-to-r from-indigo-50 to-violet-100', border: 'border-indigo-200', text: 'text-indigo-800', darkBg: 'bg-gradient-to-r from-indigo-700 to-violet-700', accent: '#4f46e5' },
  { id: 'grad-flame', type: 'gradient', label: 'Flame', bg: 'bg-gradient-to-r from-amber-50 to-red-100', border: 'border-amber-200', text: 'text-orange-800', darkBg: 'bg-gradient-to-r from-amber-500 to-red-600', accent: '#ea580c' },
  { id: 'grad-mint', type: 'gradient', label: 'Mint', bg: 'bg-gradient-to-r from-lime-50 to-emerald-100', border: 'border-lime-200', text: 'text-lime-800', darkBg: 'bg-gradient-to-r from-lime-600 to-emerald-600', accent: '#65a30d' },
  { id: 'grad-candy', type: 'gradient', label: 'Candy', bg: 'bg-gradient-to-r from-rose-50 to-fuchsia-100', border: 'border-rose-200', text: 'text-rose-800', darkBg: 'bg-gradient-to-r from-rose-600 to-fuchsia-600', accent: '#e11d48' },
  { id: 'grad-arctic', type: 'gradient', label: 'Arctic', bg: 'bg-gradient-to-r from-sky-50 to-indigo-100', border: 'border-sky-200', text: 'text-sky-800', darkBg: 'bg-gradient-to-r from-sky-600 to-indigo-700', accent: '#0284c7' },
  { id: 'grad-storm', type: 'gradient', label: 'Storm', bg: 'bg-gradient-to-r from-slate-100 to-zinc-200', border: 'border-slate-300', text: 'text-slate-800', darkBg: 'bg-gradient-to-r from-slate-700 to-zinc-800', accent: '#475569' },
  { id: 'grad-berry', type: 'gradient', label: 'Berry', bg: 'bg-gradient-to-r from-violet-50 to-rose-100', border: 'border-violet-200', text: 'text-violet-800', darkBg: 'bg-gradient-to-r from-violet-700 to-rose-600', accent: '#7c3aed' },
  { id: 'grad-pacific', type: 'gradient', label: 'Pacific', bg: 'bg-gradient-to-r from-cyan-50 to-teal-100', border: 'border-cyan-200', text: 'text-cyan-800', darkBg: 'bg-gradient-to-r from-cyan-600 to-teal-700', accent: '#0891b2' },
  { id: 'grad-aurora', type: 'gradient', label: 'Aurora', bg: 'bg-gradient-to-r from-green-50 via-cyan-100 to-blue-100', border: 'border-green-200', text: 'text-emerald-800', darkBg: 'bg-gradient-to-r from-green-600 via-cyan-600 to-blue-700', accent: '#0f766e' },
];

/**
 * Resolve a palette item by ID.
 */
export const getColorStyle = (colorId) => COLOR_PALETTE.find(c => c.id === colorId) || COLOR_PALETTE[0];
