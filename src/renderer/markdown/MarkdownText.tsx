import type { ComponentProps, ReactNode } from 'react';
import Markdown, { type Components, type ExtraProps } from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { isOpenableLink } from '../../domain';
import { useOpenLink } from './use-open-link';
import styles from './MarkdownText.module.css';

interface MarkdownTextProps {
  text: string;
  className?: string;
}

const REMARK_PLUGINS = [remarkGfm, remarkBreaks];

function openableOrEmpty(url: string): string {
  return isOpenableLink(url) ? url : '';
}

function OpenableLink({ href, children }: { href: string | undefined; children: ReactNode }) {
  const openLink = useOpenLink();
  if (href === undefined || href === '') return <span className={styles.unlinked}>{children}</span>;
  return (
    <a
      href={href}
      title={href}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void openLink(href);
      }}
    >
      {children}
    </a>
  );
}

function MarkdownLink({ href, children }: ComponentProps<'a'> & ExtraProps) {
  return <OpenableLink href={href}>{children}</OpenableLink>;
}

function MarkdownImage({ src, alt }: ComponentProps<'img'> & ExtraProps) {
  const source = typeof src === 'string' ? src : undefined;
  return <OpenableLink href={source}>{alt !== undefined && alt !== '' ? alt : 'Image'}</OpenableLink>;
}

const COMPONENTS: Components = { a: MarkdownLink, img: MarkdownImage };

/**
 * Markdown shown as formatted text: GitHub-flavoured markdown (tables, task lists, strikethrough), with single
 * line breaks kept as Obsidian shows them. Raw HTML is left out. Links open outside the app through main, and
 * only http, https, mailto and obsidian ones are links; anything else, such as a relative path, shows as plain
 * text. Images show as a link to their source rather than loading, since the app loads nothing from outside.
 */
export function MarkdownText({ text, className }: MarkdownTextProps) {
  return (
    <div className={[styles.markdown, className].filter(Boolean).join(' ')}>
      <Markdown remarkPlugins={REMARK_PLUGINS} components={COMPONENTS} urlTransform={openableOrEmpty} skipHtml>
        {text}
      </Markdown>
    </div>
  );
}
