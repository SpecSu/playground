import type { ReactNode } from 'react';
import { RefreshCw, RotateCcw } from 'lucide-react';

/* Keep the approved artwork except the two simplified rotation controls. */
const moveIcons: Record<string, ReactNode> = {
  dance: <><circle cx="14" cy="4" r="2"/><path d="m4 10 7-2 5 5 6-3M11 8l-1 8-5 7m5-7 7 2 3 5"/></>,
  bounce: <><path d="m14 2-10 12h8l-1 10 10-13h-8l1-9Z"/></>,
};

const groupIcons: Record<string, ReactNode> = {
  train: <><rect x="6" y="3" width="14" height="16" rx="4"/><path d="M6 11h14M9 19l-3 4m11-4 3 4M13 3v8"/><circle cx="10" cy="15" r="1"/><circle cx="16" cy="15" r="1"/></>,
  wave: <><path d="M3 7c4-6 6 6 10 0s6 6 10 0M3 13c4-6 6 6 10 0s6 6 10 0M3 19c4-6 6 6 10 0s6 6 10 0"/></>,
  unison: <><circle cx="13" cy="6" r="3"/><path d="M7 23v-4a6 6 0 0 1 12 0v4M3 17v-2a5 5 0 0 1 5-5m15 7v-2a5 5 0 0 0-5-5M4 5a3 3 0 0 0 0 5m18-5a3 3 0 0 1 0 5"/></>,
  battle: <><path d="m4 4 3 1 15 15m-4 3 5-5M4 20 19 5l3-1-1 3L6 22m-3-4 5 5"/></>,
  grid: <><rect x="3" y="3" width="20" height="20" rx="3"/><path d="M10 3v20m6-20v20M3 10h20M3 16h20"/></>,
};

export default function FeedActionIcon({ kind, group = false }: { kind: string; group?: boolean }) {
  if (!group && kind === 'spin') return <RefreshCw aria-hidden="true" />;
  if (!group && kind === 'wave') return <RotateCcw aria-hidden="true" />;
  return <svg viewBox="0 0 26 26" aria-hidden="true">{(group ? groupIcons : moveIcons)[kind]}</svg>;
}
