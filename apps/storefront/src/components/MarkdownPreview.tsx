import { useState } from 'react';
import { renderMarkdown, getMarkdownPreviewClass } from '../lib/markdown';

interface MarkdownPreviewProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function MarkdownPreview({
  value,
  onChange,
  placeholder = 'Markdown形式で説明を入力...',
}: MarkdownPreviewProps) {
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  return (
    <div className="markdown-editor">
      {/* Tab Headers */}
      <div className="flex border-b border-gray-200 mb-4">
        <button
          type="button"
          onClick={() => setActiveTab('edit')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'edit'
              ? 'border-b-2 border-[#0071e3] text-[#0071e3]'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          編集
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('preview')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'preview'
              ? 'border-b-2 border-[#0071e3] text-[#0071e3]'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          プレビュー
        </button>
      </div>

      {/* Help Text */}
      <div className="mb-3 text-xs text-gray-500">
        対応構文: <code className="bg-gray-100 px-1 py-0.5 rounded"># 見出し</code>,{' '}
        <code className="bg-gray-100 px-1 py-0.5 rounded">**太字**</code>,{' '}
        <code className="bg-gray-100 px-1 py-0.5 rounded">- リスト</code>,{' '}
        <code className="bg-gray-100 px-1 py-0.5 rounded">`コード`</code>,{' '}
        <code className="bg-gray-100 px-1 py-0.5 rounded">[リンク](url)</code>
      </div>

      {/* Editor Tab */}
      {activeTab === 'edit' && (
        <textarea
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          rows={10}
          className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/20 focus:border-[#0071e3] transition-all resize-vertical font-mono"
        />
      )}

      {/* Preview Tab */}
      {activeTab === 'preview' && (
        <div
          className={`min-h-[240px] px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 text-sm ${getMarkdownPreviewClass()}`}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(value) }}
        />
      )}

      {/* Character Count */}
      <div className="mt-2 text-xs text-gray-400 text-right">
        {value.length} 文字
      </div>
    </div>
  );
}
