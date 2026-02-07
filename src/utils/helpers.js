// src/utils/helpers.js

/**
 * 格式化日期为 YYYY-MM-DD
 */
export const getFormattedDate = (date) => date.toISOString().split('T')[0];

/**
 * 日期加减天数
 */
export const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

/**
 * 获取当前日期所在周的周一
 */
export const getMonday = (d) => {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); 
  return new Date(date.setDate(diff));
};

/**
 * 格式化 Firebase Timestamp 为字符串
 */
export const formatTime = (timestamp) => {
  if(!timestamp) return '';
  const d = timestamp.toDate();
  return `${d.getMonth()+1}/${d.getDate()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
};

/**
 * 颜色方案配置
 */
export const COLOR_PALETTE = [
  { id: 'blue', label: 'Blue', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', darkBg: 'bg-blue-600', accent: '#2563eb' },
  { id: 'red', label: 'Red', bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', darkBg: 'bg-red-500', accent: '#ef4444' },
  { id: 'green', label: 'Green', bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', darkBg: 'bg-green-600', accent: '#16a34a' },
  { id: 'amber', label: 'Amber', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', darkBg: 'bg-amber-500', accent: '#f59e0b' },
  { id: 'purple', label: 'Purple', bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', darkBg: 'bg-purple-600', accent: '#9333ea' },
  { id: 'teal', label: 'Teal', bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700', darkBg: 'bg-teal-600', accent: '#0d9488' },
  { id: 'indigo', label: 'Indigo', bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', darkBg: 'bg-indigo-600', accent: '#4f46e5' },
  { id: 'pink', label: 'Pink', bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-700', darkBg: 'bg-pink-600', accent: '#db2777' },
  { id: 'orange', label: 'Orange', bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', darkBg: 'bg-orange-600', accent: '#ea580c' },
  { id: 'slate', label: 'Slate', bg: 'bg-slate-100', border: 'border-slate-300', text: 'text-slate-700', darkBg: 'bg-slate-700', accent: '#475569' },
  { id: 'uni-blue', label: 'Uni Blue', bg: 'bg-[#e6f3fb]', border: 'border-[#52bdec]', text: 'text-[#00407a]', darkBg: 'bg-[#00407a]', accent: '#00407a' },
  { id: 'grad-ocean', label: 'Ocean', bg: 'bg-gradient-to-r from-cyan-50 to-blue-100', border: 'border-cyan-200', text: 'text-cyan-800', darkBg: 'bg-gradient-to-r from-[#00407a] to-[#1c7aa0]', accent: '#1c7aa0' },
  { id: 'grad-sky', label: 'Sky', bg: 'bg-gradient-to-r from-sky-50 to-cyan-100', border: 'border-sky-200', text: 'text-sky-800', darkBg: 'bg-gradient-to-r from-[#52bdec] to-[#1c7aa0]', accent: '#1c7aa0' },
  { id: 'grad-forest', label: 'Forest', bg: 'bg-gradient-to-r from-emerald-50 to-teal-100', border: 'border-emerald-200', text: 'text-emerald-800', darkBg: 'bg-gradient-to-r from-emerald-600 to-teal-700', accent: '#0f766e' },
  { id: 'grad-sunset', label: 'Sunset', bg: 'bg-gradient-to-r from-orange-50 to-rose-100', border: 'border-orange-200', text: 'text-orange-800', darkBg: 'bg-gradient-to-r from-orange-500 to-rose-600', accent: '#f97316' },
  { id: 'grad-violet', label: 'Violet', bg: 'bg-gradient-to-r from-fuchsia-50 to-violet-100', border: 'border-violet-200', text: 'text-violet-800', darkBg: 'bg-gradient-to-r from-violet-600 to-fuchsia-600', accent: '#7c3aed' },
  { id: 'grad-midnight', label: 'Midnight', bg: 'bg-gradient-to-r from-slate-100 to-blue-100', border: 'border-slate-300', text: 'text-slate-800', darkBg: 'bg-gradient-to-r from-slate-800 to-blue-900', accent: '#1e293b' },
];

/**
 * 根据 ID 获取颜色样式对象
 */
export const getColorStyle = (colorId) => COLOR_PALETTE.find(c => c.id === colorId) || COLOR_PALETTE[0];
