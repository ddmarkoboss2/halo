import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { dayLabel, sameDay, isTypingName } from '../lib/format';
import { useApp } from '../store';
import type { Message } from '../types';
import { MessageItem } from './MessageItem';
import { Spinner } from './ui';
import { SparklesIcon } from './icons';

interface MessageListProps {
  scope: 'channel' | 'dm';
  scopeId: string;
  canModerate: boolean;
  onReply: (message: Message) => void;
}

const GROUP_WINDOW_MS = 5 * 60_000;

export function MessageList({ scope, scopeId, canModerate, onReply }: MessageListProps) {
  const key = `${scope}:${scopeId}`;
  const bucket = useApp((state) => state.messages[key]);
  const loadMessages = useApp((state) => state.loadMessages);
  const typing = useApp((state) => state.typing[key]) ?? [];
  const [loadingOlder, setLoadingOlder] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  const messages = bucket?.items ?? [];

  useEffect(() => {
    void loadMessages(scope, scopeId);
  }, [loadMessages, scope, scopeId]);

  const lastId = messages.at(-1)?.id;

  useLayoutEffect(() => {
    if (!pinned.current) return;
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [lastId, key]);

  useEffect(() => {
    pinned.current = true;
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: 'end' }));
  }, [key]);

  const onScroll = () => {
    const element = scroller.current;
    if (!element) return;
    pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
  };

  const loadOlder = async () => {
    const first = messages.find((message) => !message.pending);
    if (!first) return;
    setLoadingOlder(true);
    const heightBefore = scroller.current?.scrollHeight ?? 0;
    try {
      await loadMessages(scope, scopeId, { before: first.createdAt });
      requestAnimationFrame(() => {
        const element = scroller.current;
        if (element) element.scrollTop = element.scrollHeight - heightBefore;
      });
    } finally {
      setLoadingOlder(false);
    }
  };

  const rendered = useMemo(() => {
    const out: React.ReactNode[] = [];
    messages.forEach((message, index) => {
      const previous = messages[index - 1];
      if (!previous || !sameDay(previous.createdAt, message.createdAt)) {
        out.push(
          <div key={`day-${message.id}`} className="flex items-center gap-3 px-4 pb-3 pt-5">
            <span className="h-px flex-1 bg-white/8" />
            <span className="chip">{dayLabel(message.createdAt)}</span>
            <span className="h-px flex-1 bg-white/8" />
          </div>,
        );
      }
      const grouped =
        Boolean(previous) &&
        previous.authorId === message.authorId &&
        message.createdAt - previous.createdAt < GROUP_WINDOW_MS &&
        sameDay(previous.createdAt, message.createdAt) &&
        !previous.deleted;
      out.push(
        <MessageItem
          key={message.id}
          message={message}
          grouped={grouped}
          canModerate={canModerate}
          onReply={onReply}
        />,
      );
    });
    return out;
  }, [messages, canModerate, onReply]);

  return (
    <div ref={scroller} onScroll={onScroll} className="flex-1 overflow-y-auto overscroll-contain pb-2 scroll-thin">
      {bucket?.hasMore && (
        <div className="flex justify-center px-4 pt-4">
          <button type="button" className="btn btn-ghost h-8 px-3 text-xs" onClick={() => void loadOlder()} disabled={loadingOlder}>
            {loadingOlder ? <Spinner size={12} /> : null}
            {loadingOlder ? 'Loading…' : 'Load earlier messages'}
          </button>
        </div>
      )}

      {!bucket?.loaded && messages.length === 0 ? (
        <div className="space-y-4 p-6">
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex gap-3">
              <div className="skeleton h-9 w-9 rounded-xl" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-3 w-32 rounded-full" />
                <div className="skeleton h-3 w-2/3 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : messages.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-3xl border border-white/10 bg-white/5 text-halo-300">
            <SparklesIcon size={22} />
          </span>
          <p className="text-sm font-semibold text-white">This is the start of something</p>
          <p className="max-w-xs text-xs text-mist-400">
            Say hi, share a screenshot, or drop a code block. Markdown, reactions and replies all work here.
          </p>
        </div>
      ) : (
        rendered
      )}

      <div ref={bottomRef} className="h-1" />

      <div className="px-4 pt-1.5">
        {typing.length > 0 && (
          <p className="flex items-center gap-2 text-xs text-halo-300">
            <span className="flex gap-0.5">
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-halo-400" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-halo-400" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-halo-400" />
            </span>
            {isTypingName(typing)}
          </p>
        )}
      </div>
    </div>
  );
}
