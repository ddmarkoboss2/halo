import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { displayNameOf, PRESENCE_META } from '../lib/format';
import { useApp } from '../store';
import type { Friendship, User } from '../types';
import { Avatar } from './Avatar';
import { CheckIcon, CloseIcon, CompassIcon, PhoneIcon, SearchIcon, UserPlusIcon, VideoIcon } from './icons';
import { EmptyState, Field, Spinner } from './ui';

type Tab = 'online' | 'all' | 'pending' | 'add';

export function FriendsView() {
  const boot = useApp((state) => state.boot);
  const openDm = useApp((state) => state.openDm);
  const startCall = useApp((state) => state.startCall);
  const refresh = useApp((state) => state.refresh);
  const pushToast = useApp((state) => state.pushToast);
  const [tab, setTab] = useState<Tab>('online');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<(User & { friendship: { status: string; direction?: string; id?: string } })[]>([]);
  const [searching, setSearching] = useState(false);
  const [discover, setDiscover] = useState<{ id: string; name: string; description: string; accent: string; memberCount: number; joined: boolean; inviteCode: string }[]>([]);

  const friendships = boot?.friendships ?? [];
  const friends = useMemo(() => friendships.filter((f) => f.status === 'accepted'), [friendships]);
  const incoming = friendships.filter((f) => f.status === 'pending' && f.direction === 'incoming');
  const outgoing = friendships.filter((f) => f.status === 'pending' && f.direction === 'outgoing');

  const runSearch = async (value: string) => {
    setQuery(value);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const { users } = await api.searchUsers(value.trim());
      setResults(users);
    } finally {
      setSearching(false);
    }
  };

  const addFriend = async (username: string) => {
    try {
      const result = await api.addFriend(username);
      pushToast({
        title: result.accepted ? 'Friend added' : 'Request sent',
        body: result.accepted ? `You and @${username} are now friends.` : `Waiting for @${username} to accept.`,
      });
      await refresh();
      await runSearch(query);
    } catch (error) {
      pushToast({ title: 'Could not add friend', body: error instanceof Error ? error.message : '', kind: 'error' });
    }
  };

  const loadDiscover = async () => {
    const { servers } = await api.discoverServers();
    setDiscover(servers);
  };

  const joinServer = async (code: string) => {
    try {
      await api.joinServer(code);
      await refresh();
      pushToast({ title: 'Joined server', body: 'Find it in the rail on the left.' });
      await loadDiscover();
    } catch (error) {
      pushToast({ title: 'Could not join', body: error instanceof Error ? error.message : '', kind: 'error' });
    }
  };

  const call = async (user: User, video: boolean) => {
    const dmId = await openDm(user.id);
    if (dmId) startCall(user, dmId, video);
  };

  const Row = ({ friendship }: { friendship: Friendship }) => (
    <div className="group flex items-center gap-3 rounded-2xl px-3 py-2.5 transition hover:bg-white/4">
      <Avatar user={friendship.user} size={40} presence={friendship.user.presence} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-white">{displayNameOf(friendship.user)}</p>
        <p className="truncate text-xs text-mist-500">
          {friendship.status === 'pending'
            ? friendship.direction === 'incoming'
              ? 'Wants to be friends'
              : 'Request sent'
            : friendship.user.customStatus || PRESENCE_META[friendship.user.presence].label}
        </p>
      </div>

      {friendship.status === 'accepted' ? (
        <div className="flex items-center gap-1.5 opacity-0 transition group-hover:opacity-100">
          <button type="button" className="btn btn-ghost h-8 px-3 text-xs" onClick={() => void openDm(friendship.user.id)}>
            Message
          </button>
          <button type="button" className="btn btn-ghost h-8 w-9" title="Voice call" onClick={() => void call(friendship.user, false)}>
            <PhoneIcon size={15} />
          </button>
          <button type="button" className="btn btn-ghost h-8 w-9" title="Video call" onClick={() => void call(friendship.user, true)}>
            <VideoIcon size={15} />
          </button>
          <button
            type="button"
            className="btn btn-ghost h-8 w-9 !text-coral-400"
            title="Remove friend"
            onClick={async () => {
              await api.removeFriend(friendship.user.id).catch(() => null);
              await refresh();
            }}
          >
            <CloseIcon size={15} />
          </button>
        </div>
      ) : friendship.direction === 'incoming' ? (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="btn btn-primary h-8 w-9"
            title="Accept"
            onClick={async () => {
              await api.acceptFriend(friendship.id).catch(() => null);
              await refresh();
            }}
          >
            <CheckIcon size={15} />
          </button>
          <button
            type="button"
            className="btn btn-ghost h-8 w-9"
            title="Ignore"
            onClick={async () => {
              await api.removeFriendRequest(friendship.id).catch(() => null);
              await refresh();
            }}
          >
            <CloseIcon size={15} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-ghost h-8 px-3 text-xs"
          onClick={async () => {
            await api.removeFriendRequest(friendship.id).catch(() => null);
            await refresh();
          }}
        >
          Cancel
        </button>
      )}
    </div>
  );

  const online = friends.filter((f) => f.user.presence !== 'offline');

  return (
    <div className="panel relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden">
      <header className="panel-header flex flex-wrap items-center gap-2 px-5 py-3.5">
        <h1 className="mr-2 text-sm font-bold text-white">Friends</h1>
        {(['online', 'all', 'pending', 'add'] as Tab[]).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setTab(value);
              if (value === 'add') void loadDiscover();
            }}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold capitalize transition ${
              tab === value ? 'bg-white/12 text-white' : 'text-mist-400 hover:bg-white/6 hover:text-mist-200'
            }`}
          >
            {value === 'add' ? 'Add friend' : value}
            {value === 'pending' && incoming.length > 0 && (
              <span className="ml-1.5 rounded-full bg-coral-400 px-1.5 text-[10px] font-bold text-ink-950">
                {incoming.length}
              </span>
            )}
          </button>
        ))}
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-3 scroll-thin">
        {tab === 'add' && (
          <div className="mx-auto max-w-2xl space-y-5 py-2">
            <div>
              <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-mist-400">Add a friend</h2>
              <p className="mb-3 text-xs text-mist-500">You can add people with their username — no email needed.</p>
              <div className="flex gap-2">
                <input
                  className="input"
                  placeholder="Search by username, e.g. ava"
                  value={query}
                  onChange={(event) => void runSearch(event.target.value)}
                />
                {searching && <Spinner />}
              </div>
              {results.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {results.map((user) => (
                    <li
                      key={user.id}
                      className="flex items-center gap-3 rounded-2xl border border-white/6 bg-white/3 px-3 py-2"
                    >
                      <Avatar user={user} size={36} presence={user.presence} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-white">{displayNameOf(user)}</span>
                        <span className="block truncate text-[11px] text-mist-500">@{user.username}</span>
                      </span>
                      {user.friendship.status === 'accepted' ? (
                        <span className="chip">Friends</span>
                      ) : user.friendship.status === 'pending' ? (
                        <span className="chip">{user.friendship.direction === 'incoming' ? 'Respond' : 'Sent'}</span>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-primary h-8 px-3 text-xs"
                          onClick={() => void addFriend(user.username)}
                        >
                          <UserPlusIcon size={14} /> Add
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {incoming.length > 0 && (
                <div className="mt-6">
                  <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-mist-400">Pending requests</h2>
                  <div className="space-y-1">{incoming.map((f) => <Row key={f.id} friendship={f} />)}</div>
                </div>
              )}

              <div className="mt-6">
                <h2 className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-mist-400">
                  <CompassIcon size={13} /> Discover public spaces
                </h2>
                <div className="space-y-1.5">
                  {discover.length === 0 && <p className="text-xs text-mist-500">Loading…</p>}
                  {discover.map((server) => (
                    <div key={server.id} className="flex items-center gap-3 rounded-2xl border border-white/6 bg-white/3 px-3 py-2.5">
                      <span
                        className="squircle grid h-9 w-9 place-items-center text-[11px] font-extrabold text-white"
                        style={{ background: `linear-gradient(140deg, ${server.accent}, rgba(255,255,255,0.14))` }}
                      >
                        {server.name.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-white">{server.name}</span>
                        <span className="block truncate text-[11px] text-mist-500">{server.description}</span>
                      </span>
                      {server.joined ? (
                        <span className="chip">Joined</span>
                      ) : (
                        <button type="button" className="btn btn-ghost h-8 px-3 text-xs" onClick={() => void joinServer(server.inviteCode)}>
                          Join
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab !== 'add' && (
          <div className="mx-auto max-w-3xl">
            {tab === 'online' &&
              (online.length === 0 ? (
                <EmptyState
                  icon={<SearchIcon size={20} />}
                  title="Nobody online right now"
                  body="Your friends will appear here the moment they come online. Add more people from the Add friend tab."
                />
              ) : (
                <div className="space-y-1">{online.map((f) => <Row key={f.id} friendship={f} />)}</div>
              ))}

            {tab === 'all' &&
              (friends.length === 0 ? (
                <EmptyState
                  icon={<UserPlusIcon size={20} />}
                  title="No friends yet"
                  body="Search a username from the Add friend tab — the request goes back and forth instantly."
                />
              ) : (
                <div className="space-y-1">{friends.map((f) => <Row key={f.id} friendship={f} />)}</div>
              ))}

            {tab === 'pending' && (
              <div className="space-y-4">
                {incoming.length === 0 && outgoing.length === 0 && (
                  <EmptyState icon={<UserPlusIcon size={20} />} title="No pending requests" body="You are all caught up." />
                )}
                {incoming.length > 0 && (
                  <div>
                    <h2 className="mb-1.5 px-2 text-xs font-bold uppercase tracking-wider text-mist-400">Incoming</h2>
                    {incoming.map((f) => <Row key={f.id} friendship={f} />)}
                  </div>
                )}
                {outgoing.length > 0 && (
                  <div>
                    <h2 className="mb-1.5 px-2 text-xs font-bold uppercase tracking-wider text-mist-400">Outgoing</h2>
                    {outgoing.map((f) => <Row key={f.id} friendship={f} />)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {tab === 'add' && (
        <div className="border-t border-white/5 px-5 py-3">
          <Field label="Your invite link for Halo HQ" hint="Share the code and they can join instantly from Join with invite.">
            <div className="flex gap-2">
              <input readOnly className="input font-mono text-xs" value="halo-hq" />
              <button
                type="button"
                className="btn btn-ghost h-10 shrink-0 px-4 text-xs"
                onClick={() => void navigator.clipboard.writeText('halo-hq')}
              >
                Copy
              </button>
            </div>
          </Field>
        </div>
      )}
    </div>
  );
}

