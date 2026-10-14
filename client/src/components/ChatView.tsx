import { useCallback, useEffect, useMemo, useState } from 'react';
import { displayNameOf, relativeTime } from '../lib/format';
import { useApp, useVoiceStore } from '../store';
import type { Message } from '../types';
import { Avatar } from './Avatar';
import { Composer } from './Composer';
import { MessageList } from './MessageList';
import { MemberList } from './MemberList';
import {
  HashIcon,
  PhoneIcon,
  SearchIcon,
  UsersIcon,
  VideoIcon,
  VolumeIcon,
} from './icons';
import { EmptyState, IconButton } from './ui';

export function ChatView() {
  const view = useApp((state) => state.view);
  const boot = useApp((state) => state.boot);
  const setView = useApp((state) => state.setView);
  const toggleMemberList = useApp((state) => state.memberListOpen);
  const toggleMemberListAction = useApp((state) => state.toggleMemberList);
  const setSearchOpen = useApp((state) => state.setSearchOpen);
  const openProfile = useApp((state) => state.openProfile);
  const startCall = useApp((state) => state.startCall);
  const joinVoiceChannel = useApp((state) => state.joinVoiceChannel);
  const leaveVoice = useApp((state) => state.leaveVoice);
  const voice = useVoiceStore();
  const [replyTo, setReplyTo] = useState<Message | null>(null);

  const context = useMemo(() => {
    if (view.kind === 'channel') {
      const server = boot?.servers.find((item) => item.id === view.serverId);
      const channel = server?.channels.find((item) => item.id === view.channelId);
      if (server && channel) return { kind: 'channel' as const, server, channel };
    }
    if (view.kind === 'dm') {
      const dm = boot?.dms.find((item) => item.id === view.dmId);
      if (dm) return { kind: 'dm' as const, dm };
    }
    return null;
  }, [view, boot]);

  const onReply = useCallback((message: Message) => setReplyTo(message), []);

  const scope = view.kind === 'channel' ? 'channel' : 'dm';
  const scopeId = view.kind === 'channel' ? view.channelId : view.kind === 'dm' ? view.dmId : '';
  const markRead = useApp((state) => state.markRead);

  // Opening a conversation clears its unread badge and keeps it clear while open.
  useEffect(() => {
    if (!scopeId) return;
    void markRead(scope, scopeId);
  }, [markRead, scope, scopeId]);

  if (!context || !scopeId) {
    return (
      <div className="panel relative z-10 min-w-0 flex-1 overflow-hidden">
        <EmptyState
          icon={<SearchIcon size={22} />}
          title="Nothing selected"
          body="Pick a channel from the sidebar, or start a conversation from the Friends page."
          action={
            <button type="button" className="btn btn-primary h-9 px-4 text-sm" onClick={() => setView({ kind: 'friends' })}>
              Find people
            </button>
          }
        />
      </div>
    );
  }

  const canModerate =
    context.kind === 'channel' &&
    (context.server.ownerId === boot?.me.id || context.server.member?.role === 'owner' || context.server.member?.role === 'admin');

  const key = `${scope}:${scopeId}`;
  const roster = useApp((state) => state.rosters[key]) ?? [];

  return (
    <div className="relative z-10 flex min-w-0 flex-1 gap-3">
      <section className="panel flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="panel-header flex items-center gap-3 px-4 py-3">
          {context.kind === 'channel' ? (
            <>
              <span
                className="squircle grid h-9 w-9 place-items-center text-[11px] font-extrabold text-white"
                style={{ background: `linear-gradient(140deg, ${context.server.accent}, rgba(255,255,255,0.14))` }}
              >
                {context.server.name.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0">
                <h1 className="flex items-center gap-1.5 text-sm font-bold text-white">
                  <HashIcon size={14} className="text-mist-400" />
                  <span className="truncate">{context.channel.name}</span>
                </h1>
                <p className="truncate text-[11px] text-mist-500">
                  {context.channel.topic || context.server.name}
                </p>
              </div>
            </>
          ) : (
            <>
              <button type="button" onClick={() => context.dm.other && void openProfile(context.dm.other.id)}>
                <Avatar user={context.dm.other} size={38} presence={context.dm.other?.presence ?? 'offline'} />
              </button>
              <div className="min-w-0">
                <h1 className="truncate text-sm font-bold text-white">
                  {context.dm.other ? displayNameOf(context.dm.other) : 'Direct message'}
                </h1>
                <p className="truncate text-[11px] text-mist-500">
                  {context.dm.other?.presence === 'online'
                    ? 'Active now'
                    : context.dm.other?.customStatus || `Last seen ${relativeTime(context.dm.other?.lastSeen ?? 0)}`}
                </p>
              </div>
            </>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            {context.kind === 'dm' && (
              <>
                <IconButton
                  label="Start voice call"
                  onClick={() => context.dm.other && startCall(context.dm.other, context.dm.id, false)}
                >
                  <PhoneIcon size={16} />
                </IconButton>
                <IconButton
                  label="Start video call"
                  onClick={() => context.dm.other && startCall(context.dm.other, context.dm.id, true)}
                >
                  <VideoIcon size={16} />
                </IconButton>
              </>
            )}
            <IconButton label="Search messages" onClick={() => setSearchOpen(true)}>
              <SearchIcon size={16} />
            </IconButton>
            {context.kind === 'channel' && (
              <IconButton
                label={toggleMemberList ? 'Hide member list' : 'Show member list'}
                active={toggleMemberList}
                onClick={toggleMemberListAction}
              >
                <UsersIcon size={16} />
              </IconButton>
            )}
          </div>
        </header>

        <MessageList scope={scope} scopeId={scopeId} canModerate={Boolean(canModerate)} onReply={onReply} />

        {roster.length > 0 && scope === 'channel' && (
          <div className="mx-4 mb-2 flex items-center gap-3 rounded-2xl border border-mint-400/25 bg-mint-400/10 px-3 py-2">
            <VolumeIcon size={15} className="text-mint-400" />
            <span className="text-xs font-semibold text-mint-400">{roster.length} in voice</span>
            <span className="truncate text-[11px] text-mist-400">
              {roster.length} participant{roster.length === 1 ? '' : 's'} connected
            </span>
            {voice.mode === 'channel' && voice.scopeId === scopeId ? (
              <button type="button" className="btn btn-danger ml-auto h-7 px-3 text-[11px]" onClick={() => void leaveVoice()}>
                Leave
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-ghost ml-auto h-7 px-3 text-[11px]"
                onClick={() => context.kind === 'channel' && void joinVoiceChannel(context.channel, context.server.name)}
              >
                Join voice
              </button>
            )}
          </div>
        )}

        <Composer
          scope={scope}
          scopeId={scopeId}
          placeholder={
            context.kind === 'channel'
              ? `Message #${context.channel.name}`
              : `Message ${context.dm.other ? displayNameOf(context.dm.other) : ''}`
          }
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
        />
      </section>

      {context.kind === 'channel' && toggleMemberList && <MemberList serverId={context.server.id} />}
    </div>
  );
}
