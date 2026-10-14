/**
 * Halo end-to-end smoke test.
 *
 * Talks to a server over real HTTP + Socket.IO (the same interfaces the browser
 * client uses) and checks the full flow: accounts, friends, DMs, server channels,
 * markdown payloads, reactions, edit/delete, attachments, typing, presence and
 * call signaling.
 *
 * By default it boots its own server on a scratch database and deletes it again
 * afterwards, so running the tests never touches your real accounts or messages.
 *
 *   npm run smoke
 *
 * To point it at a server you are already running instead:
 *
 *   HALO_BASE=http://127.0.0.1:4000 node scripts/smoke.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { io } from 'socket.io-client';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

/** A disposable server on a scratch database, used unless HALO_BASE is set. */
let scratch = null;
let BASE = process.env.HALO_BASE ?? null;

/** Usernames this run created, removed again in `cleanupCreatedAccounts`. */
const createdUsers = [];

/**
 * Registers an account and remembers its username so the run can delete it
 * again afterwards. Keeps `npm run smoke` from leaving throwaway accounts
 * behind when it is pointed at a real server via HALO_BASE.
 */
async function register(client, { email, username, password, displayName }) {
  createdUsers.push(username);
  return client.request('POST', '/api/auth/register', {
    email,
    username,
    password,
    ...(displayName ? { displayName } : {}),
  });
}

async function startScratchServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'halo-smoke-'));
  const port = 4200 + Math.floor(Math.random() * 300);
  const env = {
    ...process.env,
    PORT: String(port),
    HALO_DB: path.join(dir, 'halo.db'),
    HALO_UPLOADS: path.join(dir, 'uploads'),
    HALO_SECRET: 'smoke-test-secret',
    NODE_ENV: 'development',
  };
  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'src', 'index.js')], {
    env,
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (chunk) => {
    log += String(chunk);
  });
  child.stderr.on('data', (chunk) => {
    log += String(chunk);
  });
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) log += `\n[smoke] server exited with code ${code}`;
  });

  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 20_000;
  for (;;) {
    if (Date.now() > deadline) {
      child.kill('SIGKILL');
      throw new Error(`scratch server never became healthy.\n${log}`);
    }
    try {
      const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) break;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  scratch = { child, dir, url };
  return url;
}

function stopScratchServer() {
  if (!scratch) return;
  scratch.child.kill('SIGTERM');
  try {
    fs.rmSync(scratch.dir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
  scratch = null;
}

/**
 * Deletes the accounts this run created from the database it ran against.
 * The scratch server removes its own temp database, so this only does work in
 * HALO_BASE mode, where we write into a server someone already has running.
 */
function cleanupCreatedAccounts() {
  if (scratch || createdUsers.length === 0) return;
  const dbPath = process.env.HALO_DB ?? path.join(ROOT, 'server', 'data', 'halo.db');
  if (!fs.existsSync(dbPath)) return;
  try {
    const cleanupDb = new DatabaseSync(dbPath);
    // The server we just tested against keeps the same database open, so wait
    // for its write lock instead of failing instantly with "database is locked".
    cleanupDb.exec('PRAGMA busy_timeout = 10000;');
    cleanupDb.exec('PRAGMA foreign_keys = ON;');

    const marks = createdUsers.map(() => '?').join(', ');
    const userIds = cleanupDb
      .prepare(`SELECT id FROM users WHERE username IN (${marks})`)
      .all(...createdUsers)
      .map((row) => row.id);

    // `messages.scope_id` is polymorphic and has no foreign key, so the welcome
    // message the system bot leaves in a test user's DM would outlive the dm row
    // that cascades when the user is deleted. Clear those scopes first.
    const removeMessage = cleanupDb.prepare('DELETE FROM messages WHERE scope = ? AND scope_id = ?');
    let orphanMessages = 0;
    if (userIds.length) {
      const idMarks = userIds.map(() => '?').join(', ');
      const dmIds = cleanupDb
        .prepare(`SELECT id FROM dms WHERE user_a IN (${idMarks}) OR user_b IN (${idMarks})`)
        .all(...userIds, ...userIds)
        .map((row) => row.id);
      for (const id of dmIds) orphanMessages += removeMessage.run('dm', id).changes;

      const serverIds = cleanupDb
        .prepare(`SELECT id FROM servers WHERE owner_id IN (${idMarks})`)
        .all(...userIds)
        .map((row) => row.id);
      if (serverIds.length) {
        const serverMarks = serverIds.map(() => '?').join(', ');
        const channelIds = cleanupDb
          .prepare(`SELECT id FROM channels WHERE server_id IN (${serverMarks})`)
          .all(...serverIds)
          .map((row) => row.id);
        for (const id of channelIds) orphanMessages += removeMessage.run('channel', id).changes;
      }
    }

    const remove = cleanupDb.prepare('DELETE FROM users WHERE username = ?');
    let removed = 0;
    for (const username of createdUsers) removed += remove.run(username).changes;
    cleanupDb.close();
    if (removed > 0) {
      const extra = orphanMessages ? ` and ${orphanMessages} orphaned message(s)` : '';
      console.log(`[cleanup] removed ${removed} smoke account(s)${extra} from ${dbPath}`);
    }
  } catch (error) {
    console.warn(`[cleanup] could not remove smoke accounts from ${dbPath}: ${error.message}`);
  }
}

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(name);
    console.log(`  ✗ ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
  }
}

const clients = [];

class Client {
  constructor(label) {
    this.label = label;
    this.cookies = new Map();
    clients.push(this);
  }

  async request(method, path, body, options = {}) {
    const headers = { ...(options.headers ?? {}) };
    const cookieHeader = [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookieHeader) headers.cookie = cookieHeader;
    let payload;
    if (body instanceof FormData) {
      payload = body;
    } else if (body !== undefined) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const response = await fetch(`${BASE}${path}`, { method, headers, body: payload });
    for (const raw of response.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(';');
      const index = pair.indexOf('=');
      if (index > 0) this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
    const text = await response.text();
    let json;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    if (!response.ok) {
      const error = new Error(`${method} ${path} -> ${response.status} ${text.slice(0, 200)}`);
      error.status = response.status;
      error.body = json;
      throw error;
    }
    return json;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const cookieHeader = [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
      const socket = io(BASE, {
        transports: ['websocket', 'polling'],
        reconnection: false,
        timeout: 5000,
        extraHeaders: { cookie: cookieHeader },
        transportOptions: { websocket: { extraHeaders: { cookie: cookieHeader } } },
        auth: { token: this.cookies.get('halo_session') ?? null },
      });
      this.socket = socket;
      // Record every event so a listener registered later still sees what arrived early.
      this.events = [];
      socket.onAny((event, payload) => this.events.push({ event, payload }));
      socket.on('connect_error', reject);
      socket.on('connect', () => resolve(socket));
      setTimeout(() => reject(new Error(`${this.label} socket timed out`)), 8000);
    });
  }

  waitFor(event, predicate = () => true, timeout = 6000) {
    const existing = this.events.find((e) => e.event === event && predicate(e.payload));
    if (existing) return Promise.resolve(existing.payload);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket$off();
        reject(new Error(`timed out waiting for ${event} on ${this.label}`));
      }, timeout);
      const handler = (payload) => {
        if (!predicate(payload)) return;
        clearTimeout(timer);
        socket$off();
        resolve(payload);
      };
      const socket$off = () => this.socket.off(event, handler);
      this.socket.on(event, handler);
    });
  }
}

function tinyPng() {
  // 2x2 PNG built from raw scanlines so we do not need a fixture file.
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([length, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.from([0, 255, 0, 0, 0, 255, 0, 0, 0, 0, 255, 255, 0, 0]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

let crcTable;
function crc32(buffer) {
  if (!crcTable) {
    crcTable = [];
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function main() {
  if (!BASE) {
    console.log('Booting a scratch server (your own data is untouched)…');
    BASE = await startScratchServer();
  }
  console.log(`Halo smoke test against ${BASE}\n`);

  const ada = new Client('ada');
  const lin = new Client('lin');

  console.log('accounts');
  const adaBoot = await register(ada, {
    email: `ada.${run}@halo.test`,
    username: `ada${run}`.slice(0, 20),
    password: 'halohalo123',
    displayName: 'Ada',
  });
  check('register returns a session bootstrap', Boolean(adaBoot.me?.id) && Array.isArray(adaBoot.servers));
  check('new account is auto-joined to Halo HQ', adaBoot.servers.some((s) => s.name === 'Halo HQ'));
  check('welcome DM arrives from Halo', adaBoot.dms.length >= 1);

  const linBoot = await register(lin, {
    email: `lin.${run}@halo.test`,
    username: `lin${run}`.slice(0, 20),
    password: 'halohalo123',
    displayName: 'Lin',
  });
  check('second account registers', Boolean(linBoot.me?.id));
  check('duplicate username is rejected', await rejects(() =>
    register(lin, {
      email: `other.${run}@halo.test`,
      username: `lin${run}`.slice(0, 20),
      password: 'halohalo123',
    }),
  ));
  check('wrong password is rejected', await rejects(() => lin.request('POST', '/api/auth/login', { identifier: `lin${run}`.slice(0, 20), password: 'nope' })));

  console.log('\nrealtime connection + presence');
  await ada.connect();
  await lin.connect();
  check('both sockets connected', ada.socket.connected && lin.socket.connected);
  const presence = await ada.waitFor('presence:update', () => true).catch(() => null);
  check('presence updates flow to the other client', Boolean(presence));

  console.log('\nfriends');
  const request = await ada.request('POST', '/api/friends/requests', { username: `lin${run}`.slice(0, 20) });
  check('friend request created', request.friendship?.status === 'pending');
  const incoming = await lin.waitFor('friend:request');
  check('addressee gets friend:request in realtime', incoming.user?.id === adaBoot.me.id);
  await lin.request('POST', `/api/friends/requests/${request.friendship.id}/accept`);
  const accepted = await ada.waitFor('friend:accepted');
  check('requester gets friend:accepted in realtime', Boolean(accepted));
  const friends = await ada.request('GET', '/api/friends');
  check('friendship is accepted for both sides', friends.friendships.some((f) => f.status === 'accepted'));

  console.log('\ndirect messages');
  const dm = await ada.request('POST', '/api/dms', { userId: linBoot.me.id });
  check('DM conversation created', Boolean(dm.dm?.id));
  const sent = await ada.request('POST', '/api/messages', {
    scope: 'dm',
    scopeId: dm.dm.id,
    content: 'Hey **Lin**, ready for a call?\n\n- one\n- two\n\n```js\nconst ok = true;\n```',
  });
  check('message payload keeps markdown intact', sent.message.content.includes('```js'));
  const received = await lin.waitFor('message:new', (m) => m.id === sent.message.id);
  check('recipient receives message:new over the socket', received.content.startsWith('Hey **Lin**'));
  check('message author is hydrated', received.author.displayName === 'Ada');

  console.log('\ntyping + reactions + edit + delete');
  await ada.socket.emit('typing', { scope: 'dm', scopeId: dm.dm.id });
  const typing = await lin.waitFor('typing', (t) => t.scopeId === dm.dm.id);
  check('typing indicator arrives without the throttle blocking it', typing.userId === adaBoot.me.id);

  const reaction = await lin.request('POST', `/api/messages/${sent.message.id}/reactions`, { emoji: '🎉' });
  check('reaction toggles on', reaction.reactions[0]?.count === 1);
  const reactionEvent = await ada.waitFor('reaction:update', (r) => r.messageId === sent.message.id);
  check('reaction broadcasts with user ids for per-viewer state', reactionEvent.reactions[0].userIds.includes(linBoot.me.id));
  const reactionOff = await lin.request('POST', `/api/messages/${sent.message.id}/reactions`, { emoji: '🎉' });
  check('reaction toggles off', reactionOff.reactions.length === 0);

  await ada.request('PATCH', `/api/messages/${sent.message.id}`, { content: 'edited text' });
  const edited = await lin.waitFor('message:update', (m) => m.id === sent.message.id && m.content === 'edited text');
  check('edited message broadcasts with edited timestamp', Boolean(edited.editedAt));

  const reply = await lin.request('POST', '/api/messages', {
    scope: 'dm',
    scopeId: dm.dm.id,
    content: 'replying to you',
    replyToId: sent.message.id,
  });
  check('reply stores a preview of the parent', reply.message.replyTo?.id === sent.message.id);

  await ada.request('DELETE', `/api/messages/${sent.message.id}`);
  const deleted = await lin.waitFor('message:delete', (m) => m.id === sent.message.id);
  check('delete broadcasts to the other participant', Boolean(deleted));
  const history = await lin.request('GET', `/api/messages?scope=dm&scopeId=${dm.dm.id}&limit=50`);
  check('deleted message disappears from history', !history.messages.some((m) => m.id === sent.message.id));
  check('replies survive their parent being deleted', history.messages.some((m) => m.id === reply.message.id));

  console.log('\nservers + channels');
  const server = await ada.request('POST', '/api/servers', { name: `Studio ${run}`.slice(0, 30), description: 'smoke test' });
  check('server created with default channels', server.server.channels.length === 2);
  check('invite code generated', Boolean(server.server.inviteCode));
  const joined = await lin.request('POST', '/api/servers/join', { code: server.server.inviteCode });
  check('second user joins by invite code', joined.server.id === server.server.id);
  const textChannel = server.server.channels.find((c) => c.type === 'text');
  const voiceChannel = server.server.channels.find((c) => c.type === 'voice');
  const channelMessage = await lin.request('POST', '/api/messages', {
    scope: 'channel',
    scopeId: textChannel.id,
    content: 'first post in #general',
  });
  const channelEvent = await ada.waitFor('message:new', (m) => m.id === channelMessage.message.id);
  check('server member receives channel message in realtime', channelEvent.scope === 'channel');
  check('non-members cannot post to a channel', await rejects(async () => {
    const outsider = new Client('outsider');
    await register(outsider, {
      email: `out.${run}@halo.test`,
      username: `out${run}`.slice(0, 20),
      password: 'halohalo123',
    });
    await outsider.request('POST', '/api/messages', { scope: 'channel', scopeId: textChannel.id, content: 'sneaky' });
  }));

  console.log('\nattachments');
  const form = new FormData();
  form.append('file', new Blob([tinyPng()], { type: 'image/png' }), 'pixel.png');
  const upload = await ada.request('POST', '/api/upload', form);
  check('image upload returns a served url', upload.attachment.url.startsWith('/uploads/'));
  check('png dimensions are detected', upload.attachment.width === 2 && upload.attachment.height === 2);
  const withImage = await ada.request('POST', '/api/messages', {
    scope: 'channel',
    scopeId: textChannel.id,
    content: '',
    attachments: [upload.attachment],
  });
  check('message can carry an attachment with no text', withImage.message.attachments.length === 1);
  const imageResponse = await fetch(`${BASE}${upload.attachment.url}`);
  check('uploaded image is served back', imageResponse.ok && imageResponse.headers.get('content-type')?.includes('image/png'));

  console.log('\nvoice channels');
  const voiceRoster = lin.waitFor('voice:roster', (r) => r.scopeId === voiceChannel.id);
  ada.socket.emit('voice:join', { scope: 'channel', scopeId: voiceChannel.id, muted: false, video: false });
  const joinedVoice = await ada.waitFor('voice:joined');
  check('voice:joined includes the room key', joinedVoice.key === `voice:channel:${voiceChannel.id}`);
  const roster = await voiceRoster;
  check('other members see the voice roster update', roster.participants.length === 1);
  const peerJoined = ada.waitFor('voice:peer-joined', (p) => p.userId === linBoot.me.id);
  const linJoined = lin.waitFor('voice:joined', (v) => v.scopeId === voiceChannel.id);
  lin.socket.emit('voice:join', { scope: 'channel', scopeId: voiceChannel.id });
  const joinedRoom = await linJoined;
  check('joining a voice room lists the existing peer for WebRTC setup', joinedRoom.peers.length === 1);
  check('existing members hear about the new peer', Boolean(await peerJoined));

  const peerStatePending = ada.waitFor('voice:peer-state', (p) => p.muted === true).catch(() => null);
  lin.socket.emit('voice:state', { scope: 'channel', scopeId: voiceChannel.id, muted: true });
  check('mute state broadcasts to the room', Boolean(await peerStatePending));

  const rosterAfterLeave = ada.waitFor('voice:roster', (r) => r.scopeId === voiceChannel.id && r.participants.length === 1);
  lin.socket.emit('voice:leave', { scope: 'channel', scopeId: voiceChannel.id });
  check('leaving a voice room updates the roster', Boolean(await rosterAfterLeave));
  ada.socket.emit('voice:leave', { scope: 'channel', scopeId: voiceChannel.id });

  console.log('\n1:1 calling');
  const incomingCall = lin.waitFor('call:incoming');
  ada.socket.emit('call:start', { userId: linBoot.me.id, dmId: dm.dm.id, video: true });
  const ring = await ada.waitFor('call:ringing');
  check('caller enters ringing state', ring.call.status === 'ringing');
  const call = await incomingCall;
  check('callee receives call:incoming with caller info', call.call.direction === 'incoming' && call.call.video === true);
  const acceptedSignal = ada.waitFor('call:accepted');
  lin.socket.emit('call:accept', { callId: call.call.id });
  const acceptedCall = await acceptedSignal;
  check('both sides get call:accepted with socket ids', acceptedCall.participants.length === 2);

  const peerSockets = acceptedCall.participants.find((p) => p.userId === linBoot.me.id).socketIds;
  const signalArrived = lin.waitFor('signal', (s) => s.callId === call.call.id);
  ada.socket.emit('signal', {
    to: peerSockets[0],
    callId: call.call.id,
    payload: { description: { type: 'offer', sdp: 'v=0 fake-offer' } },
  });
  const signal = await signalArrived;
  check('WebRTC offer is relayed to the callee socket', signal.payload.description.type === 'offer');
  check('signal keeps the origin socket id', signal.from === ada.socket.id);

  const peerStateEvent = ada.waitFor('call:peer-state', (p) => p.muted === true).catch(() => null);
  lin.socket.emit('call:state', { callId: call.call.id, muted: true, video: false });
  check('in-call mute state reaches the other side', Boolean(await peerStateEvent));

  const ended = lin.waitFor('call:ended');
  ada.socket.emit('call:end', { callId: call.call.id });
  check('hang up notifies both parties', Boolean(await ended));

  console.log('\nprofile + search');
  await ada.request('PATCH', '/api/auth/me', { customStatus: 'shipping', bio: 'smoke tester' });
  const me = await ada.request('GET', '/api/auth/me');
  check('profile updates persist', me.me.customStatus === 'shipping');
  const search = await ada.request('GET', `/api/users/search?q=lin${run}`.slice(0, 60));
  check('user search finds the other account', search.users.some((u) => u.id === linBoot.me.id));
  const messageSearch = await lin.request('GET', '/api/messages/search?q=first+post');
  check('message search finds channel history', messageSearch.results.some((r) => r.message.id === channelMessage.message.id));

  console.log('\nisolation');
  const outsider = new Client('outsider2');
  await register(outsider, {
    email: `iso.${run}@halo.test`,
    username: `iso${run}`.slice(0, 20),
    password: 'halohalo123',
  });
  check('outsider cannot read a DM they are not part of', await rejects(() =>
    outsider.request('GET', `/api/messages?scope=dm&scopeId=${dm.dm.id}`),
  ));
  check('outsider cannot read a channel they are not in', await rejects(() =>
    outsider.request('GET', `/api/messages?scope=channel&scopeId=${textChannel.id}`),
  ));
  check('outsider cannot react to a message they cannot see', await rejects(() =>
    outsider.request('POST', `/api/messages/${channelMessage.message.id}/reactions`, { emoji: '👀' }),
  ));

  console.log(`\n${passed} checks passed, ${failures.length} failed`);
  if (failures.length) {
    console.log(failures.map((f) => `  - ${f}`).join('\n'));
    process.exitCode = 1;
  }
}

async function rejects(fn) {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
}

function shutdown(code) {
  for (const client of clients) client.socket?.close();
  cleanupCreatedAccounts();
  stopScratchServer();
  process.exit(code);
}

main()
  .then(() => shutdown(failures.length ? 1 : 0))
  .catch((error) => {
    console.error('\nsmoke test crashed:', error);
    shutdown(1);
  });
