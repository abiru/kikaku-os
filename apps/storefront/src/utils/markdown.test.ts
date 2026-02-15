import { describe, it, expect, vi } from 'vitest';
import { parseMarkdown, renderMarkdown, getMarkdownPreviewClass } from './markdown';

describe('parseMarkdown', () => {
	it('returns empty string for null/undefined/empty', () => {
		expect(parseMarkdown(null)).toBe('');
		expect(parseMarkdown(undefined)).toBe('');
		expect(parseMarkdown('')).toBe('');
		expect(parseMarkdown('   ')).toBe('');
	});

	it('parses basic markdown to HTML', () => {
		const result = parseMarkdown('**bold** text');
		expect(result).toContain('<strong>bold</strong>');
		expect(result).toContain('text');
	});

	it('parses headings', () => {
		const result = parseMarkdown('# Heading 1');
		expect(result).toContain('<h1>');
		expect(result).toContain('Heading 1');
	});

	it('parses lists', () => {
		const result = parseMarkdown('- item 1\n- item 2');
		expect(result).toContain('<li>');
		expect(result).toContain('item 1');
		expect(result).toContain('item 2');
	});

	it('sanitizes existing HTML content', () => {
		const html = '<p>Hello</p><strong>World</strong>';
		const result = parseMarkdown(html);
		expect(result).toContain('<p>Hello</p>');
		expect(result).toContain('<strong>World</strong>');
	});

	it('strips dangerous script tags from HTML', () => {
		const html = '<p>Safe</p><script>alert("xss")</script>';
		const result = parseMarkdown(html);
		expect(result).toContain('<p>Safe</p>');
		expect(result).not.toContain('<script>');
		expect(result).not.toContain('alert');
	});

	it('strips dangerous attributes from HTML', () => {
		const html = '<p onclick="alert(1)">Click me</p>';
		const result = parseMarkdown(html);
		expect(result).not.toContain('onclick');
		expect(result).toContain('Click me');
	});

	it('allows safe attributes in HTML', () => {
		const html = '<a href="https://example.com" target="_blank">Link</a>';
		const result = parseMarkdown(html);
		expect(result).toContain('href="https://example.com"');
	});

	it('converts line breaks in markdown', () => {
		const result = parseMarkdown('line1\nline2');
		expect(result).toContain('<br>');
	});

	it('falls back to escaped content on parse error', async () => {
		const { marked } = await import('marked');
		const spy = vi.spyOn(marked, 'parse').mockImplementation(() => { throw new Error('parse error'); });
		try {
			const result = parseMarkdown('plain text with & and "quotes"');
			expect(result).toContain('<p>');
			expect(result).toContain('&amp;');
			expect(result).toContain('&quot;quotes&quot;');
		} finally {
			spy.mockRestore();
		}
	});
});

describe('renderMarkdown', () => {
	it('is an alias for parseMarkdown', () => {
		expect(renderMarkdown).toBe(parseMarkdown);
	});
});

describe('getMarkdownPreviewClass', () => {
	it('returns the expected CSS class', () => {
		expect(getMarkdownPreviewClass()).toBe('product-description');
	});
});
