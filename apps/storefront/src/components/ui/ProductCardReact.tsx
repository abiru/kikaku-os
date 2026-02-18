import { cardClasses } from '../../lib/cardClasses';
import { formatPrice } from '../../lib/format';
import { buildSrcSet } from '../../lib/responsiveImage';

type Props = {
  id: number;
  title: string;
  image?: string | null;
  price?: number;
  currency?: string;
  badge?: string;
  badgeColor?: 'brand' | 'success' | 'warning' | 'neutral';
  variant?: 'default' | 'compact';
  className?: string;
  wishlistSlot?: React.ReactNode;
};

const badgeColorMap: Record<string, string> = {
  brand: 'bg-brand/10 text-brand',
  success: 'bg-success-light text-success',
  warning: 'bg-warning-light text-warning',
  neutral: 'bg-neutral-100 text-neutral-700',
};

export function ProductCardReact({
  id,
  title,
  image,
  price,
  currency = 'JPY',
  badge,
  badgeColor = 'neutral',
  variant = 'default',
  className = '',
  wishlistSlot,
}: Props) {
  const isCompact = variant === 'compact';
  const outerClass = isCompact ? cardClasses.outerCompact : cardClasses.outer;
  const titleClass = isCompact ? cardClasses.titleCompact : cardClasses.title;
  const srcset = image ? buildSrcSet(image, 'thumbnail') : '';

  return (
    <div className={`group relative flex flex-col overflow-hidden ${outerClass} ${className}`}>
      {wishlistSlot && (
        <div className={cardClasses.wishlistButton}>
          {wishlistSlot}
        </div>
      )}
      <a href={`/products/${id}`} className="flex flex-col flex-1">
        <div className={cardClasses.imageWrap}>
          {image ? (
            <img
              src={image}
              srcSet={srcset}
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              alt={title}
              loading="lazy"
              decoding="async"
              className={cardClasses.image}
              style={{ viewTransitionName: `product-image-${id}` }}
            />
          ) : (
            <div className={cardClasses.imagePlaceholder} aria-hidden="true">
              <svg className="h-16 w-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
            </div>
          )}
        </div>
        <div className={cardClasses.content}>
          {badge && (
            <span className={`${cardClasses.badge} ${badgeColorMap[badgeColor]}`}>
              {badge}
            </span>
          )}
          <h3 className={titleClass}>{title}</h3>
          {price !== undefined && (
            <p className={cardClasses.price}>{formatPrice(price, currency)}</p>
          )}
        </div>
      </a>
    </div>
  );
}

export function ProductCardSkeletonReact({ className = '' }: { className?: string }) {
  return (
    <div className={`${cardClasses.skeleton.outer} overflow-hidden ${className}`}>
      <div className={cardClasses.skeleton.imageWrap} />
      <div className={cardClasses.skeleton.content}>
        <div className={cardClasses.skeleton.badge} />
        <div className={cardClasses.skeleton.title} />
        <div className={cardClasses.skeleton.price} />
      </div>
    </div>
  );
}
