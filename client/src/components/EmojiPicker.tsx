import { useEffect, useMemo, useRef, useState } from 'react';
import { EMOJI_GROUPS, searchEmoji, type EmojiGroup } from '../lib/emoji';

const RECENTS_KEY = 'halo.emoji.recents';

function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    return raw ? (JSON.parse(raw) as string[]).slice(0, 16) : [];
  } catch {
    return [];
  }
}

export function EmojiPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<EmojiGroup>('Smileys');
  const [recents, setRecents] = useState<string[]>(() => loadRecents());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', handler);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('mousedown', handler);
      window.removeEventListener('keydown', escape);
    };
  }, [onClose]);

  const results = useMemo(() => searchEmoji(query, 120), [query]);
  const visible = query
    ? results
    : results.filter((entry) => entry.group === group).slice(0, 60);

  const pick = (emoji: string) => {
    const next = [emoji, ...recents.filter((value) => value !== emoji)].slice(0, 16);
    setRecents(next);
    try {
      localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
    } catch {
      /* storage may be unavailable */
    }
    onPick(emoji);
  };

  return (
    <div ref={ref} className="panel animate-pop absolute bottom-14 right-2 z-40 w-[300px] overflow-hidden p-0">
      <div className="border-b border-white/6 p-3">
        <input
          autoFocus
          className="input h-9 text-xs"
          placeholder="Search emoji"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {!query && (
        <div className="flex gap-1 overflow-x-auto border-b border-white/6 px-2 py-2 scroll-thin">
          {EMOJI_GROUPS.filter((name) => name !== 'Frequent').map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setGroup(name)}
              className={`whitespace-nowrap rounded-lg px-2 py-1 text-[11px] font-semibold transition ${
                group === name ? 'bg-white/10 text-white' : 'text-mist-400 hover:text-mist-200'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}
      <div className="max-h-[260px] overflow-y-auto p-2 scroll-thin">
        {recents.length > 0 && !query && (
          <>
            <p className="px-1 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wider text-mist-500">Recently used</p>
            <div className="mb-2 grid grid-cols-8 gap-1">
              {recents.map((emoji) => (
                <button
                  key={`recent-${emoji}`}
                  type="button"
                  onClick={() => pick(emoji)}
                  className="grid h-8 place-items-center rounded-lg text-lg transition hover:bg-white/10"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="grid grid-cols-8 gap-1">
          {visible.map((entry, index) => (
            <button
              key={`${entry.char}-${index}`}
              type="button"
              title={entry.name}
              onClick={() => pick(entry.char)}
              className="grid h-8 place-items-center rounded-lg text-lg transition hover:scale-110 hover:bg-white/10"
            >
              {entry.char}
            </button>
          ))}
        </div>
        {visible.length === 0 && <p className="py-6 text-center text-xs text-mist-500">No emoji match “{query}”.</p>}
      </div>
    </div>
  );
}
