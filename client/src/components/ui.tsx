import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../store';
import { AlertIcon, CloseIcon, LoaderIcon } from './icons';

export function IconButton({
  label,
  onClick,
  children,
  active,
  tone = 'default',
  size = 'md',
  disabled,
  className = '',
}: {
  label: string;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
  active?: boolean;
  tone?: 'default' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
  disabled?: boolean;
  className?: string;
}) {
  const tones = {
    default: active
      ? 'bg-halo-500/25 text-white border-halo-400/40'
      : 'text-mist-300 hover:text-white hover:bg-white/10 border-transparent',
    danger: 'text-coral-400 hover:text-white hover:bg-coral-400/25 border-transparent',
    ghost: 'text-mist-400 hover:text-white hover:bg-white/8 border-transparent',
  } as const;
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`btn border ${tones[tone]} ${size === 'sm' ? 'h-7 w-7' : 'h-9 w-9'} ${className}`}
    >
      {children}
    </button>
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  return <LoaderIcon size={size} className="text-halo-400" />;
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 460,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return undefined;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center px-4" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink-950/70 backdrop-blur-sm"
      />
      <div className="panel animate-rise relative w-full overflow-hidden p-0" style={{ maxWidth: width }}>
        <div className="panel-header flex items-start justify-between gap-4 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-white">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-mist-400">{subtitle}</p>}
          </div>
          <IconButton label="Close" onClick={onClose} tone="ghost" size="sm">
            <CloseIcon size={15} />
          </IconButton>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-white/5 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      {icon && (
        <div className="grid h-14 w-14 place-items-center rounded-3xl border border-white/10 bg-white/5 text-halo-300">
          {icon}
        </div>
      )}
      <h3 className="text-base font-bold text-white">{title}</h3>
      {body && <p className="max-w-sm text-sm leading-relaxed text-mist-400">{body}</p>}
      {action}
    </div>
  );
}

export function Toasts() {
  const toasts = useApp((state) => state.toasts);
  const dismiss = useApp((state) => state.dismissToast);
  if (toasts.length === 0) return null;
  return createPortal(
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-80 flex-col gap-2">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => dismiss(toast.id)}
          className={`panel pointer-events-auto animate-rise flex items-start gap-3 px-4 py-3 text-left ${
            toast.kind === 'error' ? 'border-coral-400/40' : ''
          }`}
        >
          <span
            className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-xl text-xs"
            style={{ background: toast.accent ? `${toast.accent}30` : 'rgba(124,92,255,0.25)', color: toast.accent ?? '#c4b5fd' }}
          >
            {toast.kind === 'error' ? <AlertIcon size={15} /> : '✦'}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-white">{toast.title}</span>
            {toast.body && <span className="mt-0.5 block text-xs leading-relaxed text-mist-300">{toast.body}</span>}
          </span>
        </button>
      ))}
    </div>,
    document.body,
  );
}

export function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[70] grid place-items-center bg-ink-950/90 p-6 backdrop-blur">
      <button type="button" aria-label="Close image" onClick={onClose} className="absolute inset-0 cursor-zoom-out" />
      <img src={src} alt={alt} className="animate-rise relative max-h-full max-w-full rounded-2xl border border-white/10" />
      <div className="absolute right-5 top-5 flex gap-2">
        <a href={src} target="_blank" rel="noreferrer" download className="btn btn-ghost h-9 px-3 text-xs">
          Open original
        </a>
        <IconButton label="Close" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </div>
    </div>,
    document.body,
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-mist-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-mist-500">{hint}</span>}
    </label>
  );
}
