import { Children, isValidElement, memo, useMemo, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { applyShortcodes } from '../lib/emoji';
import { highlightCode } from '../lib/highlight';
import { useApp } from '../store';
import { CheckIcon, CopyIcon } from './icons';
import { Lightbox } from './ui';
import { useState } from 'react';

const MENTION_RE = /(@[a-zA-Z0-9_.]{3,20})/g;

function decorateText(text: string, keyPrefix: string): ReactNode {
  const withEmoji = applyShortcodes(text);
  const parts = withEmoji.split(MENTION_RE);
  if (parts.length === 1) return withEmoji;
  return parts.map((part, index) => {
    if (MENTION_RE.test(part) && part.startsWith('@')) {
      return (
        <span
          key={`${keyPrefix}-m${index}`}
          className="rounded-md bg-halo-500/20 px-1 py-0.5 font-semibold text-halo-300"
        >
          {part}
        </span>
      );
    }
    return part;
  });
}

function decorate(children: ReactNode, keyPrefix = 'x'): ReactNode {
  return Children.map(children, (child, index) => {
    if (typeof child === 'string') return decorateText(child, `${keyPrefix}-${index}`);
    return child;
  });
}

function rawText(node: ReactNode): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(rawText).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return rawText(node.props.children);
  return '';
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const codeElement = Children.toArray(children)[0];
  const className = isValidElement<{ className?: string }>(codeElement) ? (codeElement.props.className ?? '') : '';
  const language = /language-([\w+#-]+)/.exec(className)?.[1];
  const text = rawText(children).replace(/\n$/, '');
  const html = useMemo(() => highlightCode(text, language), [text, language]);
  const copy = () => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={copy}
        className="btn btn-ghost absolute right-2 top-2 z-10 h-7 gap-1 px-2 text-[11px] opacity-0 transition group-hover:opacity-100"
      >
        {copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre>
        <code className={language ? `language-${language}` : undefined} dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </div>
  );
}

function MessageImage({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="mt-1 block max-w-full">
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="max-h-80 rounded-2xl border border-white/10 object-cover transition hover:border-halo-400/40"
        />
      </button>
      {open && <Lightbox src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}

function Link({ href, children }: { href?: string; children?: ReactNode }) {
  const internal = href?.startsWith('/');
  return (
    <a href={href} target={internal ? undefined : '_blank'} rel={internal ? undefined : 'noreferrer noopener'}>
      {children}
    </a>
  );
}

export const Markdown = memo(function Markdown({ content }: { content: string }) {
  useApp((state) => state.boot?.me.id);
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          p: ({ children }) => <p>{decorate(children, 'p')}</p>,
          li: ({ children }) => <li>{decorate(children, 'li')}</li>,
          td: ({ children }) => <td>{decorate(children, 'td')}</td>,
          th: ({ children }) => <th>{decorate(children, 'th')}</th>,
          h1: ({ children }) => <h1>{decorate(children, 'h1')}</h1>,
          h2: ({ children }) => <h2>{decorate(children, 'h2')}</h2>,
          h3: ({ children }) => <h3>{decorate(children, 'h3')}</h3>,
          blockquote: ({ children }) => <blockquote>{children}</blockquote>,
          a: ({ href, children }) => <Link href={href}>{children}</Link>,
          img: ({ src, alt }) => <MessageImage src={String(src ?? '')} alt={alt ?? 'image'} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
