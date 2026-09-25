import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowUpRight } from 'lucide-react';
import { useT } from './i18n.jsx';
import { CopyButton } from './ui.jsx';

function codeText(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(codeText).join('');
  return node?.props ? codeText(node.props.children) : '';
}

function CodeBlock({ children }) {
  const t = useT();
  const language = /language-([^\s]+)/.exec(children?.props?.className || '')?.[1];
  return <div className="markdown-code">
    <div className="code-heading"><span>{language || t('conv.code')}</span><CopyButton text={codeText(children).replace(/\n$/, '')} label={t('conv.copyCode')} /></div>
    <pre>{children}</pre>
  </div>;
}

export default function Markdown({ content, onOpenFile }) {
  const t = useT();
  return <div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={defaultUrlTransform} components={{
    pre: CodeBlock,
    a: ({ href, children }) => {
      if (!href) return <span>{children}</span>;
      const isExternal = /^(https?:|mailto:)/i.test(href);
      if (isExternal) return <a href={href} target="_blank" rel="noopener noreferrer">{children}<ArrowUpRight className="external-link-icon" size={11} aria-hidden="true" /></a>;
      const isFile = !/^(#|\/|[a-z][a-z\d+.-]*:)/i.test(href);
      if (isFile && onOpenFile) return <button type="button" className="inline-file-link" onClick={() => onOpenFile(href.split('#')[0])}>{children}</button>;
      return <span>{children}</span>;
    },
    img: ({ alt }) => <span className="image-placeholder">{alt ? t('md.image', { alt }) : t('md.imageOmitted')} <span>{t('md.remoteNote')}</span></span>,
    table: ({ children }) => <div className="markdown-table"><table>{children}</table></div>,
    input: ({ checked }) => <input type="checkbox" checked={Boolean(checked)} disabled aria-label={checked ? t('md.itemDone') : t('md.itemOpen')} />,
  }}>{content || ''}</ReactMarkdown></div>;
}
