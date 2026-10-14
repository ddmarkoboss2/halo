import { useEffect, useRef, useState } from 'react';
import { displayNameOf, timeOf } from '../lib/format';
import { formatBytes } from '../lib/format';
import { QUICK_REACTIONS } from '../lib/emoji';
import { useApp } from '../store';
import type { Message } from '../types';
import { Avatar } from './Avatar';
import {
  AlertIcon,
  CheckIcon,
  ImageIcon,
  PencilIcon,
  ReplyIcon,
  SmileIcon,
  TrashIcon,
} from './icons';
import { EmojiPicker } from './EmojiPicker';
import { Markdown } from './Markdown';
import { Lightbox, Spinner } from './ui';

interface MessageItemProps {
  message: Message;
  grouped: boolean;
  canModerate: boolean;
  onReply: (message: Message) => void;
}

export function MessageItem({ message, grouped, canModerate, onReply }: MessageItemProps) {
  const me = useApp((state) => state.boot?.me);
  const editMessage = useApp((state) => state.editMessage);
  const deleteMessage = useApp((state) => state.deleteMessage);
  const toggleReaction = useApp((state) => state.toggleReaction);
  const openProfile = useApp((state) => state.openProfile);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) {
      editRef.current?.focus();
      const length = editRef.current?.value.length ?? 0;
      editRef.current?.setSelectionRange(length, length);
    }
  }, [editing]);

  const own = message.authorId === me?.id;
  const author = message.author;

  const saveEdit = async () => {
    const next = draft.trim();
    if (!next || next === message.content) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      await editMessage(message, next);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('Delete this message for everyone?')) return;
    setBusy(true);
    try {
      await deleteMessage(message);
    } finally {
      setBusy(false);
    }
  };

  if (message.deleted) {
    return (
      <div className="px-4 py-0.5 text-xs italic text-mist-600" id={`msg-${message.id}`}>
        This message was deleted.
      </div>
    );
  }

  return (
    <div
      id={`msg-${message.id}`}
      className={`group relative px-4 transition-colors hover:bg-white/[0.025] ${grouped ? 'py-0.5' : 'mt-3 py-0.5'} ${
        message.pending ? 'opacity-60' : ''
      }`}
    >
      {message.replyTo && (
        <button
          type="button"
          onClick={() => document.getElementById(`msg-${message.replyTo?.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
          className={`mb-1 flex max-w-[70%] items-center gap-1.5 text-[11px] text-mist-500 transition hover:text-mist-300 ${
            grouped ? 'ml-[46px]' : 'ml-[46px]'
          }`}
        >
          <ReplyIcon size={11} className="shrink-0 rotate-180" />
          <span className="font-semibold text-mist-400">{message.replyTo.authorName}</span>
          <span className="truncate">{message.replyTo.deleted ? 'deleted message' : message.replyTo.content}</span>
        </button>
      )}

      <div className="flex gap-3">
        <div className="w-[34px] shrink-0">
          {!grouped && (
            <button type="button" onClick={() => author && void openProfile(author.id)} className="mt-0.5 transition hover:opacity-90">
              <Avatar user={author} size={34} presence={null} />
            </button>
          )}
        </div>

        <div className="min-w-0 flex-1">
          {!grouped && (
            <div className="mb-0.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => author && void openProfile(author.id)}
                className="text-sm font-bold hover:underline"
                style={{ color: author?.accent ?? '#c4b5fd' }}
              >
                {displayNameOf(author)}
              </button>
              <span className="text-[10px] font-medium text-mist-600">{timeOf(message.createdAt)}</span>
              {message.editedAt && <span className="text-[10px] text-mist-600">(edited)</span>}
              {message.pending && <Spinner size={11} />}
              {message.failed && (
                <span className="flex items-center gap-1 text-[10px] font-semibold text-coral-400">
                  <AlertIcon size={11} /> Not sent
                </span>
              )}
            </div>
          )}

          {editing ? (
            <div className="mt-1">
              <textarea
                ref={editRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void saveEdit();
                  }
                  if (event.key === 'Escape') {
                    setEditing(false);
                    setDraft(message.content);
                  }
                }}
                rows={Math.min(8, draft.split('\n').length)}
                className="input resize-none text-sm"
              />
              <div className="mt-1.5 flex items-center gap-2">
                <button type="button" className="btn btn-primary h-7 px-3 text-xs" onClick={() => void saveEdit()} disabled={busy}>
                  {busy ? <Spinner size={12} /> : <CheckIcon size={12} />} Save
                </button>
                <button
                  type="button"
                  className="btn btn-ghost h-7 px-3 text-xs"
                  onClick={() => {
                    setEditing(false);
                    setDraft(message.content);
                  }}
                >
                  Cancel
                </button>
                <span className="text-[11px] text-mist-500">Enter saves · Esc cancels</span>
              </div>
            </div>
          ) : (
            message.content.trim() && <Markdown content={message.content} />
          )}

          {message.attachments.length > 0 && (
            <div className={`mt-1.5 flex flex-wrap gap-2 ${message.attachments.length > 1 ? 'max-w-2xl' : ''}`}>
              {message.attachments.map((attachment) => (
                <button
                  key={attachment.id ?? attachment.url}
                  type="button"
                  onClick={() => setPreview(attachment.url)}
                  className="group/att relative overflow-hidden rounded-2xl border border-white/10 transition hover:border-halo-400/50"
                >
                  <img
                    src={attachment.url}
                    alt={attachment.filename}
                    loading="lazy"
                    style={{
                      maxHeight: 320,
                      width: message.attachments.length > 1 ? 240 : undefined,
                    }}
                    className="object-cover"
                  />
                  <span className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-ink-950/90 to-transparent px-2.5 py-1.5 text-[10px] text-mist-200 opacity-0 transition group-hover/att:opacity-100">
                    <ImageIcon size={11} /> {attachment.filename} · {formatBytes(attachment.size)}
                  </span>
                </button>
              ))}
            </div>
          )}

          {message.reactions.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {message.reactions.map((reaction) => (
                <button
                  key={reaction.emoji}
                  type="button"
                  title={`${reaction.count} reaction${reaction.count === 1 ? '' : 's'}`}
                  onClick={() => void toggleReaction(message, reaction.emoji)}
                  className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition ${
                    reaction.me
                      ? 'border-halo-400/60 bg-halo-500/20 text-white'
                      : 'border-white/10 bg-white/5 text-mist-300 hover:border-white/25'
                  }`}
                >
                  <span className="text-sm leading-none">{reaction.emoji}</span>
                  <span className="font-semibold">{reaction.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* hover actions */}
      <div className="absolute -top-3 right-4 z-20 hidden items-center gap-0.5 rounded-2xl border border-white/10 bg-ink-850/95 p-1 shadow-2xl backdrop-blur group-hover:flex">
        {QUICK_REACTIONS.slice(0, 4).map((emoji) => (
          <button
            key={emoji}
            type="button"
            title={`React ${emoji}`}
            onClick={() => void toggleReaction(message, emoji)}
            className="grid h-7 w-7 place-items-center rounded-xl text-base transition hover:scale-115 hover:bg-white/10"
          >
            {emoji}
          </button>
        ))}
        <span className="mx-0.5 h-5 w-px bg-white/10" />
        <ActionButton label="Add reaction" onClick={() => setPickerOpen((open) => !open)}>
          <SmileIcon size={15} />
        </ActionButton>
        <ActionButton label="Reply" onClick={() => onReply(message)}>
          <ReplyIcon size={15} />
        </ActionButton>
        {own && (
          <ActionButton label="Edit" onClick={() => setEditing(true)}>
            <PencilIcon size={15} />
          </ActionButton>
        )}
        {(own || canModerate) && (
          <ActionButton label="Delete" tone="danger" onClick={() => void remove()}>
            <TrashIcon size={15} />
          </ActionButton>
        )}
      </div>

      {pickerOpen && (
        <div className="relative">
          <EmojiPicker
            onPick={(emoji) => {
              void toggleReaction(message, emoji);
              setPickerOpen(false);
            }}
            onClose={() => setPickerOpen(false)}
          />
        </div>
      )}

      {preview && <Lightbox src={preview} alt="Attachment" onClose={() => setPreview(null)} />}
    </div>
  );
}


function ActionButton({
  label,
  onClick,
  children,
  tone = 'default',
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  tone?: 'default' | 'danger';
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`grid h-7 w-7 place-items-center rounded-xl transition ${
        tone === 'danger' ? 'text-coral-400 hover:bg-coral-400/20' : 'text-mist-300 hover:bg-white/10 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}
