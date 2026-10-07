/**
 * Minimal, dependency-free Markdown renderer.
 *
 * Supports: headings, bold/italic/strike, inline code, fenced code blocks,
 * blockquotes, unordered/ordered lists, links, images, horizontal rules and
 * paragraphs. Input is escaped first, so this is safe for user content.
 */

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(url: string): string {
  const trimmed = url.trim();
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return '#';
  return trimmed;
}

function renderInline(raw: string): string {
  let text = escapeHtml(raw);

  // Inline code first so its contents are not touched by the other rules.
  const codeSpans: string[] = [];
  text = text.replace(/`([^`]+)`/g, (_m, code: string) => {
    codeSpans.push(code);
    return `\u0000CODE${codeSpans.length - 1}\u0000`;
  });

  // Images: ![alt](src)
  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, alt: string, src: string) =>
    `<img src="${safeUrl(src)}" alt="${alt}" loading="lazy" />`,
  );

  // Links: [text](href)
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, label: string, href: string) => {
    const url = safeUrl(href);
    const external = /^https?:\/\//i.test(url);
    return `<a href="${url}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`;
  });

  // Autolinks
  text = text.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (_m, prefix: string, url: string) =>
    `${prefix}<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`,
  );

  text = text.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  // Restore code spans
  text = text.replace(/\u0000CODE(\d+)\u0000/g, (_m, idx: string) => `<code>${codeSpans[Number(idx)]}</code>`);

  return text;
}

function renderBlockquote(block: string): string {
  const inner = block
    .split('\n')
    .map((line) => line.replace(/^>\s?/, ''))
    .join('\n');
  return `<blockquote>${renderMarkdown(inner)}</blockquote>`;
}

function renderList(lines: string[], ordered: boolean): string {
  const items: string[] = [];
  let current = '';

  const flush = () => {
    if (current.trim()) items.push(current.trim());
    current = '';
  };

  for (const line of lines) {
    const match: RegExpExecArray | null = ordered
      ? /^(\d+)\.\s+(.*)$/.exec(line)
      : /^[-*+]\s+(.*)$/.exec(line);
    if (match) {
      flush();
      current = match[2] ?? '';
    } else {
      current += `\n${line}`;
    }
  }
  flush();

  const tag = ordered ? 'ol' : 'ul';
  const body = items.map((item) => `<li>${renderInline(item.replace(/\n/g, ' '))}</li>`).join('');
  return `<${tag}>${body}</${tag}>`;
}

/** Convert a subset of Markdown to sanitised HTML. */
export function renderMarkdown(source: string): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence) {
      const lang = fence[1] ?? '';
      const buffer: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        buffer.push(lines[i]);
        i++;
      }
      i++; // closing fence
      out.push(
        `<pre data-lang="${lang}"><code>${escapeHtml(buffer.join('\n'))}</code></pre>`,
      );
      continue;
    }

    // Blank line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Heading
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      out.push('<hr />');
      i++;
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(line)) {
      const buffer: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buffer.push(lines[i]);
        i++;
      }
      out.push(renderBlockquote(buffer.join('\n')));
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const buffer: string[] = [];
      while (i < lines.length && (/^\s*[-*+]\s+/.test(lines[i]) || /^\s{2,}\S/.test(lines[i]))) {
        buffer.push(lines[i]);
        i++;
      }
      out.push(renderList(buffer, false));
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const buffer: string[] = [];
      while (i < lines.length && (/^\s*\d+\.\s+/.test(lines[i]) || /^\s{2,}\S/.test(lines[i]))) {
        buffer.push(lines[i]);
        i++;
      }
      out.push(renderList(buffer, true));
      continue;
    }

    // Paragraph (consume until a blank line or a new block starter)
    const buffer: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6}\s|```|>|\s*[-*+]\s|\s*\d+\.\s)/.test(lines[i])
    ) {
      buffer.push(lines[i]);
      i++;
    }
    if (buffer.length) out.push(`<p>${renderInline(buffer.join('\n'))}</p>`);
    else i++;
  }

  return out.join('\n');
}

/** Rough word count for live stats in the editor. */
export function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}