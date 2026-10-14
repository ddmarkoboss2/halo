import { useEffect, useMemo, useRef, useState } from 'react';
import { displayNameOf } from '../lib/format';
import { voiceEngine } from '../lib/webrtc';
import { useApp, useVoiceStore } from '../store';
import { useUserMap } from '../lib/users';
import type { User } from '../types';
import { Avatar } from './Avatar';
import {
  HeadphonesIcon,
  HeadphonesOffIcon,
  MicIcon,
  MicOffIcon,
  PhoneIcon,
  PhoneOffIcon,
  ScreenIcon,
  VideoIcon,
  VideoOffIcon,
} from './icons';
import { IconButton } from './ui';

function VideoTile({
  stream,
  muted,
  mirrored,
  className = '',
}: {
  stream: MediaStream | null;
  muted?: boolean;
  mirrored?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.srcObject = stream;
    if (stream) void element.play().catch(() => undefined);
  }, [stream]);
  const hasVideo = Boolean(stream?.getVideoTracks().length);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={`h-full w-full object-cover ${mirrored ? '-scale-x-100' : ''} ${hasVideo ? '' : 'hidden'} ${className}`}
    />
  );
}

function Controls({ compact = false, onEnd }: { compact?: boolean; onEnd?: () => void }) {
  const voice = useVoiceStore();
  const endCall = useApp((state) => state.endCall);
  const leaveVoice = useApp((state) => state.leaveVoice);
  const size = compact ? 'sm' : 'md';

  return (
    <div className="flex items-center gap-1.5">
      <IconButton
        size={size}
        label={voice.micOn ? 'Mute' : 'Unmute'}
        active={voice.micOn}
        onClick={() => void voiceEngine.setMic(!voice.micOn)}
      >
        {voice.micOn ? <MicIcon size={compact ? 15 : 17} /> : <MicOffIcon size={compact ? 15 : 17} />}
      </IconButton>
      <IconButton
        size={size}
        label={voice.cameraOn ? 'Turn camera off' : 'Turn camera on'}
        active={voice.cameraOn}
        onClick={() => void voiceEngine.setCamera(!voice.cameraOn)}
      >
        {voice.cameraOn ? <VideoIcon size={compact ? 15 : 17} /> : <VideoOffIcon size={compact ? 15 : 17} />}
      </IconButton>
      <IconButton
        size={size}
        label={voice.screenOn ? 'Stop sharing' : 'Share screen'}
        active={voice.screenOn}
        onClick={() => void voiceEngine.setScreen(!voice.screenOn)}
      >
        <ScreenIcon size={compact ? 15 : 17} />
      </IconButton>
      <IconButton
        size={size}
        label={voice.deafened ? 'Undeafen' : 'Deafen'}
        active={!voice.deafened}
        onClick={() => voiceEngine.setDeafened(!voice.deafened)}
      >
        {voice.deafened ? <HeadphonesOffIcon size={compact ? 15 : 17} /> : <HeadphonesIcon size={compact ? 15 : 17} />}
      </IconButton>
      <button
        type="button"
        className="btn btn-danger ml-1 h-9 gap-2 px-3 text-xs"
        onClick={() => {
          if (onEnd) onEnd();
          else if (useApp.getState().call) endCall();
          else void leaveVoice();
        }}
      >
        <PhoneOffIcon size={15} />
        {compact ? '' : 'Leave'}
      </button>
    </div>
  );
}

export function VoiceDock() {
  const voice = useVoiceStore();
  const users = useUserMap();
  const me = useApp((state) => state.boot?.me);
  const leaveVoice = useApp((state) => state.leaveVoice);
  const call = useApp((state) => state.call);
  const [expanded, setExpanded] = useState(false);

  const stageVisible = expanded || voice.cameraOn || voice.screenOn || voice.peers.some((peer) => peer.cameraOn || peer.screenOn);

  if (voice.status === 'idle' || voice.mode !== 'channel') return null;

  return (
    <div className="pointer-events-none fixed bottom-4 left-[86px] z-30 w-[262px]">
      <div className="pointer-events-auto panel animate-rise overflow-hidden p-0">
        {stageVisible && (
          <div className="grid max-h-[320px] grid-cols-2 gap-1.5 overflow-y-auto p-2 scroll-thin">
            <div className="relative aspect-video overflow-hidden rounded-2xl border border-white/10 bg-ink-950">
              <VideoTile stream={voice.localStream} muted mirrored />
              {!voice.cameraOn && !voice.screenOn && (
                <div className="absolute inset-0 grid place-items-center">
                  <Avatar user={me ?? null} size={34} />
                </div>
              )}
              <span className="absolute bottom-1 left-1.5 rounded-md bg-ink-950/70 px-1.5 py-0.5 text-[9px] font-semibold text-mist-200">
                You {voice.screenOn ? '· sharing' : ''}
              </span>
            </div>
            {voice.peers.map((peer) => (
              <div key={peer.socketId} className="relative aspect-video overflow-hidden rounded-2xl border border-white/10 bg-ink-950">
                <VideoTile stream={peer.stream} />
                {!(peer.cameraOn || peer.screenOn) && (
                  <div className="absolute inset-0 grid place-items-center">
                    <Avatar user={users.get(peer.userId ?? '') ?? null} size={34} speaking={peer.speaking} />
                  </div>
                )}
                <span className="absolute bottom-1 left-1.5 rounded-md bg-ink-950/70 px-1.5 py-0.5 text-[9px] font-semibold text-mist-200">
                  {displayNameOf(users.get(peer.userId ?? '') ?? null)}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2.5 px-3 pt-3">
          <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-mint-400/20 text-mint-400">
            <PhoneIcon size={16} />
            {voice.status === 'live' && (
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-mint-400" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-white">{voice.label || 'Voice'}</p>
            <p className="truncate text-[10px] text-mist-400">
              {voice.status === 'connecting' ? 'Connecting…' : `${1 + voice.peers.length} connected`}
              {voice.error ? ` · ${voice.error}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="rounded-lg px-1.5 py-1 text-[10px] font-semibold text-mist-400 transition hover:bg-white/8 hover:text-white"
          >
            {expanded ? 'Hide' : 'Show'}
          </button>
        </div>

        <div className="flex items-center gap-1 px-2 pb-1 pt-2">
          {[me ?? null, ...voice.peers.map((peer) => users.get(peer.userId ?? '') ?? null)].slice(0, 5).map((user, index) => (
            <Avatar
              key={`${user?.id ?? 'unknown'}-${index}`}
              user={user}
              size={26}
              speaking={index === 0 ? voice.localSpeaking : voice.peers[index - 1]?.speaking}
            />
          ))}
          {voice.peers.length > 4 && <span className="text-[10px] text-mist-500">+{voice.peers.length - 4}</span>}
        </div>

        <div className="flex items-center justify-between gap-1 border-t border-white/6 px-2 py-2">
          <Controls compact />
          {!call && (
            <button
              type="button"
              onClick={() => void leaveVoice()}
              className="grid h-7 w-7 place-items-center rounded-xl text-coral-400 transition hover:bg-coral-400/20"
              title="Disconnect"
            >
              <PhoneOffIcon size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function CallStage() {
  const call = useApp((state) => state.call);
  const voice = useVoiceStore();
  const users = useUserMap();
  const me = useApp((state) => state.boot?.me);
  const endCall = useApp((state) => state.endCall);
  const outgoing = useApp((state) => state.outgoing);
  const [elapsed, setElapsed] = useState(0);

  const ringing = !call && outgoing;

  useEffect(() => {
    if (!call?.startedAt) return undefined;
    const timer = window.setInterval(() => setElapsed(Math.round((Date.now() - (call.startedAt ?? Date.now())) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [call?.startedAt]);

  const target = call?.with ?? outgoing?.with ?? null;
  const tiles = useMemo(() => {
    const list: { key: string; stream: MediaStream | null; user: User | null; mirrored?: boolean; label: string }[] = [];
    if (voice.localStream) {
      list.push({ key: 'local', stream: voice.localStream, user: me ?? null, mirrored: true, label: 'You' });
    }
    for (const peer of voice.peers) {
      list.push({
        key: peer.socketId,
        stream: peer.stream,
        user: users.get(peer.userId ?? '') ?? null,
        label: displayNameOf(users.get(peer.userId ?? '') ?? null),
      });
    }
    return list;
  }, [voice.localStream, voice.peers, me, users]);

  if (!call && !ringing) return null;

  const hasVideo = tiles.some((tile) => tile.stream?.getVideoTracks().length);

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-ink-950/80 p-6 backdrop-blur-md">
      <div className="panel animate-rise flex h-full max-h-[720px] w-full max-w-5xl flex-col overflow-hidden p-0">
        <header className="panel-header flex items-center gap-3 px-5 py-3.5">
          <Avatar user={target} size={38} presence={target?.presence ?? 'online'} />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">
              {target ? displayNameOf(target) : 'Call'}
              {call?.video ? ' · video call' : ' · voice call'}
            </p>
            <p className="text-[11px] text-mist-400">
              {ringing
                ? 'Ringing…'
                : call?.startedAt
                  ? `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')} · ${voice.status}`
                  : 'Connecting…'}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="chip !text-[10px]">
              {voice.error ?? (voice.peers.some((peer) => peer.connection === 'connected') ? 'Connected' : 'Negotiating')}
            </span>
          </div>
        </header>

        <div className="flex-1 overflow-hidden bg-ink-950/60 p-3">
          {ringing ? (
            <div className="grid h-full place-items-center">
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="animate-ring rounded-3xl">
                  <Avatar user={target} size={96} />
                </div>
                <p className="text-lg font-bold text-white">Calling {target ? displayNameOf(target) : '…'}</p>
                <p className="text-xs text-mist-400">They will get a ringing prompt on every device they are signed in on.</p>
                <button type="button" className="btn btn-danger h-10 px-5" onClick={endCall}>
                  <PhoneOffIcon size={16} /> Cancel
                </button>
              </div>
            </div>
          ) : hasVideo ? (
            <div
              className={`grid h-full gap-2 ${
                tiles.length <= 1 ? 'grid-cols-1' : tiles.length === 2 ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-3'
              }`}
            >
              {tiles.map((tile) => (
                <div key={tile.key} className="relative overflow-hidden rounded-3xl border border-white/10 bg-ink-900">
                  <VideoTile stream={tile.stream} muted={tile.key === 'local'} mirrored={tile.mirrored} />
                  {!(tile.stream?.getVideoTracks().length) && (
                    <div className="absolute inset-0 grid place-items-center">
                      <Avatar user={tile.user} size={72} />
                    </div>
                  )}
                  <span className="absolute bottom-2 left-2 rounded-lg bg-ink-950/70 px-2 py-1 text-[11px] font-semibold text-mist-100">
                    {tile.label}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid h-full place-items-center">
              <div className="flex flex-col items-center gap-5">
                <div className="flex items-center justify-center gap-4">
                  <div className={`rounded-3xl ${voice.localSpeaking ? 'speaking-halo' : ''}`}>
                    <Avatar user={me ?? null} size={84} />
                  </div>
                  {voice.peers.length > 0 && <span className="text-2xl text-mist-500">·</span>}
                  {voice.peers.slice(0, 3).map((peer) => (
                    <div key={peer.socketId} className={`rounded-3xl ${peer.speaking ? 'speaking-halo' : ''}`}>
                      <Avatar user={users.get(peer.userId ?? '') ?? null} size={84} />
                    </div>
                  ))}
                </div>
                <p className="text-sm text-mist-300">
                  {voice.peers.some((peer) => peer.connection === 'connected')
                    ? 'Connected — voice is flowing'
                    : 'Setting up the audio connection…'}
                </p>
                {voice.error && <p className="text-xs text-coral-400">{voice.error}</p>}
              </div>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-center gap-2 border-t border-white/6 px-5 py-3">
          <Controls onEnd={endCall} />
        </footer>
      </div>
    </div>
  );
}

export function IncomingCallPrompt() {
  const incoming = useApp((state) => state.incoming);
  const accept = useApp((state) => state.acceptCall);
  const decline = useApp((state) => state.declineCall);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!incoming) return undefined;
    setSeconds(0);
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [incoming]);

  if (!incoming) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[320px]">
      <div className="panel animate-rise overflow-hidden p-0">
        <div className="flex items-center gap-3 bg-gradient-to-r from-halo-500/25 to-aqua-500/15 px-4 py-3">
          <div className="animate-ring rounded-2xl">
            <Avatar user={incoming.with} size={44} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">{displayNameOf(incoming.with)}</p>
            <p className="text-[11px] text-mist-200">
              {incoming.video ? 'Video call' : 'Voice call'} · ringing {seconds}s
            </p>
          </div>
        </div>
        <div className="flex gap-2 p-3">
          <button type="button" className="btn btn-primary h-10 flex-1" onClick={accept}>
            <PhoneIcon size={16} /> Accept
          </button>
          <button type="button" className="btn btn-danger h-10 flex-1" onClick={decline}>
            <PhoneOffIcon size={16} /> Decline
          </button>
        </div>
      </div>
    </div>
  );
}

