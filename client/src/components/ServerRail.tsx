import { useApp } from '../store';
import { initials } from '../lib/format';
import { CompassIcon, PlusIcon, SparklesIcon, UsersIcon } from './icons';
import { IconButton } from './ui';

export function ServerRail() {
  const boot = useApp((state) => state.boot);
  const view = useApp((state) => state.view);
  const setView = useApp((state) => state.setView);
  const setModal = useApp((state) => state.setModal);
  const connection = useApp((state) => state.connection);
  const friendships = boot?.friendships ?? [];
  const pendingCount = friendships.filter((f) => f.status === 'pending' && f.direction === 'incoming').length;

  const servers = boot?.servers ?? [];
  const unreadByServer = new Map<string, number>();
  for (const server of servers) {
    const unread = server.channels.reduce((total, channel) => total + (channel.unread ?? 0), 0);
    unreadByServer.set(server.id, unread);
  }
  const dmUnread = (boot?.dms ?? []).reduce((total, dm) => total + dm.unread, 0);

  const activeServerId = view.kind === 'channel' ? view.serverId : null;

  return (
    <nav className="relative z-10 flex h-full w-[74px] shrink-0 flex-col items-center gap-3 py-4">
      <button
        type="button"
        title="Direct messages"
        onClick={() => setView({ kind: 'home' })}
        className={`relative grid h-12 w-12 place-items-center transition-transform hover:scale-105 ${
          view.kind === 'home' || view.kind === 'dm' || view.kind === 'friends' ? 'squircle' : 'squircle'
        }`}
        style={{
          background:
            view.kind === 'home' || view.kind === 'dm' || view.kind === 'friends'
              ? 'linear-gradient(140deg, #7c5cff, #22d3ee)'
              : 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <SparklesIcon size={22} className="text-white" />
        {dmUnread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-coral-400 px-1 text-[10px] font-bold text-ink-950">
            {dmUnread > 9 ? '9+' : dmUnread}
          </span>
        )}
      </button>

      <div className="h-px w-8 bg-white/10" />

      <div className="flex w-full flex-1 flex-col items-center gap-3 overflow-y-auto scroll-thin">
        {servers.map((server) => {
          const active = server.id === activeServerId;
          const unread = unreadByServer.get(server.id) ?? 0;
          const firstChannel = server.channels.find((channel) => channel.type === 'text') ?? server.channels[0];
          return (
            <button
              key={server.id}
              type="button"
              title={server.name}
              onClick={() => {
                if (firstChannel) setView({ kind: 'channel', serverId: server.id, channelId: firstChannel.id });
                else setModal('server-settings');
              }}
              className="group relative grid h-12 w-12 place-items-center transition-transform hover:scale-105"
            >
              <span
                className={`absolute -left-3 h-8 w-1.5 rounded-r-full bg-white transition-all ${
                  active ? 'opacity-100' : unread > 0 ? 'h-2 opacity-70' : 'opacity-0 group-hover:opacity-40'
                }`}
              />
              <span
                className="squircle grid h-full w-full place-items-center text-sm font-extrabold text-white/95 transition"
                style={{
                  background: server.iconUrl ? undefined : `linear-gradient(140deg, ${server.accent}, rgba(255,255,255,0.12))`,
                  border: active ? '1px solid rgba(255,255,255,0.35)' : '1px solid rgba(255,255,255,0.08)',
                }}
              >
                {server.iconUrl ? (
                  <img src={server.iconUrl} alt={server.name} className="h-full w-full rounded-[34%] object-cover" />
                ) : (
                  initials(server.name)
                )}
              </span>
              {unread > 0 && !active && (
                <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-halo-400 px-1 text-[10px] font-bold text-ink-950">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>
          );
        })}

        <IconButton label="Create a server" onClick={() => setModal('create-server')} className="h-12 w-12 rounded-[16px]">
          <PlusIcon size={20} />
        </IconButton>
        <IconButton label="Join with an invite code" onClick={() => setModal('join-server')} className="h-12 w-12 rounded-[16px]">
          <CompassIcon size={19} />
        </IconButton>
      </div>

      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          title="Friends"
          onClick={() => setView({ kind: 'friends' })}
          className="relative grid h-11 w-11 place-items-center rounded-[15px] border border-white/8 bg-white/5 text-mist-200 transition hover:text-white"
        >
          <UsersIcon size={19} />
          {pendingCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-mint-400 px-1 text-[10px] font-bold text-ink-950">
              {pendingCount}
            </span>
          )}
        </button>
        <span
          title={connection === 'online' ? 'Realtime connected' : connection === 'connecting' ? 'Connecting…' : 'Offline'}
          className="mb-1 h-2.5 w-2.5 rounded-full"
          style={{
            background: connection === 'online' ? '#34d399' : connection === 'connecting' ? '#fbbf24' : '#fb7185',
            boxShadow: connection === 'online' ? '0 0 12px rgba(52,211,153,0.8)' : 'none',
          }}
        />
      </div>
    </nav>
  );
}
