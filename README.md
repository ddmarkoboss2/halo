# Halo

A realtime chat app — servers and channels, direct messages, friends, rich message formatting and
browser voice/video calls. It is Discord-shaped, with a deliberately different visual language:
glass panels, squircle avatars, an aurora backdrop and a violet→aqua accent system.

```
Servers ──► text + voice channels ──► messages, reactions, replies, attachments
Friends ──► requests, presence, DMs ──► 1:1 voice / video calls with screen sharing
```

## Stack

| Layer     | Choice                                                                 |
| --------- | ---------------------------------------------------------------------- |
| Frontend  | React 19 + TypeScript + Vite, Tailwind CSS v4, Zustand, Socket.IO client |
| Backend   | Node 22+ (ESM), Express, Socket.IO, `node:sqlite` (built in), Multer    |
| Realtime  | Socket.IO rooms per channel/DM, per-user rooms for presence and calls    |
| Calls     | Native WebRTC mesh with "perfect negotiation"; server relays SDP/ICE only |
| Database  | SQLite file at `server/data/halo.db` — **no external database needed**   |

## Quick start

```bash
npm install          # installs root + server + client workspaces
cp .env.example .env # optional; every value has a working default
npm run dev          # API on :4000, Vite dev server on :3000
```

Open <http://localhost:3000> and create your account. The Vite dev server proxies `/api`,
`/uploads` and `/socket.io` to the API process, so one URL is enough.

There are no pre-made accounts and no sample data: the database starts empty apart from the
`halo` system bot. Every account in the app is one you create.

On registration you are added to the public **Halo HQ** space (invite code `halo-hq`) and receive a
welcome DM from the system account, which doubles as a quick tour of what the app does.

To exercise realtime features you need two signed-in clients. Open a second browser profile (or a
private window), register a second account, and use **Add friend** on each side to connect them —
then you can watch presence, typing indicators, message sync and calls between the two.

### Previewing from a hosted VM

Vite rejects requests whose `Host` header it does not recognise, so a hosted preview (Codespaces,
Gitpod, Freebuff Cloud, any tunnel) returns a bare 403 until the hostname is allowed. Pass the
hostname for this session instead of editing config:

```bash
__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=<your-preview-hostname> npm run dev
```

The variable only affects the dev server. It is read per process, so it has to be set again every
time you restart `npm run dev` — a restart without it is the usual reason a working preview suddenly
stops loading.

### Scripts

| Command             | What it does                                                       |
| ------------------- | ------------------------------------------------------------------ |
| `npm run dev`       | Runs the API and the Vite dev server together with hot reload       |
| `npm run build`     | Type-checks and builds the client into `client/dist`                |
| `npm start`         | Runs the API, which also serves `client/dist` when it exists        |
| `npm run smoke`     | End-to-end API + Socket.IO test suite on a throwaway database       |
| `npm run typecheck` | `tsc --noEmit` over the client                                      |

## Features

**Spaces and channels** — create servers with text and voice channels, invite people with an invite
code, make a server publicly discoverable, edit names/topics/accents, and delete channels you own.
Unread badges roll up per channel and per server.

**Messages** — Markdown (bold, italic, headings, lists, quotes, links, tables) plus fenced code
blocks with syntax highlighting and a copy button. `:shortcode:` emoji, `@mention` highlighting,
emoji reactions, reply threading with a jump-to-parent, edit, delete, and image attachments via
paste, drag-and-drop or the attach button (with a lightbox).

**Direct messages and friends** — search people by username, send/accept/decline friend requests,
see presence dots, and open DMs from anywhere. DMs show a live preview of the last message and an
unread count.

**Realtime** — instant message delivery, typing indicators, presence (`online`/`idle`/`dnd`/`offline`
plus invisible), live roster updates in voice channels, and sidebar refreshes when a server, channel
or DM is created.

**Calls** — join a server voice channel or start a 1:1 call from a DM header or a friend row. Voice
and video, mute/deafen, camera on/off, screen sharing, speaking detection, a floating voice dock,
and a full call stage. The server only relays WebRTC signaling; media flows peer to peer.

**Search** — `⌘K` / `Ctrl+K` opens a palette that searches message history across every channel and
DM you can access, plus people search with inline friend and message actions.

## Project layout

```
server/src
  index.js          Express app, static hosting, Socket.IO bootstrap
  db.js             SQLite schema, migrations and query helpers
  store.js          Domain queries + serializers (users, servers, messages, DMs, friends)
  realtime.js       Socket.IO auth, room subscriptions, presence, typing, voice wiring
  voice.js          Voice-room roster and 1:1 call state machine
  provision.js      Halo HQ public server, system account, new-user onboarding
  routes/           auth, servers, messages, dms, friends, users, uploads

client/src
  store.ts          Zustand store: bootstrap data, realtime wiring, navigation, call state
  lib/webrtc.ts     WebRTC mesh engine (peer connections, tracks, speaking detection)
  lib/api.ts        Typed fetch wrapper for the REST API
  components/       Rail, sidebar, chat, composer, message list, voice UI, modals, palette
```

## How the realtime layer works

- Each socket joins a personal room (`user:<id>`) plus one room per channel and DM it can read, so a
  message fan-out is a single room emit and no client ever sees data it should not.
- Structural changes (new server/channel/DM) call `notifyState`, which re-subscribes that user's live
  sockets and emits `state:refresh` so the sidebar refetches.
- Presence changes are only broadcast to the people who can see that user (friends, server
  co-members and DM partners).
- Typing events are throttled per socket to 350 ms and expire client-side.
- 1:1 calls live server-side (`voice.js`): `call:start` rings every device the callee has open, and
  on accept the server hands both sides the peer socket ids to negotiate against.

## Configuration

Copy `.env.example` to `.env` to override anything:

| Variable        | Default              | Purpose                                    |
| --------------- | -------------------- | ------------------------------------------ |
| `PORT`          | `4000`               | API + Socket.IO port                       |
| `CLIENT_PORT`   | `3000`               | Vite dev-server port                       |
| `HALO_DB`       | `server/data/halo.db`| SQLite file location                       |
| `HALO_UPLOADS`  | `server/uploads`     | Where uploaded images are written          |
| `HALO_SECRET`   | dev value            | Set a long random string in production     |
| `NODE_ENV`      | `development`        | `production` adds the `Secure` cookie flag |

## Verification

`npm run smoke` drives a real server over HTTP and Socket.IO — the same interfaces the browser uses —
and covers 53 assertions: registration/login, presence fan-out, friend requests and acceptance, DM
creation, message delivery and history, typing, reactions toggling on and off, edit/delete, reply
previews surviving parent deletion, server creation, invite-code joins, channel access control, image
upload and serving, voice rosters, mute propagation, call ringing, accept, SDP/ICE relay, in-call
state, hang-up, profile updates, search, and cross-account isolation.

It boots its own server on a scratch database in a temp directory and removes it afterwards, so
running the tests never creates accounts or messages in your own database:

```bash
npm run smoke
```

To run the same assertions against a server you already have running, point it at that origin:

```bash
HALO_BASE=http://127.0.0.1:4000 node scripts/smoke.mjs
```

That mode does create its throwaway accounts in the target server's database, but it deletes them
again when the run finishes — using `HALO_DB` if set, otherwise `server/data/halo.db`. If the server
you point at uses a database somewhere else, set `HALO_DB` to that path so the cleanup can find and
remove the accounts.

## Notes and limitations

- Calls are a full mesh: every participant connects to every other participant. That is great for
  small groups (server voice channels of a handful of people) but does not scale to large rooms — a
  media server (SFU) would be the next step.
- WebRTC needs a secure context: `localhost` works, and so does HTTPS. A plain-HTTP remote origin
  will not get microphone or camera access.
- The default ICE configuration uses public STUN servers only, which is enough on most home
  networks. Symmetric NATs need a TURN server — add one to `ICE_SERVERS` in `client/src/lib/webrtc.ts`.
- There is no moderation layer beyond "authors and server owners/admins can delete", and no rate
  limiting. Both would be needed before exposing this to the open internet.
- Sessions are opaque random tokens in an HttpOnly cookie, stored in SQLite and pruned on boot.