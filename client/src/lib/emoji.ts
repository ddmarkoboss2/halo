/** A compact, curated emoji picker dataset: enough range without a heavy dependency. */
export interface EmojiEntry {
  char: string;
  name: string;
  group: string;
}

export const EMOJI_GROUPS = ['Frequent', 'Smileys', 'People', 'Nature', 'Food', 'Objects', 'Symbols'] as const;
export type EmojiGroup = (typeof EMOJI_GROUPS)[number];

export const EMOJI: EmojiEntry[] = [
  { char: '😀', name: 'grinning', group: 'Smileys' },
  { char: '😄', name: 'smile', group: 'Smileys' },
  { char: '😁', name: 'grin', group: 'Smileys' },
  { char: '😂', name: 'joy', group: 'Smileys' },
  { char: '🥲', name: 'happy tear', group: 'Smileys' },
  { char: '😊', name: 'blush', group: 'Smileys' },
  { char: '😍', name: 'heart eyes', group: 'Smileys' },
  { char: '🤩', name: 'star struck', group: 'Smileys' },
  { char: '😎', name: 'cool', group: 'Smileys' },
  { char: '🤔', name: 'thinking', group: 'Smileys' },
  { char: '🙃', name: 'upside down', group: 'Smileys' },
  { char: '😴', name: 'sleeping', group: 'Smileys' },
  { char: '😭', name: 'sob', group: 'Smileys' },
  { char: '😤', name: 'triumph', group: 'Smileys' },
  { char: '😱', name: 'scream', group: 'Smileys' },
  { char: '🤯', name: 'mind blown', group: 'Smileys' },
  { char: '🥳', name: 'party face', group: 'Smileys' },
  { char: '😇', name: 'innocent', group: 'Smileys' },
  { char: '🤗', name: 'hug', group: 'Smileys' },
  { char: '🫠', name: 'melting', group: 'Smileys' },
  { char: '👋', name: 'wave', group: 'People' },
  { char: '👍', name: 'thumbs up', group: 'People' },
  { char: '👎', name: 'thumbs down', group: 'People' },
  { char: '🙌', name: 'raised hands', group: 'People' },
  { char: '👏', name: 'clap', group: 'People' },
  { char: '🤝', name: 'handshake', group: 'People' },
  { char: '🙏', name: 'please', group: 'People' },
  { char: '💪', name: 'strong', group: 'People' },
  { char: '🤙', name: 'call me', group: 'People' },
  { char: '✌️', name: 'peace', group: 'People' },
  { char: '🦾', name: 'robot arm', group: 'People' },
  { char: '🧠', name: 'brain', group: 'People' },
  { char: '👀', name: 'eyes', group: 'People' },
  { char: '🫶', name: 'heart hands', group: 'People' },
  { char: '🎨', name: 'art', group: 'Nature' },
  { char: '🌱', name: 'seedling', group: 'Nature' },
  { char: '🌊', name: 'wave water', group: 'Nature' },
  { char: '🔥', name: 'fire', group: 'Nature' },
  { char: '✨', name: 'sparkles', group: 'Nature' },
  { char: '⭐', name: 'star', group: 'Nature' },
  { char: '🌈', name: 'rainbow', group: 'Nature' },
  { char: '☀️', name: 'sun', group: 'Nature' },
  { char: '🌙', name: 'moon', group: 'Nature' },
  { char: '❄️', name: 'snow', group: 'Nature' },
  { char: '🌸', name: 'blossom', group: 'Nature' },
  { char: '🍀', name: 'clover', group: 'Nature' },
  { char: '🐙', name: 'octopus', group: 'Nature' },
  { char: '🦊', name: 'fox', group: 'Nature' },
  { char: '🍕', name: 'pizza', group: 'Food' },
  { char: '🍔', name: 'burger', group: 'Food' },
  { char: '🍜', name: 'ramen', group: 'Food' },
  { char: '🍣', name: 'sushi', group: 'Food' },
  { char: '🍩', name: 'donut', group: 'Food' },
  { char: '🍪', name: 'cookie', group: 'Food' },
  { char: '☕', name: 'coffee', group: 'Food' },
  { char: '🧋', name: 'boba', group: 'Food' },
  { char: '🍺', name: 'beer', group: 'Food' },
  { char: '🥑', name: 'avocado', group: 'Food' },
  { char: '🍓', name: 'strawberry', group: 'Food' },
  { char: '🥐', name: 'croissant', group: 'Food' },
  { char: '🚀', name: 'rocket', group: 'Objects' },
  { char: '💡', name: 'idea', group: 'Objects' },
  { char: '🎧', name: 'headphones', group: 'Objects' },
  { char: '🎤', name: 'microphone', group: 'Objects' },
  { char: '📷', name: 'camera', group: 'Objects' },
  { char: '🖥️', name: 'desktop', group: 'Objects' },
  { char: '⌨️', name: 'keyboard', group: 'Objects' },
  { char: '🕹️', name: 'joystick', group: 'Objects' },
  { char: '📌', name: 'pin', group: 'Objects' },
  { char: '📎', name: 'paperclip', group: 'Objects' },
  { char: '🗂️', name: 'folders', group: 'Objects' },
  { char: '📝', name: 'memo', group: 'Objects' },
  { char: '🧩', name: 'puzzle', group: 'Objects' },
  { char: '🛎️', name: 'bellhop', group: 'Objects' },
  { char: '🎮', name: 'game', group: 'Objects' },
  { char: '🎲', name: 'dice', group: 'Objects' },
  { char: '💾', name: 'floppy', group: 'Objects' },
  { char: '🔋', name: 'battery', group: 'Objects' },
  { char: '💜', name: 'purple heart', group: 'Symbols' },
  { char: '❤️', name: 'heart', group: 'Symbols' },
  { char: '🧡', name: 'orange heart', group: 'Symbols' },
  { char: '💚', name: 'green heart', group: 'Symbols' },
  { char: '💙', name: 'blue heart', group: 'Symbols' },
  { char: '🖤', name: 'black heart', group: 'Symbols' },
  { char: '✅', name: 'check', group: 'Symbols' },
  { char: '❌', name: 'cross', group: 'Symbols' },
  { char: '⚠️', name: 'warning', group: 'Symbols' },
  { char: '🎉', name: 'tada', group: 'Symbols' },
  { char: '🎊', name: 'confetti', group: 'Symbols' },
  { char: '💯', name: 'hundred', group: 'Symbols' },
  { char: '👌', name: 'ok hand', group: 'Symbols' },
  { char: '🤷', name: 'shrug', group: 'Symbols' },
  { char: '🧡‍🔥', name: 'hearth fire', group: 'Symbols' },
  { char: '🔔', name: 'bell', group: 'Symbols' },
  { char: '🔇', name: 'muted', group: 'Symbols' },
  { char: '📣', name: 'megaphone', group: 'Symbols' },
  { char: '🌀', name: 'cyclone', group: 'Symbols' },
  { char: '⏳', name: 'hourglass', group: 'Symbols' },
];

/** :shortcode: → emoji, used when rendering message text. */
export const SHORTCODES: Record<string, string> = Object.fromEntries(
  EMOJI.map((entry) => [entry.name.replace(/\s+/g, '_'), entry.char]),
);

export const QUICK_REACTIONS = ['👍', '🎉', '😂', '❤️', '👀', '🔥', '✅', '🙏'];

export function searchEmoji(query: string, limit = 48): EmojiEntry[] {
  const term = query.trim().toLowerCase();
  if (!term) return EMOJI.slice(0, limit);
  return EMOJI.filter((entry) => entry.name.includes(term) || entry.char === term).slice(0, limit);
}

export function emojiForShortcode(name: string): string | undefined {
  return SHORTCODES[name.toLowerCase()];
}

/** Replaces :shortcode: sequences with the matching emoji. */
export function applyShortcodes(text: string): string {
  return text.replace(/:([a-z0-9_+-]{2,32}):/gi, (match, name: string) => SHORTCODES[name.toLowerCase()] ?? match);
}
