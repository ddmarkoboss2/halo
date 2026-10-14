import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { displayNameOf, PRESENCE_META, relativeTime } from '../lib/format';
import { useApp } from '../store';
import { Avatar } from './Avatar';
import { CloseIcon, CompassIcon, HeartIcon, PhoneIcon, UserPlusIcon, VideoIcon } from './icons';
import { Spinner } from './ui';

export function ProfilePanel() {
  const profileId = useApp((state) => state.activeProfileId);
  const profile = useApp((state) => state.profile);
  const close = useApp((state) => state.closeProfile);
  const openDm = useApp((state) => state.openDm);
  const startCall = useApp((state) => state.startCall);
  const refresh = useApp((state) => state.refresh);
  const pushToast = useApp((state) => state.pushToast);
  const me = useApp((state) => state.boot?.me);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!profileId) return undefined;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [profileId, close]);

  if (!profileId) return null;

  const isMe = profileId === me?.id;
  const friendship = profile?.friendship;

  const addFriend = async () => {
    if (!profile) return;
    setBusy(true);
    try {
      const result = await api.addFriend(profile.username);
      pushToast({ title: result.accepted ? 'You are now friends' : 'Request sent', body: `@${profile.username}` });
      const { user } = await api.user(profile.id);
      await refresh();
      useApp.setState({ profile: user });
    } catch (error) {
      pushToast({ title: 'Could not add friend', body: error instanceof Error ? error.message : '', kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const acceptFriend = async () => {
    if (!friendship?.id) return;
    await api.acceptFriend(friendship.id).catch(() => null);
    const { user } = await api.user(profileId);
    await refresh();
    useApp.setState({ profile: user });
  };

  const message = async () => {
    const dmId = await openDm(profileId);
    if (dmId) {
      close();
      useApp.getState().setView({ kind: 'dm', dmId });
    }
  };

  const call = async (video: boolean) => {
    if (!profile) return;
    const dmId = await openDm(profileId);
    if (dmId) {
      close();
      startCall(profile, dmId, video);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button type="button" aria-label="Close profile" className="flex-1 cursor-default bg-ink-950/50 backdrop-blur-sm" onClick={close} />
      <div className="panel animate-rise mr-4 my-4 flex w-[320px] flex-col overflow-hidden p-0">
        <div
          className="relative h-24"
          style={{
            background: profile
              ? `linear-gradient(140deg, ${profile.accent}66, rgba(34,211,238,0.25))`
              : 'rgba(255,255,255,0.05)',
          }}
        >
          <button
            type="button"
            onClick={close}
            className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-xl bg-ink-950/50 text-mist-200 transition hover:text-white"
            aria-label="Close"
          >
            <CloseIcon size={15} />
          </button>
        </div>

        <div className="-mt-10 px-5">
          {profile ? (
            <>
              <Avatar user={profile} size={72} presence={profile.presence} />
              <h2 className="mt-3 text-lg font-extrabold text-white">{displayNameOf(profile)}</h2>
              <p className="text-xs text-mist-500">@{profile.username}</p>
              <p className="mt-1 text-[11px] font-semibold" style={{ color: PRESENCE_META[profile.presence].color }}>
                {PRESENCE_META[profile.presence].label}
                {profile.presence === 'offline' && profile.lastSeen ? ` · last seen ${relativeTime(profile.lastSeen)}` : ''}
              </p>
            </>
          ) : (
            <div className="flex justify-center pt-6">
              <Spinner size={22} />
            </div>
          )}
        </div>

        {profile && (
          <div className="flex-1 overflow-y-auto px-5 py-4 scroll-thin">
            {profile.customStatus && (
              <div className="mb-3 rounded-2xl border border-white/8 bg-white/4 px-3 py-2 text-xs text-mist-200">
                {profile.customStatus}
              </div>
            )}
            {profile.bio && <p className="mb-3 text-xs leading-relaxed text-mist-300">{profile.bio}</p>}

            {profile.mutualServers && profile.mutualServers.length > 0 && (
              <div className="mb-4">
                <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-mist-500">
                  <CompassIcon size={12} /> Shared spaces
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {profile.mutualServers.map((server) => (
                    <span key={server.id} className="chip" style={{ borderColor: `${server.accent}55`, color: server.accent }}>
                      {server.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {!isMe && (
              <div className="space-y-2">
                <button type="button" className="btn btn-primary h-10 w-full" onClick={() => void message()}>
                  <HeartIcon size={15} /> Message
                </button>
                <div className="flex gap-2">
                  <button type="button" className="btn btn-ghost h-10 flex-1" onClick={() => void call(false)}>
                    <PhoneIcon size={15} /> Voice
                  </button>
                  <button type="button" className="btn btn-ghost h-10 flex-1" onClick={() => void call(true)}>
                    <VideoIcon size={15} /> Video
                  </button>
                </div>

                {friendship?.status === 'none' && (
                  <button type="button" className="btn btn-ghost h-10 w-full" disabled={busy} onClick={() => void addFriend()}>
                    {busy ? <Spinner size={14} /> : <UserPlusIcon size={15} />} Add friend
                  </button>
                )}
                {friendship?.status === 'pending' && friendship.direction === 'incoming' && (
                  <button type="button" className="btn btn-primary h-10 w-full" onClick={() => void acceptFriend()}>
                    Accept friend request
                  </button>
                )}
                {friendship?.status === 'pending' && friendship.direction === 'outgoing' && (
                  <p className="text-center text-xs text-mist-500">Friend request pending</p>
                )}
                {friendship?.status === 'accepted' && (
                  <button
                    type="button"
                    className="btn btn-ghost h-10 w-full !text-coral-400"
                    onClick={async () => {
                      await api.removeFriend(profileId).catch(() => null);
                      await refresh();
                      const { user } = await api.user(profileId);
                      useApp.setState({ profile: user });
                    }}
                  >
                    Remove friend
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
