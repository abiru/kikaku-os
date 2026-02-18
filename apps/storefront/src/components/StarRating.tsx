import { useState, useId, useRef, useEffect } from 'react';
import { t } from '../i18n';

type DisplayProps = {
  rating: number;
  size?: 'sm' | 'md' | 'lg';
  showValue?: boolean;
};

const sizeClasses = {
  sm: 'size-4',
  md: 'size-5',
  lg: 'size-6',
} as const;

const STAR_PATH = 'M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z';

function Star({ filled, half, className, gradientId }: { filled: boolean; half?: boolean; className: string; gradientId?: string }) {
  if (half && gradientId) {
    return (
      <svg className={className} viewBox="0 0 24 24">
        <defs>
          <linearGradient id={gradientId}>
            <stop offset="50%" stopColor="currentColor" />
            <stop offset="50%" stopColor="transparent" />
          </linearGradient>
        </defs>
        <path
          fill={`url(#${gradientId})`}
          stroke="currentColor"
          strokeWidth="1.5"
          d={STAR_PATH}
        />
      </svg>
    );
  }

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d={STAR_PATH}
      />
    </svg>
  );
}

export function StarRatingDisplay({ rating, size = 'md', showValue = false }: DisplayProps) {
  const id = useId();
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    const filled = i <= Math.floor(rating);
    const half = !filled && i === Math.ceil(rating) && rating % 1 >= 0.25;
    stars.push(
      <Star
        key={i}
        filled={filled}
        half={half}
        gradientId={`${id}-halfStar-${i}`}
        className={`${sizeClasses[size]} ${filled || half ? 'text-yellow-400' : 'text-gray-300'}`}
      />
    );
  }

  return (
    <div className="flex items-center gap-0.5">
      {stars}
      {showValue && (
        <span className="ml-1.5 text-sm font-medium text-gray-700">{rating.toFixed(1)}</span>
      )}
    </div>
  );
}

type InputProps = {
  value: number;
  onChange: (rating: number) => void;
  size?: 'md' | 'lg';
};

export function StarRatingInput({ value, onChange, size = 'lg' }: InputProps) {
  const [hovered, setHovered] = useState(0);
  const groupRef = useRef<HTMLDivElement>(null);
  const focusPending = useRef(false);

  useEffect(() => {
    if (focusPending.current && groupRef.current) {
      const active = groupRef.current.querySelector<HTMLButtonElement>('[tabindex="0"]');
      active?.focus();
      focusPending.current = false;
    }
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent, star: number) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onChange(star);
      return;
    }
    let next = star;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      next = star < 5 ? star + 1 : 1;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      next = star > 1 ? star - 1 : 5;
    } else if (e.key === 'Home') {
      e.preventDefault();
      next = 1;
    } else if (e.key === 'End') {
      e.preventDefault();
      next = 5;
    } else {
      return;
    }
    focusPending.current = true;
    onChange(next);
  };

  return (
    <div ref={groupRef} className="flex items-center gap-1" role="radiogroup" aria-label={t('reviews.rating')}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={star === value}
          tabIndex={star === (value || 1) ? 0 : -1}
          onClick={() => onChange(star)}
          onKeyDown={(e) => handleKeyDown(e, star)}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          className="transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 rounded-sm"
          aria-label={`${star}${t('reviews.stars')}`}
        >
          <Star
            filled={star <= (hovered || value)}
            className={`${sizeClasses[size]} ${
              star <= (hovered || value) ? 'text-yellow-400' : 'text-gray-300'
            } transition-colors`}
          />
        </button>
      ))}
    </div>
  );
}
