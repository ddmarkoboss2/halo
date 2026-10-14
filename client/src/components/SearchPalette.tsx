import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../lib/api';
import { displayNameOf, relativeTime } from '../lib/format';
import { useApp } from '../store';
import type { SearchHit, User } from '../types';
import { Avatar } from './Avatar';
import { CloseIcon, HashIcon, SearchIcon } from './icons';
import { Spinner } from './ui';

export function SearchPalette() {
  const open = useApp((state) => state.searchOpen);
  const setOpen = useApp((state) => state.setSearchOpen);
  const setView = useApp((state) => state.setView);
  const loadMessages = useApp((state) => state.loadMessages);
  const openDm = useApp((state) => state.openDm);
  const openProfile = useApp((state) => state.openProfile);

  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setUsers([]);
      setHits([]);
      return undefined;
    }
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, setOpen]);

  useEffect(() => {
    if (!open) return undefined;
    const term = query.trim();
    if (term.length < 2) {
      setUsers([]);
      setHits([]);
      return undefined;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setBusy(true);
      try {
        const [people, messages] = await Promise.all([api.searchUsers(term), api.searchMessages(term)]);
        if (cancelled) return;
        setUsers(people.users);
        setHits(messages.results);
      } catch {
        /* ignore transient failures */
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, open]);

  const jump = async (hit: SearchHit) => {
    setOpen(false);
    if (hit.message.scope === 'dm') {
      setView({ kind: 'dm', dmId: hit.message.scopeId });
      await loadMessages('dm', hit.message.scopeId);
    } else if (hit.context.serverId) {
      setView({ kind: 'channel', serverId: hit.context.serverId, channelId: hit.message.scopeId });
      await loadMessages('channel', hit.message.scopeId);
    }
    window.setTimeout(() => {
      document.getElementById(`msg-${hit.message.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 260);
  };

  const groups = useMemo(() => {
    const byScope = new Map<string, SearchHit[]>();
    for (const hit of hits) {
      const key = hit.context.label;
      const list = byScope.get(key) ?? [];
      list.push(hit);
      byScope.set(key, list);
    }
    return [...byScope.entries()];
  }, [hits]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[65] flex items-start justify-center p-6 pt-24">
      <button type="button" aria-label="Close search" className="absolute inset-0 cursor-default bg-ink-950/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="panel animate-rise relative w-full max-w-2xl overflow-hidden p-0">
        <div className="flex items-center gap-3 border-b border-white/6 px-4 py-3">
          <SearchIcon size={17} className="text-mist-400" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search messages and people…"
            className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-mist-500"
          />
          {busy && <Spinner size={15} />}
          <button type="button" onClick={() => setOpen(false)} className="text-mist-500 transition hover:text-white" aria-label="Close">
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2 scroll-thin">
          {query.trim().length < 2 && (
            <p className="px-3 py-6 text-center text-xs text-mist-500">
              Type at least two characters. Try a word from a message or a friend's username.
            </p>
          )}

          {users.length > 0 && (
            <div className="mb-2">
              <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-mist-500">People</p>
              {users.map((user) => (
                <div key={user.id} className="flex items-center gap-3 rounded-2xl px-3 py-2 transition hover:bg-white/5">
                  <Avatar user={user} size={32} presence={user.presence} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-white">{displayNameOf(user)}</span>
                    <span className="block truncate text-[11px] text-mist-500">@{user.username}</span>
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost h-7 px-2.5 text-[11px]"
                    onClick={async () => {
                      const dmId = await openDm(user.id);
                      setOpen(false);
                      if (dmId) setView({ kind: 'dm', dmId });
                    }}
                  >
                    Message
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost h-7 px-2.5 text-[11px]"
                    onClick={() => {
                      setOpen(false);
                      void openProfile(user.id);
                    }}
                  >
                    Profile
                  </button>
                </div>
              ))}
            </div>
          )}

          {groups.map(([label, list]) => (
            <div key={label} className="mb-2">
              <p className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-mist-500">
                <HashIcon size={11} /> {label}
              </p>
              {list.map((hit) => (
                <button
                  key={hit.message.id}
                  type="button"
                  onClick={() => void jump(hit)}
                  className="flex w-full items-start gap-3 rounded-2xl px-3 py-2 text-left transition hover:bg-white/5"
                >
                  <Avatar user={hit.message.author} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white">{displayNameOf(hit.message.author)}</span>
                      <span className="text-[10px] text-mist-600">{relativeTime(hit.message.createdAt)}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-mist-400">{hit.message.content}</span>
                  </span>
                </button>
              ))}
            </div>
          ))}

          {query.trim().length >= 2 && !busy && users.length === 0 && hits.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-mist-500">Nothing found for “{query}”.</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
