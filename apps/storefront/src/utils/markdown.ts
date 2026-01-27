import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

/**
 * Configure marked options for secure markdown parsing
 */
marked.setOptions({
  gfm: true,           // GitHub Flavored Markdown
  breaks: true,        // Convert \n to <br>
});

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Parse markdown content to HTML with XSS sanitization
 * @param content - Markdown string to parse
 * @returns Sanitized HTML string
 */
export function parseMarkdown(content: string): string {
  if (!content || content.trim() === '') {
    return '';
  }

  try {
    // Parse markdown to HTML
    const html = marked.parse(content, { async: false }) as string;

    // Sanitize HTML to prevent XSS attacks
    const sanitized = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'strong', 'em', 'u', 's', 'a', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'div', 'span'],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'title', 'class', 'id'],
      ALLOW_DATA_ATTR: false,
    });

    return sanitized;
  } catch (error) {
    console.error('Failed to parse markdown:', error);
    // Fallback to escaped content wrapped in paragraph
    return `<p>${escapeHtml(content)}</p>`;
  }
}
