import { all, get, run } from './db.js';
import { hashPassword } from './auth.js';
import { emitToUsers } from './events.js';
import { createDm, findDm, newId, now } from './store.js';

export const SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000001';
export const HALO_HQ_ID = '00000000-0000-4000-8000-000000000002';

const SYSTEM_USERNAME = 'halo';
const HQ_CHANNELS = [
  { name: 'welcome', type: 'text', topic: 'Start here — how Halo works.' },
  { name: 'general', type: 'text', topic: 'Anything and everything.' },
  { name: 'design-lab', type: 'text', topic: 'Screenshots, mockups and hot takes.' },
  { name: 'lounge', type: 'voice', topic: 'Drop in and talk.' },
  { name: 'watch-party', type: 'voice', topic: 'Video calls and screen sharing.' },
];

const WELCOME_MESSAGE = `## Welcome to Halo

This space is your sandbox. A few things worth trying:

- **Markdown works** — *italic*, **bold**, [links](https://example.com), lists and > quotes
- Drop in a fenced code block and it gets syntax highlighting
- Hover a message for **reactions**, **replies**, **edit** and **delete**
- Paste or drop an **image** into the composer and it uploads instantly
- Hit the **phone** or **video** button in a DM, or join *lounge* for a live call

Create a server from the **+** in the rail, invite a friend with its invite code, or start a DM from the Friends page.`;

function ensureSystemUser() {
  if (get('SELECT id FROM users WHERE id = ?', SYSTEM_USER_ID)) return;
  run(
    `INSERT INTO users (id, email, username, display_name, password_hash, bio, custom_status, accent, presence, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'online', ?)`,
    SYSTEM_USER_ID,
    'halo@localhost',
    SYSTEM_USERNAME,
    'Halo',
    hashPassword(newId()),
    'The friendly house bot.',
    'Here to help',
    '#22d3ee',
    now(),
  );
}

/** Creates the shared public server exactly once. */
export function ensureHaloHq() {
  ensureSystemUser();
  if (get('SELECT id FROM servers WHERE id = ?', HALO_HQ_ID)) return;

  run(
    `INSERT INTO servers (id, name, description, owner_id, accent, invite_code, is_public, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
    HALO_HQ_ID,
    'Halo HQ',
    'The public hangout: say hi, share what you are building, hop into a call.',
    SYSTEM_USER_ID,
    '#22d3ee',
    'halo-hq',
    now(),
  );
  run(
    'INSERT INTO server_members (server_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)',
    HALO_HQ_ID,
    SYSTEM_USER_ID,
    'owner',
    now(),
  );

  const ids = {};
  HQ_CHANNELS.forEach((channel, index) => {
    const id = newId();
    ids[channel.name] = id;
    run(
      'INSERT INTO channels (id, server_id, name, topic, type, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      id,
      HALO_HQ_ID,
      channel.name,
      channel.topic,
      channel.type,
      index,
      now(),
    );
  });

  run(
    `INSERT INTO messages (id, scope, scope_id, author_id, content, created_at)
     VALUES (?, 'channel', ?, ?, ?, ?)`,
    newId(),
    ids.welcome,
    SYSTEM_USER_ID,
    WELCOME_MESSAGE,
    now(),
  );
}

/** Adds a brand new account to Halo HQ and sends it a welcome DM. */
export function provisionNewUser(userId) {
  ensureHaloHq();
  if (!get('SELECT 1 AS ok FROM server_members WHERE server_id = ? AND user_id = ?', HALO_HQ_ID, userId)) {
    run(
      'INSERT INTO server_members (server_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)',
      HALO_HQ_ID,
      userId,
      'member',
      now(),
    );
  }

  let dm = findDm(userId, SYSTEM_USER_ID);
  if (!dm) dm = createDm(userId, SYSTEM_USER_ID);
  if (!get("SELECT 1 AS ok FROM messages WHERE scope = 'dm' AND scope_id = ?", dm.id)) {
    run(
      `INSERT INTO messages (id, scope, scope_id, author_id, content, created_at)
       VALUES (?, 'dm', ?, ?, ?, ?)`,
      newId(),
      dm.id,
      SYSTEM_USER_ID,
      `Hey 👋 I'm Halo.\n\nUse **Add friend** to find people by username, then start a DM — you can call or video chat from the call button in the header. Voice channels live under any server in the sidebar.\n\nInvite code for Halo HQ: \`halo-hq\``,
      now(),
    );
    run('UPDATE dms SET last_message_at = ? WHERE id = ?', now(), dm.id);
  }
}

/** Emits join events when someone new appears in a server. */
export function announceJoin(serverId, userId) {
  const members = all('SELECT user_id FROM server_members WHERE server_id = ?', serverId).map((r) => r.user_id);
  emitToUsers(members, 'server:member-joined', { serverId, userId });
}
