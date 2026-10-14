import { useMemo } from 'react';
import { useApp } from '../store';
import type { User } from '../types';

/** Merges every user the client already knows about into one lookup map. */
export function useUserMap(): Map<string, User> {
  const boot = useApp((state) => state.boot);
  const members = useApp((state) => state.members);
  return useMemo(() => {
    const map = new Map<string, User>();
    if (boot) {
      map.set(boot.me.id, boot.me);
      for (const friend of boot.friends) map.set(friend.id, friend);
      for (const dm of boot.dms) if (dm.other) map.set(dm.other.id, dm.other);
      for (const friendship of boot.friendships) map.set(friendship.user.id, friendship.user);
    }
    for (const list of Object.values(members)) {
      for (const user of list) map.set(user.id, user);
    }
    return map;
  }, [boot, members]);
}

export function useUser(userId: string | null | undefined): User | null {
  const map = useUserMap();
  if (!userId) return null;
  return map.get(userId) ?? null;
}
