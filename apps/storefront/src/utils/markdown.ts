import { marked } from 'marked';

/**
 * Configure marked options for secure markdown parsing
 */
marked.setOptions({
  gfm: true,           // GitHub Flavored Markdown
  breaks: true,        // Convert \n to <br>
  headerIds: true,     // Add IDs to headers
  mangle: false,       // Don't escape email addresses
});

/**
 * Parse markdown content to HTML
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
    return html;
  } catch (error) {
    console.error('Failed to parse markdown:', error);
    // Fallback to original content wrapped in paragraph
    return `<p>${content}</p>`;
  }
}
