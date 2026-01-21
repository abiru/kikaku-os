/**
 * HTML escaping utility to prevent XSS vulnerabilities.
 */

/**
 * Escapes HTML special characters to prevent XSS attacks.
 *
 * @param text - The text to escape (can be null or undefined)
 * @returns The escaped text safe for HTML embedding, or empty string if input is null/undefined
 *
 * @example
 * ```ts
 * escapeHtml('<script>alert("XSS")</script>')
 * // Returns: '&lt;script&gt;alert(&quot;XSS&quot;)&lt;&#x2F;script&gt;'
 * ```
 */
export const escapeHtml = (text: string | null | undefined): string => {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')    // Must be first to avoid double-escaping
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};
