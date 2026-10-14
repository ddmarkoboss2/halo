import type { Presence, User } from '../types';

export function initials(name: string): string {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function displayNameOf(user: User | null | undefined): string {
  return user?.displayName || user?.username || 'Unknown';
}

/** Deterministic pair of colours derived from a user's accent. */
export function gradientFor(accent: string): string {
  return `linear-gradient(140deg, ${accent} 0%, ${shade(accent, -22)} 100%)`;
}

function shade(hex: string, amount: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const num = parseInt(clean, 16);
  const clamp = (value: number) => Math.max(0, Math.min(255, value));
  const r = clamp((num >> 16) + amount);
  const g = clamp(((num >> 8) & 0x00ff) + amount);
  const b = clamp((num & 0x0000ff) + amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export const PRESENCE_META: Record<Presence, { label: string; color: string }> = {
  online: { label: 'Online', color: '#34d399' },
  idle: { label: 'Idle', color: '#fbbf24' },
  dnd: { label: 'Do not disturb', color: '#fb7185' },
  offline: { label: 'Offline', color: '#6b7091' },
};

export function timeOf(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function sameDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

export function dayLabel(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (sameDay(date.getTime(), today.getTime())) return 'Today';
  if (sameDay(date.getTime(), yesterday.getTime())) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'long', day: 'numeric', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

export function relativeTime(timestamp: number): string {
  if (!timestamp) return 'a while ago';
  const diff = Date.now() - timestamp;
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function groupKey(scope: string, scopeId: string): string {
  return `${scope}:${scopeId}`;
}

export function splitScope(key: string): { scope: 'channel' | 'dm'; scopeId: string } {
  const index = key.indexOf(':');
  return { scope: key.slice(0, index) as 'channel' | 'dm', scopeId: key.slice(index + 1) };
}

export function isTypingName(list: { displayName: string }[]): string {
  if (list.length === 0) return '';
  if (list.length === 1) return `${list[0].displayName} is typing`;
  if (list.length === 2) return `${list[0].displayName} and ${list[1].displayName} are typing`;
  return `${list[0].displayName} and ${list.length - 1} others are typing`;
}

export function accentList(): string[] {
  return ['#7c5cff', '#22d3ee', '#f472b6', '#34d399', '#fbbf24', '#fb7185', '#60a5fa', '#c084fc', '#f97316', '#4ade80'];
}
