import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { displayNameOf, formatBytes } from '../lib/format';
import { useApp } from '../store';
import type { Attachment, Message } from '../types';
import { EmojiPicker } from './EmojiPicker';
import { CloseIcon, ImageIcon, ReplyIcon, SendIcon, SmileIcon } from './icons';
import { Spinner } from './ui';

interface ComposerProps {
  scope: 'channel' | 'dm';
  scopeId: string;
  placeholder: string;
  replyTo: Message | null;
  onCancelReply: () => void;
}

export function Composer({ scope, scopeId, placeholder, replyTo, onCancelReply }: ComposerProps) {
  const sendMessage = useApp((state) => state.sendMessage);
  const notifyTyping = useApp((state) => state.notifyTyping);
  const pushToast = useApp((state) => state.pushToast);

  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastTyping = useRef(0);

  useEffect(() => {
    const element = textarea.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 220)}px`;
  }, [value]);

  useEffect(() => {
    textarea.current?.focus();
    setAttachments([]);
    setValue('');
  }, [scopeId]);

  const upload = async (files: File[] | FileList) => {
    const list = [...files].filter((file) => file.type.startsWith('image/'));
    const rejected = [...files].length - list.length;
    if (rejected > 0) pushToast({ title: 'Only images can be attached', kind: 'error' });
    for (const file of list.slice(0, 8)) {
      setUploading((count) => count + 1);
      try {
        const { attachment } = await api.upload(file);
        setAttachments((current) => [...current, attachment].slice(0, 8));
      } catch (error) {
        pushToast({ title: 'Upload failed', body: error instanceof Error ? error.message : '', kind: 'error' });
      } finally {
        setUploading((count) => Math.max(0, count - 1));
      }
    }
  };

  const submit = async () => {
    const content = value.trim();
    if (!content && attachments.length === 0) return;
    const payload = { scope, scopeId, content, replyToId: replyTo?.id ?? null, attachments };
    setValue('');
    setAttachments([]);
    onCancelReply();
    await sendMessage(payload);
    textarea.current?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
    if (event.key === 'Escape' && replyTo) onCancelReply();
  };

  const onChange = (next: string) => {
    setValue(next);
    const now = Date.now();
    if (now - lastTyping.current > 2500 && next.trim().length > 0) {
      lastTyping.current = now;
      notifyTyping(scope, scopeId);
    }
  };

  const canSend = value.trim().length > 0 || attachments.length > 0;

  return (
    <div className="px-4 pb-4">
      {replyTo && (
        <div className="mx-1 mb-2 flex items-center gap-2 rounded-2xl border border-halo-400/30 bg-halo-500/10 px-3 py-2 text-xs">
          <ReplyIcon size={13} className="shrink-0 text-halo-300" />
          <span className="text-mist-300">
            Replying to <span className="font-semibold text-white">{displayNameOf(replyTo.author)}</span>{' '}
            <span className="truncate text-mist-400">{replyTo.content.slice(0, 80)}</span>
          </span>
          <button type="button" onClick={onCancelReply} className="ml-auto text-mist-400 transition hover:text-white">
            <CloseIcon size={13} />
          </button>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="mx-1 mb-2 flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <div key={attachment.url} className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5">
              <img src={attachment.url} alt={attachment.filename} className="h-24 w-32 object-cover" />
              <span className="absolute bottom-0 left-0 right-0 truncate bg-ink-950/80 px-2 py-0.5 text-[10px] text-mist-200">
                {formatBytes(attachment.size)}
              </span>
              <button
                type="button"
                onClick={() => setAttachments((current) => current.filter((item) => item.url !== attachment.url))}
                className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-ink-950/80 text-mist-200 transition hover:text-white"
                aria-label="Remove attachment"
              >
                <CloseIcon size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          if (event.dataTransfer.files.length) void upload(event.dataTransfer.files);
        }}
        className={`relative flex items-end gap-1 rounded-3xl border bg-ink-950/55 p-2 backdrop-blur transition ${
          dragOver ? 'border-halo-400/70 bg-halo-500/10' : 'border-white/8 focus-within:border-halo-400/45'
        }`}
      >
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            if (event.target.files) void upload(event.target.files);
            event.target.value = '';
          }}
        />

        <button
          type="button"
          title="Attach images"
          onClick={() => fileInput.current?.click()}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl text-mist-400 transition hover:bg-white/8 hover:text-white"
        >
          {uploading > 0 ? <Spinner size={16} /> : <ImageIcon size={17} />}
        </button>

        <textarea
          ref={textarea}
          rows={1}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          onPaste={(event) => {
            const files = [...event.clipboardData.files];
            if (files.length) {
              event.preventDefault();
              void upload(files);
            }
          }}
          className="max-h-[220px] flex-1 resize-none bg-transparent px-2 py-2 text-sm text-mist-100 outline-none placeholder:text-mist-600 scroll-thin"
        />

        <button
          type="button"
          title="Emoji"
          onClick={() => setPickerOpen((open) => !open)}
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-2xl transition hover:bg-white/8 ${
            pickerOpen ? 'text-halo-300' : 'text-mist-400 hover:text-white'
          }`}
        >
          <SmileIcon size={17} />
        </button>

        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canSend}
          className="btn btn-primary h-9 w-10 shrink-0 rounded-2xl"
          title="Send message"
        >
          <SendIcon size={16} />
        </button>

        {pickerOpen && (
          <EmojiPicker
            onPick={(emoji) => {
              setValue((current) => current + emoji);
              textarea.current?.focus();
            }}
            onClose={() => setPickerOpen(false)}
          />
        )}

        {dragOver && (
          <span className="pointer-events-none absolute inset-0 grid place-items-center rounded-3xl text-xs font-semibold text-halo-200">
            Drop images to attach
          </span>
        )}
      </div>

      <p className="mt-1.5 px-2 text-[10px] text-mist-600">
        <span className="font-semibold text-mist-500">Enter</span> to send ·{' '}
        <span className="font-semibold text-mist-500">Shift+Enter</span> for a new line · Markdown, `code`, **bold**,
        &gt; quotes and :shortcodes: work
      </p>
    </div>
  );
}
