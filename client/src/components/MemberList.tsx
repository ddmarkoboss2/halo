import { useMemo } from 'react';
import { displayNameOf, PRESENCE_META } from '../lib/format';
import { useApp } from '../store';
import type { Presence, User } from '../types';
import { Avatar } from './Avatar';
import { CrownIcon, UsersIcon } from './icons';

const ORDER: Presence[] = ['online', 'idle', 'dnd', 'offline'];

export function MemberList({ serverId }: { serverId: string }) {
  const members = useApp((state) => state.members[serverId]) ?? [];
  const online = useApp((state) => state.boot?.online) ?? [];
  const openProfile = useApp((state) => state.openProfile);

  const grouped = useMemo(() => {
    const map = new Map<Presence, User[]>();
    for (const member of members) {
      const presence: Presence = member.presence === 'offline' && online.includes(member.id) ? 'online' : member.presence;
      const list = map.get(presence) ?? [];
      list.push(member);
      map.set(presence, list);
    }
    for (const list of map.values()) list.sort((a, b) => displayNameOf(a).localeCompare(displayNameOf(b)));
    return map;
  }, [members, online]);

  return (
    <aside className="panel flex h-full w-[236px] shrink-0 flex-col overflow-hidden">
      <div className="panel-header flex items-center gap-2 px-4 py-3.5">
        <UsersIcon size={15} className="text-mist-400" />
        <span className="text-xs font-bold uppercase tracking-wider text-mist-300">Members</span>
        <span className="chip ml-auto !px-2 !py-0.5 !text-[10px]">{members.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-3 scroll-thin">
        {members.length === 0 && <p className="px-2 text-xs text-mist-500">Loading members…</p>}
        {ORDER.map((presence) => {
          const list = grouped.get(presence) ?? [];
          if (list.length === 0) return null;
          return (
            <div key={presence} className="mb-3">
              <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-mist-500">
                {PRESENCE_META[presence].label} — {list.length}
              </p>
              <ul className="space-y-0.5">
                {list.map((member) => (
                  <li key={member.id}>
                    <button
                      type="button"
                      onClick={() => void openProfile(member.id)}
                      className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition hover:bg-white/6"
                    >
                      <Avatar user={member} size={30} presence={presence} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-semibold text-mist-200">{displayNameOf(member)}</span>
                          {(member as User & { role?: string }).role === 'owner' && (
                            <CrownIcon size={12} className="shrink-0 text-amber-glow" />
                          )}
                        </span>
                        {member.customStatus && (
                          <span className="block truncate text-[11px] text-mist-500">{member.customStatus}</span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
