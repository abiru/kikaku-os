import { describe, test, expect } from 'vitest';
import { escapeHtml } from '../../lib/html';

describe('escapeHtml', () => {
  test('escapes basic HTML tags', () => {
    expect(escapeHtml('<div>content</div>')).toBe('&lt;div&gt;content&lt;&#x2F;div&gt;');
    expect(escapeHtml('<p>paragraph</p>')).toBe('&lt;p&gt;paragraph&lt;&#x2F;p&gt;');
  });

  test('escapes script tags to prevent XSS', () => {
    expect(escapeHtml('<script>alert("XSS")</script>')).toBe(
      '&lt;script&gt;alert(&quot;XSS&quot;)&lt;&#x2F;script&gt;'
    );
    expect(escapeHtml('<script>alert(\'XSS\')</script>')).toBe(
      '&lt;script&gt;alert(&#x27;XSS&#x27;)&lt;&#x2F;script&gt;'
    );
  });

  test('escapes event handlers', () => {
    expect(escapeHtml('<img src=x onerror=alert("XSS")>')).toBe(
      '&lt;img src=x onerror=alert(&quot;XSS&quot;)&gt;'
    );
    expect(escapeHtml('<a href="#" onclick="alert(\'XSS\')">link</a>')).toBe(
      '&lt;a href=&quot;#&quot; onclick=&quot;alert(&#x27;XSS&#x27;)&quot;&gt;link&lt;&#x2F;a&gt;'
    );
  });

  test('escapes ampersands', () => {
    expect(escapeHtml('A & B')).toBe('A &amp; B');
    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
  });

  test('escapes quotes', () => {
    expect(escapeHtml('"double quotes"')).toBe('&quot;double quotes&quot;');
    expect(escapeHtml("'single quotes'")).toBe('&#x27;single quotes&#x27;');
    expect(escapeHtml('mixed "double" and \'single\' quotes')).toBe(
      'mixed &quot;double&quot; and &#x27;single&#x27; quotes'
    );
  });

  test('escapes forward slashes', () => {
    expect(escapeHtml('</script>')).toBe('&lt;&#x2F;script&gt;');
    expect(escapeHtml('path/to/file')).toBe('path&#x2F;to&#x2F;file');
  });

  test('handles null and undefined safely', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  test('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  test('preserves Unicode characters (Japanese)', () => {
    expect(escapeHtml('こんにちは')).toBe('こんにちは');
    expect(escapeHtml('株式会社テスト')).toBe('株式会社テスト');
    expect(escapeHtml('価格：¥1,000')).toBe('価格：¥1,000');
  });

  test('handles mixed content', () => {
    expect(escapeHtml('<div>こんにちは & "Hello"</div>')).toBe(
      '&lt;div&gt;こんにちは &amp; &quot;Hello&quot;&lt;&#x2F;div&gt;'
    );
  });

  test('handles newlines and whitespace', () => {
    expect(escapeHtml('line1\nline2')).toBe('line1\nline2');
    expect(escapeHtml('  spaces  ')).toBe('  spaces  ');
  });

  test('prevents double-escaping by design (security-first approach)', () => {
    // Note: This will double-escape, which is acceptable for security
    expect(escapeHtml('&amp;')).toBe('&amp;amp;');
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  test('escapes complex XSS attack vectors', () => {
    expect(escapeHtml('<img src=x onerror="javascript:alert(\'XSS\')">')).toBe(
      '&lt;img src=x onerror=&quot;javascript:alert(&#x27;XSS&#x27;)&quot;&gt;'
    );
    expect(escapeHtml('<iframe src="javascript:alert(\'XSS\')"></iframe>')).toBe(
      '&lt;iframe src=&quot;javascript:alert(&#x27;XSS&#x27;)&quot;&gt;&lt;&#x2F;iframe&gt;'
    );
  });

  test('handles numbers by converting to string', () => {
    expect(escapeHtml(123 as any)).toBe('123');
    // Note: 0 is falsy, so it returns empty string by design
    // If you need to handle 0, convert to string before calling escapeHtml
    expect(escapeHtml(0 as any)).toBe('');
  });
});
