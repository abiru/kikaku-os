import type { FC } from 'react';

interface CharCountProps {
  text: string;
  limit: number;
  type: 'headline' | 'description';
}

export const CharCount: FC<CharCountProps> = ({ text, limit, type }) => {
  const length = text.length;
  const percentage = (length / limit) * 100;

  // Color coding based on usage
  const getColor = () => {
    if (length > limit) return 'text-red-600';
    if (percentage >= 80) return 'text-yellow-600';
    return 'text-green-600';
  };

  const getBgColor = () => {
    if (length > limit) return 'bg-red-50';
    if (percentage >= 80) return 'bg-yellow-50';
    return 'bg-green-50';
  };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${getColor()} ${getBgColor()}`}>
      {length > limit && (
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      )}
      <span>
        {length} / {limit}
      </span>
    </span>
  );
};
