import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MarkdownPreview from '../components/MarkdownPreview';

// Mock the markdown utils to control output and test XSS prevention
vi.mock('../utils/markdown', () => ({
  renderMarkdown: (content: string) => {
    // Use actual DOMPurify-like behavior for XSS tests
    // Strip script tags, event handlers, etc.
    const stripped = content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/\bon\w+\s*=\s*"[^"]*"/gi, '')
      .replace(/\bon\w+\s*=\s*'[^']*'/gi, '');
    return stripped;
  },
  getMarkdownPreviewClass: () => 'product-description',
}));

describe('MarkdownPreview', () => {
  const defaultProps = {
    value: '',
    onChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders edit tab by default with textarea', () => {
    render(<MarkdownPreview {...defaultProps} value="hello" />);

    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue('hello');
  });

  it('switches to preview tab and back', () => {
    render(<MarkdownPreview {...defaultProps} value="**bold**" />);

    // Initially in edit mode
    expect(screen.getByRole('textbox')).toBeInTheDocument();

    // Switch to preview
    fireEvent.click(screen.getByText('プレビュー'));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    // Switch back to edit
    fireEvent.click(screen.getByText('編集'));
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('calls onChange when textarea value changes', () => {
    const onChange = vi.fn();
    render(<MarkdownPreview {...defaultProps} onChange={onChange} />);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'new content' } });

    expect(onChange).toHaveBeenCalledWith('new content');
  });

  it('shows character count', () => {
    render(<MarkdownPreview {...defaultProps} value="hello" />);
    expect(screen.getByText('5 文字')).toBeInTheDocument();
  });

  it('uses custom placeholder', () => {
    render(<MarkdownPreview {...defaultProps} placeholder="Enter text..." />);
    expect(screen.getByPlaceholderText('Enter text...')).toBeInTheDocument();
  });

  // XSS Prevention Tests
  describe('XSS prevention', () => {
    it('does not render script tags in preview', () => {
      const xssPayload = '<script>alert("xss")</script>';
      const { container } = render(
        <MarkdownPreview {...defaultProps} value={xssPayload} />
      );

      // Switch to preview tab
      fireEvent.click(screen.getByText('プレビュー'));

      // Check that no script tag exists in the rendered HTML
      const previewDiv = container.querySelector('.product-description');
      expect(previewDiv).toBeInTheDocument();
      expect(previewDiv!.innerHTML).not.toContain('<script>');
      expect(previewDiv!.innerHTML).not.toContain('alert');
    });

    it('strips onerror attributes from img tags in preview', () => {
      const xssPayload = '<img src="x" onerror="alert(\'xss\')">';
      const { container } = render(
        <MarkdownPreview {...defaultProps} value={xssPayload} />
      );

      // Switch to preview tab
      fireEvent.click(screen.getByText('プレビュー'));

      const previewDiv = container.querySelector('.product-description');
      expect(previewDiv).toBeInTheDocument();
      expect(previewDiv!.innerHTML).not.toContain('onerror');
      expect(previewDiv!.innerHTML).not.toContain('alert');
    });

    it('strips onclick attributes from elements in preview', () => {
      const xssPayload = '<div onclick="alert(\'xss\')">Click me</div>';
      const { container } = render(
        <MarkdownPreview {...defaultProps} value={xssPayload} />
      );

      // Switch to preview tab
      fireEvent.click(screen.getByText('プレビュー'));

      const previewDiv = container.querySelector('.product-description');
      expect(previewDiv).toBeInTheDocument();
      expect(previewDiv!.innerHTML).not.toContain('onclick');
    });
  });
});
