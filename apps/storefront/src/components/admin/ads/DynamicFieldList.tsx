import type { FC, ReactNode } from 'react';
import { Input } from '../../catalyst/input';
import { Textarea } from '../../catalyst/textarea';
import { Button } from '../../catalyst/button';
import { CharCount } from './CharCount';

interface DynamicFieldListProps {
  title: string;
  items: string[];
  maxItems: number;
  charLimit: number;
  addLabel: string;
  placeholderPrefix: string;
  multiline?: boolean;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onChange: (index: number, value: string) => void;
}

const RemoveIcon: FC = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
  </svg>
);

export const DynamicFieldList: FC<DynamicFieldListProps> = ({
  title,
  items,
  maxItems,
  charLimit,
  addLabel,
  placeholderPrefix,
  multiline = false,
  onAdd,
  onRemove,
  onChange,
}) => {
  const filledCount = items.filter((item) => item.trim()).length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-zinc-950">
          {title} <span className="text-red-500">*</span>
          <span className="ml-2 text-sm font-normal text-zinc-500">
            ({filledCount}/{maxItems})
          </span>
        </h3>
        {items.length < maxItems && (
          <Button type="button" outline onClick={onAdd}>
            + {addLabel}
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={index} className="flex items-start gap-2">
            <div className="flex-1">
              {multiline ? (
                <Textarea
                  value={item}
                  onChange={(e) => onChange(index, e.target.value)}
                  placeholder={`${placeholderPrefix} ${index + 1}`}
                  rows={2}
                  maxLength={charLimit * 2}
                />
              ) : (
                <Input
                  type="text"
                  value={item}
                  onChange={(e) => onChange(index, e.target.value)}
                  placeholder={`${placeholderPrefix} ${index + 1}`}
                  maxLength={charLimit * 2}
                />
              )}
            </div>
            <div className="flex items-center gap-2">
              <CharCount text={item} limit={charLimit} />
              {items.length > 1 && (
                <Button
                  type="button"
                  plain
                  onClick={() => onRemove(index)}
                  className="text-red-600 hover:text-red-800"
                >
                  <RemoveIcon />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
