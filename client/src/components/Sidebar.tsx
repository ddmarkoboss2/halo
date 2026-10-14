import { useState } from 'react';
import { api } from '../lib/api';
import { displayNameOf, isTypingName } from '../lib/format';
import { useUserMap } from '../lib/users';
import { voiceEngine } from '../lib/webrtc';
import { useApp, useVoiceStore } from '../store';
import type { Channel, Dm, Presence, Server } from '../types';
import { Avatar } from './Avatar';
import {
  ChevronDownIcon,
  ComposeIcon,
  HashIcon,
  HeadphonesIcon,
  HeadphonesOffIcon,
  LinkIcon,
  LogOutIcon,
  MicIcon,
  MicOffIcon,
  PlusIcon,
  SearchIcon,
  SlidersIcon,
  SparklesIcon,
  UsersIcon,
  VolumeIcon,
} from './icons';
import { IconButton, Spinner } from './ui';

function SectionLabel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-2 pb-1 pt-3">
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-mist-500">{children}</span>
      {action}
    </div>
  );
}

function VoiceRoster({ channelId }: { channelId: string }) {
  const participants = useApp((state) => state.rosters[`channel:${channelId}`]) ?? [];
  const users = useUserMap();
  const me = useApp((state) => state.boot?.me.id);
  if (participants.length === 0) return null;
  return (
    <ul className="mb-1 ml-3 space-y-0.5 border-l border-white/8 pl-2">
      {participants.map((participant) => {
        const user = users.get(participant.userId);
        return (
          <li key={participant.socketId} className="flex items-center gap-2 rounded-lg px-1.5 py-1">
            <Avatar user={user ?? null} size={22} speaking={participant.speaking} />
            <span className="truncate text-xs text-mist-300">
              {user ? displayNameOf(user) : 'Someone'}
              {participant.userId === me ? ' (you)' : ''}
            </span>
            {participant.muted && <MicOffIcon size={12} className="ml-auto shrink-0 text-coral-400" />}
            {participant.screen && <span className="text-[10px] text-aqua-400">SHARE</span>}
          </li>
        );
      })}
    </ul>
  );
}

export function Sidebar() {
  const view = useApp((state) => state.view);
  const boot = useApp((state) => state.boot);
  const setView = useApp((state) => state.setView);
  const setModal = useApp((state) => state.setModal);
  const setSearchOpen = useApp((state) => state.setSearchOpen);
  const openDm = useApp((state) => state.openDm);
  const typing = useApp((state) => state.typing);
  const refresh = useApp((state) => state.refresh);
  const pushToast = useApp((state) => state.pushToast);
  const joinVoiceChannel = useApp((state) => state.joinVoiceChannel);
  const [menuOpen, setMenuOpen] = useState(false);

  const server: Server | null =
    view.kind === 'channel' ? (boot?.servers.find((item) => item.id === view.serverId) ?? null) : null;

  const textChannels = server?.channels.filter((channel) => channel.type === 'text') ?? [];
  const voiceChannels = server?.channels.filter((channel) => channel.type === 'voice') ?? [];
  const activeVoiceScopeId = useVoiceStore((state) => (state.mode === 'channel' ? state.scopeId : null));

  const dms = boot?.dms ?? [];
  const incoming = (boot?.friendships ?? []).filter((f) => f.status === 'pending' && f.direction === 'incoming');

  return (
    <aside className="panel relative z-10 flex h-full w-[270px] shrink-0 flex-col overflow-hidden">
      {server ? (
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="panel-header flex w-full items-center gap-2.5 px-3.5 py-3.5 text-left transition hover:bg-white/5"
          >
            <span
              className="squircle grid h-8 w-8 place-items-center text-[11px] font-extrabold text-white"
              style={{ background: `linear-gradient(140deg, ${server.accent}, rgba(255,255,255,0.15))` }}
            >
              {server.name.slice(0, 2).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-white">{server.name}</span>
              <span className="block truncate text-[11px] text-mist-500">
                {server.memberCount} member{server.memberCount === 1 ? '' : 's'}
              </span>
            </span>
            <ChevronDownIcon size={15} className={`text-mist-400 transition ${menuOpen ? 'rotate-180' : ''}`} />
          </button>
          {menuOpen && (
            <>
              <button
                type="button"
                aria-label="Close menu"
                className="fixed inset-0 z-30 cursor-default"
                onClick={() => setMenuOpen(false)}
              />
              <div className="panel animate-pop absolute left-2 right-2 top-[62px] z-40 overflow-hidden p-1.5">
                <MenuItem
                  icon={<LinkIcon size={14} />}
                  label="Copy invite code"
                  hint={server.inviteCode}
                  onClick={() => {
                    void navigator.clipboard.writeText(server.inviteCode);
                    pushToast({ title: 'Invite code copied', body: server.inviteCode, accent: server.accent });
                    setMenuOpen(false);
                  }}
                />
                <MenuItem
                  icon={<UsersIcon size={14} />}
                  label="Invite people"
                  onClick={() => {
                    setModal('add-friend');
                    setMenuOpen(false);
                  }}
                />
                <MenuItem
                  icon={<SlidersIcon size={14} />}
                  label="Server settings"
                  onClick={() => {
                    setModal('server-settings');
                    setMenuOpen(false);
                  }}
                />
                <MenuItem
                  icon={<LogOutIcon size={14} />}
                  label={server.ownerId === boot?.me.id ? 'Delete server' : 'Leave server'}
                  danger
                  onClick={async () => {
                    setMenuOpen(false);
                    const result = await api.leaveServer(server.id).catch(() => null);
                    if (result) {
                      setView({ kind: 'home' });
                      await refresh();
                    }
                  }}
                />
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="panel-header flex w-full items-center gap-2 px-3.5 py-3.5 text-left transition hover:bg-white/5"
          >
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-halo-500 to-aqua-500">
              <SparklesIcon size={16} className="text-white" />
            </span>
            <span className="flex-1 text-sm font-bold text-white">
              {view.kind === 'friends' ? 'Friends' : 'Direct messages'}
            </span>
            <ChevronDownIcon size={15} className={`text-mist-400 transition ${menuOpen ? 'rotate-180' : ''}`} />
          </button>
          {menuOpen && (
            <>
              <button
                type="button"
                aria-label="Close menu"
                className="fixed inset-0 z-30 cursor-default"
                onClick={() => setMenuOpen(false)}
              />
              <div className="panel animate-pop absolute left-2 right-2 top-[62px] z-40 overflow-hidden p-1.5">
                <MenuItem
                  icon={<UsersIcon size={14} />}
                  label="Friends"
                  onClick={() => {
                    setView({ kind: 'friends' });
                    setMenuOpen(false);
                  }}
                />
                <MenuItem
                  icon={<SearchIcon size={14} />}
                  label="Search everything"
                  hint="⌘K"
                  onClick={() => {
                    setSearchOpen(true);
                    setMenuOpen(false);
                  }}
                />
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2 pb-2 scroll-thin">
        {server ? (
          <>
            <ChannelSection
              label="Text channels"
              channels={textChannels}
              render={(channel) => (
                <button
                  key={channel.id}
                  type="button"
                  onClick={() => setView({ kind: 'channel', serverId: server.id, channelId: channel.id })}
                  className={`group flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition ${
                    view.kind === 'channel' && view.channelId === channel.id
                      ? 'bg-white/10 text-white'
                      : 'text-mist-400 hover:bg-white/5 hover:text-mist-200'
                  }`}
                >
                  <HashIcon size={15} className="shrink-0 opacity-70" />
                  <span className="min-w-0 flex-1 truncate text-sm">{channel.name}</span>
                  {(channel.unread ?? 0) > 0 && (
                    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-halo-500 px-1 text-[10px] font-bold text-white">
                      {channel.unread}
                    </span>
                  )}
                </button>
              )}
              action={
                <AddChannelButton serverId={server.id} type="text" onDone={refresh} />
              }
            />
            <ChannelSection
              label="Voice channels"
              channels={voiceChannels}
              render={(channel) => (
                <div key={channel.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (activeVoiceScopeId === channel.id) return;
                      void joinVoiceChannel(channel, server.name);
                    }}
                    className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition ${
                      activeVoiceScopeId === channel.id
                        ? 'bg-mint-400/15 text-mint-400'
                        : 'text-mist-400 hover:bg-white/5 hover:text-mist-200'
                    }`}
                  >
                    <VolumeIcon size={15} className="shrink-0 opacity-80" />
                    <span className="min-w-0 flex-1 truncate text-sm">{channel.name}</span>
                    <VoiceCount channelId={channel.id} />
                  </button>
                  <VoiceRoster channelId={channel.id} />
                </div>
              )}
              action={<AddChannelButton serverId={server.id} type="voice" onDone={refresh} />}
            />
          </>
        ) : (
          <>
            <SectionLabel>Conversations</SectionLabel>
            <button
              type="button"
              onClick={() => setModal('add-friend')}
              className="mb-1 flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-mist-300 transition hover:bg-white/5 hover:text-white"
            >
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-white/6">
                <UsersIcon size={15} />
              </span>
              <span className="text-sm font-semibold">Friends</span>
              {incoming.length > 0 && (
                <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-mint-400 px-1 text-[10px] font-bold text-ink-950">
                  {incoming.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="mb-2 flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-mist-300 transition hover:bg-white/5 hover:text-white"
            >
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-white/6">
                <SearchIcon size={15} />
              </span>
              <span className="text-sm font-semibold">Find anyone</span>
            </button>

            {dms.map((dm) => (
              <DmRow key={dm.id} dm={dm} typingKey={typing[`dm:${dm.id}`]} onOpen={() => setView({ kind: 'dm', dmId: dm.id })} />
            ))}

            <button
              type="button"
              onClick={() => setModal('add-friend')}
              className="mt-2 flex w-full items-center gap-2 rounded-xl border border-dashed border-white/10 px-3 py-2 text-xs font-semibold text-mist-400 transition hover:border-halo-400/40 hover:text-white"
            >
              <ComposeIcon size={14} />
              Start a new conversation
            </button>
            <OpenDmPicker onPick={openDm} />
          </>
        )}
      </div>

      <UserCard />
    </aside>
  );
}

function ChannelSection({
  label,
  channels,
  render,
  action,
}: {
  label: string;
  channels: Channel[];
  render: (channel: Channel) => React.ReactNode;
  action: React.ReactNode;
}) {
  return (
    <div className="mb-2">
      <SectionLabel action={action}>{label}</SectionLabel>
      <ul className="space-y-0.5">{channels.map((channel) => render(channel))}</ul>
    </div>
  );
}

function AddChannelButton({ serverId, type, onDone }: { serverId: string; type: 'text' | 'voice'; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const pushToast = useApp((state) => state.pushToast);

  if (!open) {
    return (
      <button
        type="button"
        title={type === 'text' ? 'New text channel' : 'New voice channel'}
        onClick={() => setOpen(true)}
        className="grid h-6 w-6 place-items-center rounded-lg text-mist-500 transition hover:bg-white/10 hover:text-white"
      >
        <PlusIcon size={14} />
      </button>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api.createChannel(serverId, { name, type });
      setName('');
      setOpen(false);
      onDone();
    } catch (error) {
      pushToast({ title: 'Could not create channel', body: error instanceof Error ? error.message : '', kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex items-center gap-1">
      <input
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={type === 'text' ? 'new-channel' : 'New voice'}
        className="h-6 w-24 rounded-md border border-halo-400/40 bg-ink-950/70 px-1.5 text-[11px] text-white outline-none"
        onBlur={() => !busy && setOpen(false)}
      />
      {busy && <Spinner size={12} />}
    </form>
  );
}

function VoiceCount({ channelId }: { channelId: string }) {
  const count = useApp((state) => state.rosters[`channel:${channelId}`]?.length ?? 0);
  if (count === 0) return null;
  return <span className="chip !px-2 !py-0.5 !text-[10px]">{count}</span>;
}

function DmRow({ dm, typingKey, onOpen }: { dm: Dm; typingKey?: { displayName: string }[]; onOpen: () => void }) {
  const view = useApp((state) => state.view);
  const active = view.kind === 'dm' && view.dmId === dm.id;
  const preview = typingKey?.length ? isTypingName(typingKey) : dm.lastMessage?.content || 'No messages yet';
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition ${
        active ? 'bg-white/10' : 'hover:bg-white/5'
      }`}
    >
      <Avatar user={dm.other} size={34} presence={dm.other?.presence ?? 'offline'} />
      <span className="min-w-0 flex-1">
        <span className={`flex items-center gap-2 text-sm font-semibold ${active ? 'text-white' : 'text-mist-200'}`}>
          <span className="truncate">{dm.other ? displayNameOf(dm.other) : 'Unknown'}</span>
          {dm.unread > 0 && (
            <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-coral-400 px-1 text-[10px] font-bold text-ink-950">
              {dm.unread}
            </span>
          )}
        </span>
        <span className={`block truncate text-[11px] ${typingKey?.length ? 'text-halo-300' : 'text-mist-500'}`}>
          {typingKey?.length ? `${isTypingName(typingKey)}…` : preview}
        </span>
      </span>
    </button>
  );
}

function OpenDmPicker({ onPick }: { onPick: (userId: string) => Promise<string | null> }) {
  const friends = useApp((state) => state.boot?.friends) ?? [];
  if (friends.length === 0) return null;
  return (
    <div className="mt-3 px-1">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-mist-500">Jump back in</p>
      <div className="flex flex-wrap gap-1.5">
        {friends.slice(0, 8).map((friend) => (
          <button
            key={friend.id}
            type="button"
            title={displayNameOf(friend)}
            onClick={() => void onPick(friend.id)}
            className="rounded-full transition hover:scale-110"
          >
            <Avatar user={friend} size={28} presence={friend.presence} />
          </button>
        ))}
      </div>
    </div>
  );
}

function MenuItem({
  icon,
  label,
  hint,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition ${
        danger ? 'text-coral-400 hover:bg-coral-400/15' : 'text-mist-200 hover:bg-white/8 hover:text-white'
      }`}
    >
      <span className="text-mist-400">{icon}</span>
      <span className="flex-1">{label}</span>
      {hint && <span className="font-mono text-[10px] text-mist-500">{hint}</span>}
    </button>
  );
}

function UserCard() {
  const boot = useApp((state) => state.boot);
  const setPresence = useApp((state) => state.setPresence);
  const setModal = useApp((state) => state.setModal);
  const signOut = useApp((state) => state.signOut);
  const [open, setOpen] = useState(false);
  const voice = useVoiceStore();
  const live = voice.status === 'live';

  if (!boot) return null;
  const me = boot.me;

  const presenceOptions: { value: Presence; label: string; color: string }[] = [
    { value: 'online', label: 'Online', color: '#34d399' },
    { value: 'idle', label: 'Idle', color: '#fbbf24' },
    { value: 'dnd', label: 'Do not disturb', color: '#fb7185' },
    { value: 'offline', label: 'Invisible', color: '#6b7091' },
  ];

  return (
    <div className="relative mt-auto border-t border-white/6 bg-ink-950/40 p-2">
      {open && (
        <>
          <button type="button" aria-label="Close menu" className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
          <div className="panel animate-pop absolute bottom-16 left-2 right-2 z-40 overflow-hidden p-1.5">
            <p className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-mist-500">
              {displayNameOf(me)} · @{me.username}
            </p>
            {presenceOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setPresence(option.value);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm text-mist-200 transition hover:bg-white/8 hover:text-white"
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: option.color }} />
                {option.label}
                {me.presence === option.value && <span className="ml-auto text-[10px] text-mist-500">current</span>}
              </button>
            ))}
            <div className="my-1 h-px bg-white/6" />
            <MenuItem
              icon={<SlidersIcon size={14} />}
              label="Profile settings"
              onClick={() => {
                setModal('settings');
                setOpen(false);
              }}
            />
            <MenuItem
              icon={<LogOutIcon size={14} />}
              label="Sign out"
              danger
              onClick={() => {
                setOpen(false);
                void signOut();
              }}
            />
          </div>
        </>
      )}

      <div className="flex items-center gap-1.5 rounded-2xl bg-white/4 p-1.5">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-1.5 py-1 text-left transition hover:bg-white/6"
        >
          <Avatar user={me} size={32} presence={me.presence} />
          <span className="min-w-0">
            <span className="block truncate text-xs font-bold text-white">{displayNameOf(me)}</span>
            <span className="block truncate text-[10px] text-mist-500">
              {me.customStatus || (live ? `In call · ${voice.label}` : presenceOptions.find((o) => o.value === me.presence)?.label)}
            </span>
          </span>
        </button>
        <IconButton
          label={live ? (voice.micOn ? 'Mute microphone' : 'Unmute microphone') : 'Join a voice channel to use your mic'}
          size="sm"
          disabled={!live}
          onClick={() => void voiceEngine.setMic(!voice.micOn)}
          className={live && !voice.micOn ? '!text-coral-400' : ''}
        >
          {live && !voice.micOn ? <MicOffIcon size={15} /> : <MicIcon size={15} />}
        </IconButton>
        <IconButton
          label={live ? (voice.deafened ? 'Undeafen' : 'Deafen') : 'Join a voice channel to use audio'}
          size="sm"
          disabled={!live}
          onClick={() => voiceEngine.setDeafened(!voice.deafened)}
          className={live && voice.deafened ? '!text-coral-400' : ''}
        >
          {live && voice.deafened ? <HeadphonesOffIcon size={15} /> : <HeadphonesIcon size={15} />}
        </IconButton>
      </div>
    </div>
  );
}
