import { marked } from 'marked';

/**
 * Check if text contains HTML tags
 */
const isHtml = (text: string): boolean => {
  return /<[^>]+>/g.test(text);
};

/**
 * Basic HTML sanitization to prevent XSS
 * Removes script tags and event handlers
 */
const sanitizeHtml = (html: string): string => {
  // Remove script tags and their content
  let sanitized = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Remove on* event handlers
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*[^\s>]*/gi, '');

  return sanitized;
};

/**
 * Configure marked for secure rendering
 */
marked.setOptions({
  breaks: true,        // Convert newlines to <br>
  gfm: true,          // GitHub Flavored Markdown
  smartLists: true,   // Better list rendering
});

/**
 * Render markdown to HTML with XSS protection
 * Supports both Markdown and legacy HTML formats
 *
 * @param text - Markdown or HTML string to render
 * @returns Safe HTML string
 */
export const renderMarkdown = (text: string | null | undefined): string => {
  if (!text) {
    return '';
  }

  // Detect if content is HTML (backward compatibility)
  if (isHtml(text)) {
    return sanitizeHtml(text);
  }

  // Parse markdown to HTML
  const html = marked.parse(text, { async: false }) as string;

  // Sanitize the output
  return sanitizeHtml(html);
};

/**
 * Get CSS class name for markdown preview styling
 */
export const getMarkdownPreviewClass = (): string => {
  return 'product-description';
};
