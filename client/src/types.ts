export type Presence = 'online' | 'idle' | 'dnd' | 'offline';

export interface User {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  customStatus: string;
  accent: string;
  avatarUrl: string | null;
  presence: Presence;
  lastSeen: number;
  createdAt: number;
}

export interface SelfUser extends User {
  email: string;
}

export interface Channel {
  id: string;
  serverId: string;
  name: string;
  topic: string;
  type: 'text' | 'voice';
  position: number;
  createdAt: number;
  unread?: number;
  lastReadAt?: number;
}

export interface Server {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  accent: string;
  iconUrl: string | null;
  inviteCode: string;
  createdAt: number;
  channels: Channel[];
  memberCount: number;
  member: { role: 'owner' | 'admin' | 'member'; nickname: string | null } | null;
}

export interface DmPreview {
  id: string;
  content: string;
  authorId: string;
  createdAt: number;
  deleted: boolean;
}

export interface Dm {
  id: string;
  other: User | null;
  lastMessageAt: number;
  lastMessage: DmPreview | null;
  unread: number;
}

export interface Attachment {
  id?: string;
  url: string;
  filename: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
}

export interface Reaction {
  emoji: string;
  count: number;
  me: boolean;
  userIds: string[];
}

export interface ReplyPreview {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  deleted: boolean;
}

export interface Message {
  id: string;
  scope: 'channel' | 'dm';
  scopeId: string;
  authorId: string;
  author: User | null;
  content: string;
  createdAt: number;
  editedAt: number | null;
  deleted: boolean;
  replyTo: ReplyPreview | null;
  attachments: Attachment[];
  reactions: Reaction[];
  pending?: boolean;
  failed?: boolean;
}

export interface Friendship {
  id: string;
  user: User;
  direction: 'incoming' | 'outgoing';
  status: 'pending' | 'accepted';
  createdAt: number;
}

export interface MutualServer {
  id: string;
  name: string;
  accent: string;
}

export interface PublicProfile extends User {
  friendship: { status: 'none' | 'pending' | 'accepted'; direction?: 'incoming' | 'outgoing'; id?: string };
  mutualServers?: MutualServer[];
}

export interface Bootstrap {
  me: SelfUser;
  servers: Server[];
  dms: Dm[];
  friendships: Friendship[];
  friends: User[];
  online: string[];
}

export interface VoiceParticipant {
  socketId: string;
  userId: string;
  muted: boolean;
  video: boolean;
  screen: boolean;
  speaking: boolean;
  joinedAt: number;
}

export interface CallSummary {
  id: string;
  video: boolean;
  createdAt: number;
  status: 'ringing' | 'accepted' | 'ended';
  direction: 'incoming' | 'outgoing';
  with: User | null;
  dmId: string | null;
}

export interface SearchHit {
  message: Message;
  context: { label: string; serverId: string | null; serverName: string | null };
}

export type View =
  | { kind: 'home' }
  | { kind: 'friends' }
  | { kind: 'dm'; dmId: string }
  | { kind: 'channel'; serverId: string; channelId: string };
