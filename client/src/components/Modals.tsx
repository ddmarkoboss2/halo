import { useState } from 'react';
import { api } from '../lib/api';
import { accentList, displayNameOf } from '../lib/format';
import { useApp } from '../store';
import type { User } from '../types';
import { Avatar } from './Avatar';
import { Field, Modal, Spinner } from './ui';
import { HashIcon, TrashIcon, UserPlusIcon, VolumeIcon } from './icons';

export function Modals() {
  const modal = useApp((state) => state.modal);
  const setModal = useApp((state) => state.setModal);
  const close = () => setModal(null);

  return (
    <>
      <CreateServerModal open={modal === 'create-server'} onClose={close} />
      <JoinServerModal open={modal === 'join-server'} onClose={close} />
      <AddFriendModal open={modal === 'add-friend'} onClose={close} />
      <SettingsModal open={modal === 'settings'} onClose={close} />
      <ServerSettingsModal open={modal === 'server-settings'} onClose={close} />
    </>
  );
}

function CreateServerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const refresh = useApp((state) => state.refresh);
  const setView = useApp((state) => state.setView);
  const pushToast = useApp((state) => state.pushToast);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [accent, setAccent] = useState('#7c5cff');
  const [isPublic, setIsPublic] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const { server } = await api.createServer({ name, description, accent, isPublic });
      await refresh();
      const first = server.channels[0];
      if (first) setView({ kind: 'channel', serverId: server.id, channelId: first.id });
      pushToast({ title: `${server.name} created`, body: `Invite code: ${server.inviteCode}`, accent });
      onClose();
      setName('');
      setDescription('');
    } catch (error) {
      pushToast({ title: 'Could not create server', body: error instanceof Error ? error.message : '', kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create a space"
      subtitle="Spaces hold text and voice channels for a group of people."
      footer={
        <>
          <button type="button" className="btn btn-ghost h-10 px-4" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary h-10 px-4" disabled={busy || !name.trim()} onClick={() => void submit()}>
            {busy ? <Spinner size={14} /> : null} Create space
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name">
          <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="My Space" maxLength={60} />
        </Field>
        <Field label="Description" hint="Shown to people when they join.">
          <textarea
            className="input resize-none"
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What happens here?"
            maxLength={300}
          />
        </Field>
        <Field label="Accent">
          <div className="flex flex-wrap gap-2">
            {accentList().map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setAccent(color)}
                className={`h-8 w-8 rounded-xl transition ${accent === color ? 'ring-2 ring-white/70' : ''}`}
                style={{ background: color }}
                aria-label={`Accent ${color}`}
              />
            ))}
          </div>
        </Field>
        <label className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/4 p-3">
          <input type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} className="h-4 w-4" />
          <span className="text-xs text-mist-300">
            List this space publicly so anyone can discover and join it from the Friends page.
          </span>
        </label>
      </div>
    </Modal>
  );
}

function JoinServerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const refresh = useApp((state) => state.refresh);
  const setView = useApp((state) => state.setView);
  const pushToast = useApp((state) => state.pushToast);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!code.trim()) return;
    setBusy(true);
    try {
      const { server } = await api.joinServer(code.trim());
      await refresh();
      const first = server.channels[0];
      if (first) setView({ kind: 'channel', serverId: server.id, channelId: first.id });
      pushToast({ title: `Joined ${server.name}` });
      onClose();
      setCode('');
    } catch (error) {
      pushToast({ title: 'Could not join', body: error instanceof Error ? error.message : '', kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Join with an invite"
      subtitle="Paste an invite code, for example halo-hq."
      footer={
        <>
          <button type="button" className="btn btn-ghost h-10 px-4" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary h-10 px-4" disabled={busy || !code.trim()} onClick={() => void submit()}>
            {busy ? <Spinner size={14} /> : null} Join
          </button>
        </>
      }
    >
      <Field label="Invite code">
        <input className="input font-mono" value={code} onChange={(event) => setCode(event.target.value)} placeholder="halo-hq" />
      </Field>
    </Modal>
  );
}

function AddFriendModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const refresh = useApp((state) => state.refresh);
  const pushToast = useApp((state) => state.pushToast);
  const openDm = useApp((state) => state.openDm);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<(User & { friendship: { status: string; direction?: string } })[]>([]);
  const [busy, setBusy] = useState(false);

  const search = async (value: string) => {
    setQuery(value);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    setBusy(true);
    try {
      const { users } = await api.searchUsers(value.trim());
      setResults(users);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add a friend" subtitle="Search people by username and send a request.">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <input
            autoFocus
            className="input"
            value={query}
            onChange={(event) => void search(event.target.value)}
            placeholder="username"
          />
          {busy && <Spinner size={16} />}
        </div>
        <div className="max-h-72 space-y-1.5 overflow-y-auto scroll-thin">
          {results.map((user) => (
            <div key={user.id} className="flex items-center gap-3 rounded-2xl border border-white/6 bg-white/3 px-3 py-2">
              <Avatar user={user} size={34} presence={user.presence} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-white">{displayNameOf(user)}</span>
                <span className="block truncate text-[11px] text-mist-500">@{user.username}</span>
              </span>
              {user.friendship.status === 'accepted' ? (
                <button
                  type="button"
                  className="btn btn-ghost h-8 px-3 text-xs"
                  onClick={async () => {
                    await openDm(user.id);
                    onClose();
                  }}
                >
                  Message
                </button>
              ) : user.friendship.status === 'pending' ? (
                <span className="chip">{user.friendship.direction === 'incoming' ? 'Respond' : 'Sent'}</span>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary h-8 px-3 text-xs"
                  onClick={async () => {
                    try {
                      const result = await api.addFriend(user.username);
                      pushToast({
                        title: result.accepted ? 'You are now friends' : 'Request sent',
                        body: `@${user.username}`,
                      });
                      await refresh();
                      await search(query);
                    } catch (error) {
                      pushToast({ title: 'Could not add friend', body: error instanceof Error ? error.message : '', kind: 'error' });
                    }
                  }}
                >
                  <UserPlusIcon size={14} /> Add
                </button>
              )}
            </div>
          ))}
          {query.trim().length >= 2 && results.length === 0 && !busy && (
            <p className="px-2 py-4 text-center text-xs text-mist-500">No one matches “{query}”.</p>
          )}
          {query.trim().length < 2 && (
            <p className="px-2 py-4 text-center text-xs text-mist-500">Type at least two characters to search.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}

function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const boot = useApp((state) => state.boot);
  const refresh = useApp((state) => state.refresh);
  const signOut = useApp((state) => state.signOut);
  const pushToast = useApp((state) => state.pushToast);
  const [displayName, setDisplayName] = useState(boot?.me.displayName ?? '');
  const [bio, setBio] = useState(boot?.me.bio ?? '');
  const [customStatus, setCustomStatus] = useState(boot?.me.customStatus ?? '');
  const [accent, setAccent] = useState(boot?.me.accent ?? '#7c5cff');
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api.updateProfile({ displayName, bio, customStatus, accent });
      await refresh();
      pushToast({ title: 'Profile updated' });
    } catch (error) {
      pushToast({ title: 'Could not save', body: error instanceof Error ? error.message : '', kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async () => {
    setBusy(true);
    try {
      await api.changePassword({ currentPassword, password });
      setCurrentPassword('');
      setPassword('');
      pushToast({ title: 'Password changed' });
    } catch (error) {
      pushToast({ title: 'Could not change password', body: error instanceof Error ? error.message : '', kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const uploadAvatar = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const { attachment } = await api.upload(file);
      await api.updateProfile({ avatarUrl: attachment.url });
      await refresh();
      pushToast({ title: 'Avatar updated' });
    } catch (error) {
      pushToast({ title: 'Upload failed', body: error instanceof Error ? error.message : '', kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Your profile" subtitle={boot ? `@${boot.me.username} · ${boot.me.email}` : ''} width={520}>
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Avatar user={boot?.me ?? null} size={64} presence={boot?.me.presence} />
          <div>
            <label className="btn btn-ghost h-9 cursor-pointer px-3 text-xs">
              {busy ? <Spinner size={13} /> : null} Upload avatar
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => void uploadAvatar(event.target.files?.[0])}
              />
            </label>
            <p className="mt-1 text-[11px] text-mist-500">PNG, JPEG, GIF or WebP up to 8 MB.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Display name">
            <input className="input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={40} />
          </Field>
          <Field label="Custom status">
            <input
              className="input"
              value={customStatus}
              onChange={(event) => setCustomStatus(event.target.value)}
              placeholder="Building something"
              maxLength={80}
            />
          </Field>
        </div>

        <Field label="About me" hint="Shown on your profile card.">
          <textarea className="input resize-none" rows={2} value={bio} onChange={(event) => setBio(event.target.value)} maxLength={190} />
        </Field>

        <Field label="Accent colour">
          <div className="flex flex-wrap gap-2">
            {accentList().map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setAccent(color)}
                className={`h-8 w-8 rounded-xl transition ${accent === color ? 'ring-2 ring-white/70' : ''}`}
                style={{ background: color }}
                aria-label={`Accent ${color}`}
              />
            ))}
          </div>
        </Field>

        <button type="button" className="btn btn-primary h-10 w-full" onClick={() => void save()} disabled={busy}>
          Save profile
        </button>

        <div className="rounded-2xl border border-white/8 bg-white/3 p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-mist-400">Change password</p>
          <div className="grid grid-cols-2 gap-2">
            <input
              className="input"
              type="password"
              placeholder="Current password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
            <input
              className="input"
              type="password"
              placeholder="New password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn btn-ghost mt-2 h-9 w-full text-xs"
            disabled={busy || !currentPassword || password.length < 8}
            onClick={() => void changePassword()}
          >
            Update password
          </button>
        </div>

        <button type="button" className="btn btn-danger h-10 w-full" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </Modal>
  );
}

function ServerSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const boot = useApp((state) => state.boot);
  const view = useApp((state) => state.view);
  const refresh = useApp((state) => state.refresh);
  const setView = useApp((state) => state.setView);
  const pushToast = useApp((state) => state.pushToast);
  const server = view.kind === 'channel' ? boot?.servers.find((item) => item.id === view.serverId) : null;
  const [name, setName] = useState(server?.name ?? '');
  const [description, setDescription] = useState(server?.description ?? '');
  const [accent, setAccent] = useState(server?.accent ?? '#7c5cff');
  const [isPublic, setIsPublic] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!server) return null;
  const canManage = server.ownerId === boot?.me.id || server.member?.role === 'admin';

  return (
    <Modal open={open} onClose={onClose} title={`${server.name} settings`} subtitle={`Invite code: ${server.inviteCode}`} width={540}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name">
            <input className="input" value={name} onChange={(event) => setName(event.target.value)} disabled={!canManage} />
          </Field>
          <Field label="Accent">
            <div className="flex flex-wrap gap-1.5">
              {accentList().map((color) => (
                <button
                  key={color}
                  type="button"
                  disabled={!canManage}
                  onClick={() => setAccent(color)}
                  className={`h-7 w-7 rounded-lg transition ${accent === color ? 'ring-2 ring-white/70' : ''}`}
                  style={{ background: color }}
                  aria-label={`Accent ${color}`}
                />
              ))}
            </div>
          </Field>
        </div>
        <Field label="Description">
          <textarea
            className="input resize-none"
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={!canManage}
          />
        </Field>

        <div className="rounded-2xl border border-white/8 bg-white/3 p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-mist-400">Channels</p>
          <ul className="space-y-1">
            {server.channels.map((channel) => (
              <li key={channel.id} className="flex items-center gap-2 rounded-xl bg-white/4 px-2.5 py-1.5">
                {channel.type === 'text' ? <HashIcon size={13} className="text-mist-400" /> : <VolumeIcon size={13} className="text-mist-400" />}
                <input
                  defaultValue={channel.name}
                  disabled={!canManage}
                  onBlur={async (event) => {
                    const next = event.target.value.trim().toLowerCase();
                    if (!next || next === channel.name) return;
                    await api.updateChannel(channel.id, { name: next }).catch(() => null);
                    await refresh();
                  }}
                  className="min-w-0 flex-1 bg-transparent text-xs text-mist-200 outline-none"
                />
                <span className="text-[10px] uppercase text-mist-600">{channel.type}</span>
                {canManage && (
                  <button
                    type="button"
                    className="text-mist-500 transition hover:text-coral-400"
                    aria-label={`Delete ${channel.name}`}
                    onClick={async () => {
                      await api.deleteChannel(channel.id).catch(() => null);
                      await refresh();
                    }}
                  >
                    <TrashIcon size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>

        {canManage && (
          <label className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/4 p-3">
            <input type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} className="h-4 w-4" />
            <span className="text-xs text-mist-300">List this space publicly for discovery.</span>
          </label>
        )}

        <div className="flex justify-between gap-2">
          <button
            type="button"
            className="btn btn-danger h-10 px-4"
            onClick={async () => {
              if (server.ownerId === boot?.me.id) {
                if (!window.confirm(`Delete ${server.name}? This cannot be undone.`)) return;
                await api.deleteServer(server.id).catch(() => null);
              } else {
                await api.leaveServer(server.id).catch(() => null);
              }
              setView({ kind: 'home' });
              await refresh();
              onClose();
            }}
          >
            {server.ownerId === boot?.me.id ? 'Delete space' : 'Leave space'}
          </button>
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost h-10 px-4" onClick={onClose}>
              Close
            </button>
            <button
              type="button"
              className="btn btn-primary h-10 px-4"
              disabled={!canManage || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api.updateServer(server.id, { name, description, accent, isPublic });
                  await refresh();
                  pushToast({ title: 'Space updated' });
                  onClose();
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? <Spinner size={14} /> : null} Save changes
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
