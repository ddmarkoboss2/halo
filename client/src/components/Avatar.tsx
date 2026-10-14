import { gradientFor, initials, PRESENCE_META } from '../lib/format';
import type { Presence, User } from '../types';

interface AvatarProps {
  user: Pick<User, 'displayName' | 'username' | 'accent' | 'avatarUrl'> & { presence?: Presence } | null;
  size?: number;
  presence?: Presence | null;
  speaking?: boolean;
  className?: string;
  rounded?: 'squircle' | 'full';
}

export function Avatar({ user, size = 40, presence, speaking, className = '', rounded = 'squircle' }: AvatarProps) {
  const name = user?.displayName || user?.username || '?';
  const accent = user?.accent ?? '#7c5cff';
  const radius = rounded === 'full' ? '999px' : `${Math.round(size * 0.34)}px`;
  const meta = presence ? PRESENCE_META[presence] : null;

  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }}>
      <div
        className={`grid h-full w-full place-items-center overflow-hidden font-bold text-white/95 ${
          speaking ? 'speaking-halo' : ''
        }`}
        style={{
          borderRadius: radius,
          background: user?.avatarUrl ? undefined : gradientFor(accent),
          fontSize: Math.max(10, size * 0.38),
          letterSpacing: '-0.02em',
        }}
      >
        {user?.avatarUrl ? (
          <img src={user.avatarUrl} alt={name} className="h-full w-full object-cover" />
        ) : (
          initials(name)
        )}
      </div>
      {meta && (
        <span
          className="absolute -bottom-0.5 -right-0.5 block rounded-full border-[2.5px] border-ink-900"
          style={{
            width: Math.max(10, size * 0.32),
            height: Math.max(10, size * 0.32),
            background: meta.color,
          }}
          title={meta.label}
        />
      )}
    </div>
  );
}
