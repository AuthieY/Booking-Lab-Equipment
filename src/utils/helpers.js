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
  { id: 'blue', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', darkBg: 'bg-blue-600' },
  { id: 'red', bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', darkBg: 'bg-red-500' },
  { id: 'green', bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', darkBg: 'bg-green-600' },
  { id: 'amber', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', darkBg: 'bg-amber-500' },
  { id: 'purple', bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', darkBg: 'bg-purple-600' },
];

/**
 * 根据 ID 获取颜色样式对象
 */
export const getColorStyle = (colorId) => COLOR_PALETTE.find(c => c.id === colorId) || COLOR_PALETTE[0];