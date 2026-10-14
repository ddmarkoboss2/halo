import { useMemo } from 'react';
import { displayNameOf, relativeTime } from '../lib/format';
import { useApp } from '../store';
import type { Channel, Server } from '../types';
import { Avatar } from './Avatar';
import { CompassIcon, HashIcon, PhoneIcon, PlusIcon, SearchIcon, SparklesIcon, UserPlusIcon } from './icons';

export function HomeView() {
  const boot = useApp((state) => state.boot);
  const rosters = useApp((state) => state.rosters);
  const setView = useApp((state) => state.setView);
  const setModal = useApp((state) => state.setModal);
  const setSearchOpen = useApp((state) => state.setSearchOpen);
  const openDm = useApp((state) => state.openDm);
  const joinVoiceChannel = useApp((state) => state.joinVoiceChannel);

  const liveCalls = useMemo(() => {
    const calls: { server: Server; channel: Channel; count: number }[] = [];
    for (const server of boot?.servers ?? []) {
      for (const channel of server.channels) {
        const participants = rosters[`channel:${channel.id}`]?.length ?? 0;
        if (channel.type === 'voice' && participants > 0) calls.push({ server, channel, count: participants });
      }
    }
    return calls;
  }, [boot, rosters]);

  if (!boot) return null;

  const friends = boot.friends;
  const onlineFriends = friends.filter((friend) => friend.presence !== 'offline');
  const unreadDms = boot.dms.filter((dm) => dm.unread > 0);

  const actions = [
    {
      icon: <UserPlusIcon size={17} />,
      title: 'Make friends',
      body: 'Search a username and send a request instantly.',
      cta: 'Find people',
      onClick: () => setView({ kind: 'friends' }),
    },
    {
      icon: <PlusIcon size={17} />,
      title: 'Start a server',
      body: 'Spaces with text and voice channels for your crew.',
      cta: 'Create space',
      onClick: () => setModal('create-server'),
    },
    {
      icon: <CompassIcon size={17} />,
      title: 'Join with a code',
      body: 'Have an invite code? Drop it in and you are in.',
      cta: 'Join',
      onClick: () => setModal('join-server'),
    },
    {
      icon: <SearchIcon size={17} />,
      title: 'Search everything',
      body: 'Jump to any message or person with ⌘K.',
      cta: 'Open search',
      onClick: () => setSearchOpen(true),
    },
  ];

  return (
    <div className="panel relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden">
      <header className="panel-header flex items-center gap-3 px-6 py-4">
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-halo-500 to-aqua-500">
          <SparklesIcon size={19} className="text-white" />
        </span>
        <div>
          <h1 className="text-base font-extrabold tracking-tight text-white">
            Hey {displayNameOf(boot.me).split(' ')[0]} 👋
          </h1>
          <p className="text-xs text-mist-500">
            {onlineFriends.length} friend{onlineFriends.length === 1 ? '' : 's'} online · {boot.servers.length} space
            {boot.servers.length === 1 ? '' : 's'} · {boot.dms.length} conversation{boot.dms.length === 1 ? '' : 's'}
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-5 scroll-thin">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {actions.map((action) => (
            <button
              key={action.title}
              type="button"
              onClick={action.onClick}
              className="glass-soft group flex flex-col items-start gap-2 rounded-3xl p-4 text-left transition hover:border-halo-400/40 hover:bg-white/6"
            >
              <span className="grid h-9 w-9 place-items-center rounded-2xl bg-gradient-to-br from-halo-500/30 to-aqua-500/20 text-halo-200">
                {action.icon}
              </span>
              <span className="text-sm font-bold text-white">{action.title}</span>
              <span className="text-xs leading-relaxed text-mist-400">{action.body}</span>
              <span className="mt-1 text-[11px] font-semibold text-halo-300 group-hover:text-halo-200">{action.cta} →</span>
            </button>
          ))}
        </div>

        {liveCalls.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-mist-400">Live calls</h2>
            <div className="flex flex-wrap gap-2">
              {liveCalls.map(({ server, channel, count }) => (
                <button
                  key={channel.id}
                  type="button"
                  onClick={() => void joinVoiceChannel(channel, server.name)}
                  className="glass-soft flex items-center gap-3 rounded-2xl px-3 py-2 text-left transition hover:border-mint-400/40"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-mint-400/20 text-mint-400">
                    <PhoneIcon size={15} />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-white">
                      {server.name} · {channel.name}
                    </span>
                    <span className="block text-[11px] text-mist-500">{count} connected · tap to join</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[1.2fr_1fr]">
          <section>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-mist-400">Recent conversations</h2>
            <div className="space-y-1">
              {boot.dms.length === 0 && (
                <p className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-xs text-mist-500">
                  No direct messages yet. Open the Friends page and say hi to someone.
                </p>
              )}
              {boot.dms.slice(0, 8).map((dm) => (
                <button
                  key={dm.id}
                  type="button"
                  onClick={() => setView({ kind: 'dm', dmId: dm.id })}
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition hover:bg-white/5"
                >
                  <Avatar user={dm.other} size={38} presence={dm.other?.presence ?? 'offline'} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-bold text-white">
                        {dm.other ? displayNameOf(dm.other) : 'Unknown'}
                      </span>
                      <span className="ml-auto shrink-0 text-[10px] text-mist-600">{relativeTime(dm.lastMessageAt)}</span>
                    </span>
                    <span className="block truncate text-xs text-mist-500">
                      {dm.lastMessage ? dm.lastMessage.content || 'sent an image' : 'Say hello'}
                    </span>
                  </span>
                  {dm.unread > 0 && (
                    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-coral-400 px-1 text-[10px] font-bold text-ink-950">
                      {dm.unread}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-mist-400">Online now</h2>
            <div className="flex flex-wrap gap-2">
              {onlineFriends.length === 0 && (
                <p className="text-xs text-mist-500">
                  No friends online. {friends.length > 0 ? 'They will show up here.' : 'Add a friend to get started.'}
                </p>
              )}
              {onlineFriends.map((friend) => (
                <button
                  key={friend.id}
                  type="button"
                  onClick={() => void openDm(friend.id)}
                  className="glass-soft flex items-center gap-2 rounded-2xl px-2.5 py-1.5 transition hover:border-halo-400/40"
                >
                  <Avatar user={friend} size={26} presence={friend.presence} />
                  <span className="text-xs font-semibold text-mist-200">{displayNameOf(friend)}</span>
                </button>
              ))}
            </div>

            {unreadDms.length > 0 && (
              <>
                <h2 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wider text-mist-400">Unread</h2>
                <div className="space-y-1">
                  {unreadDms.map((dm) => (
                    <button
                      key={dm.id}
                      type="button"
                      onClick={() => setView({ kind: 'dm', dmId: dm.id })}
                      className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-xs text-mist-300 transition hover:bg-white/5"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-coral-400" />
                      {dm.other ? displayNameOf(dm.other) : 'Unknown'}
                      <span className="ml-auto text-[10px] text-mist-500">{dm.unread} new</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            <h2 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wider text-mist-400">Your spaces</h2>
            <div className="space-y-1.5">
              {boot.servers.slice(0, 4).map((server) => (
                <button
                  key={server.id}
                  type="button"
                  onClick={() => {
                    const first = server.channels[0];
                    if (first) setView({ kind: 'channel', serverId: server.id, channelId: first.id });
                  }}
                  className="flex w-full items-center gap-2.5 rounded-2xl px-2.5 py-2 text-left transition hover:bg-white/5"
                >
                  <span
                    className="squircle grid h-8 w-8 place-items-center text-[10px] font-extrabold text-white"
                    style={{ background: `linear-gradient(140deg, ${server.accent}, rgba(255,255,255,0.14))` }}
                  >
                    {server.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-mist-200">{server.name}</span>
                    <span className="flex items-center gap-1 text-[10px] text-mist-500">
                      <HashIcon size={10} /> {server.channels.filter((channel) => channel.type === 'text').length} channels
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
