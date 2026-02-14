import { Badge } from './catalyst/badge';
import { useTranslation } from '../i18n';
import { formatPrice, formatDate } from '../lib/format';

type OrderItem = {
  title: string;
  quantity: number;
  unit_price: number;
};

type Fulfillment = {
  id: number;
  status: string;
  tracking_number: string | null;
  carrier: string | null;
  created_at: string;
  updated_at: string;
};

type ShippingAddress = {
  name?: string;
  phone?: string;
  address?: {
    postal_code?: string;
    state?: string;
    city?: string;
    line1?: string;
    line2?: string;
  };
};

type Order = {
  id: number;
  status: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  shipping_fee: number;
  total_discount: number;
  currency: string;
  created_at: string;
  paid_at: string | null;
  customer_email: string | null;
  shipping: ShippingAddress | null;
  fulfillments: Fulfillment[];
  items: OrderItem[];
};

type Props = {
  order: Order;
};

const dateTimeLongOpts: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

type StepStatus = 'completed' | 'current' | 'upcoming';

type Step = {
  label: string;
  status: StepStatus;
};

const getOrderSteps = (order: Order, t: (key: string) => string): Step[] => {
  const hasFulfillment = order.fulfillments.length > 0;
  const isShipped = hasFulfillment && order.fulfillments.some(f => f.status === 'shipped');
  const isPreparing = hasFulfillment && !isShipped;
  const isPaid = order.status === 'paid' || order.paid_at !== null;

  if (isShipped) {
    return [
      { label: t('orderTracking.stepReceived'), status: 'completed' },
      { label: t('orderTracking.stepPaid'), status: 'completed' },
      { label: t('orderTracking.stepPreparing'), status: 'completed' },
      { label: t('orderTracking.stepShipped'), status: 'current' },
    ];
  }

  if (isPreparing) {
    return [
      { label: t('orderTracking.stepReceived'), status: 'completed' },
      { label: t('orderTracking.stepPaid'), status: 'completed' },
      { label: t('orderTracking.stepPreparing'), status: 'current' },
      { label: t('orderTracking.stepShipped'), status: 'upcoming' },
    ];
  }

  if (isPaid) {
    return [
      { label: t('orderTracking.stepReceived'), status: 'completed' },
      { label: t('orderTracking.stepPaid'), status: 'current' },
      { label: t('orderTracking.stepPreparing'), status: 'upcoming' },
      { label: t('orderTracking.stepShipped'), status: 'upcoming' },
    ];
  }

  return [
    { label: t('orderTracking.stepReceived'), status: 'current' },
    { label: t('orderTracking.stepPaid'), status: 'upcoming' },
    { label: t('orderTracking.stepPreparing'), status: 'upcoming' },
    { label: t('orderTracking.stepShipped'), status: 'upcoming' },
  ];
};

const getStatusBadge = (status: string, t: (key: string) => string): { label: string; color: 'green' | 'yellow' | 'blue' | 'red' | 'zinc' } => {
  switch (status) {
    case 'paid':
      return { label: t('orderTracking.paid'), color: 'green' };
    case 'fulfilled':
      return { label: t('orderTracking.fulfilled'), color: 'blue' };
    case 'refunded':
      return { label: t('orderTracking.refunded'), color: 'red' };
    case 'pending':
    default:
      return { label: t('orderTracking.pending'), color: 'yellow' };
  }
};

function OrderSteps({ steps }: { steps: Step[] }) {
  return (
    <nav aria-label="Progress">
      <ol className="flex items-center justify-between">
        {steps.map((step, index) => (
          <li key={step.label} className="relative flex flex-1 items-center">
            {index > 0 && (
              <div
                className={`absolute left-0 right-1/2 top-4 h-0.5 -translate-x-1/2 ${
                  step.status === 'completed' || step.status === 'current'
                    ? 'bg-indigo-600'
                    : 'bg-gray-200'
                }`}
                style={{ left: '-50%', right: '50%', width: '100%' }}
              />
            )}
            <div className="relative flex flex-col items-center gap-2">
              {step.status === 'completed' ? (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600">
                  <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              ) : step.status === 'current' ? (
                <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-indigo-600 bg-white">
                  <div className="h-3 w-3 rounded-full bg-indigo-600" />
                </div>
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-gray-200 bg-white">
                  <div className="h-3 w-3 rounded-full bg-gray-200" />
                </div>
              )}
              <span className={`text-xs font-medium text-center whitespace-nowrap ${
                step.status === 'upcoming' ? 'text-gray-400' : 'text-gray-900'
              }`}>
                {step.label}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </nav>
  );
}

const getTrackingUrl = (carrier: string | null, trackingNumber: string): string | null => {
  if (!carrier || !trackingNumber) return null;
  switch (carrier) {
    case 'ヤマト運輸':
      return `https://toi.kuronekoyamato.co.jp/cgi-bin/tneko?number=${encodeURIComponent(trackingNumber)}`;
    case '佐川急便':
      return `https://k2k.sagawa-exp.co.jp/p/web/okurijosearch.do?okurijoNo=${encodeURIComponent(trackingNumber)}`;
    case '日本郵便':
      return `https://trackings.post.japanpost.jp/services/srv/search/?requestNo1=${encodeURIComponent(trackingNumber)}`;
    default:
      return null;
  }
};

function FulfillmentInfo({ fulfillment, t }: { fulfillment: Fulfillment; t: (key: string) => string }) {
  const trackingUrl = getTrackingUrl(fulfillment.carrier, fulfillment.tracking_number || '');

  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
      <div className="flex items-center gap-2 mb-3">
        <svg className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
        </svg>
        <span className="text-sm font-medium text-gray-900">
          {t('orderTracking.stepShipped')}
        </span>
      </div>
      <div className="space-y-2 text-sm">
        {fulfillment.carrier && (
          <div className="flex justify-between">
            <span className="text-gray-500">{t('orderTracking.carrier')}</span>
            <span className="text-gray-900">{fulfillment.carrier}</span>
          </div>
        )}
        {fulfillment.tracking_number && (
          <div className="flex justify-between">
            <span className="text-gray-500">{t('orderTracking.trackingNumber')}</span>
            <span className="font-mono text-gray-900">{fulfillment.tracking_number}</span>
          </div>
        )}
        {trackingUrl && (
          <div className="pt-2">
            <a
              href={trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-indigo-600 hover:text-indigo-500 font-medium"
            >
              {t('orderTracking.trackTracking')}
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export default function OrderTracking({ order }: Props) {
  const { t } = useTranslation();
  const steps = getOrderSteps(order, t);
  const statusBadge = getStatusBadge(order.status, t);
  const shippedFulfillment = order.fulfillments.find(f => f.status === 'shipped');

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="rounded-3xl bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
              {t('orderTracking.title')}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {t('orderTracking.orderNumber')}: #{order.id}
            </p>
          </div>
          <Badge color={statusBadge.color}>{statusBadge.label}</Badge>
        </div>

        <div className="mt-2 text-sm text-gray-500">
          {t('orderTracking.orderDate')}: {formatDate(order.created_at, dateTimeLongOpts)}
        </div>

        {/* Status Steps */}
        <div className="mt-8">
          <OrderSteps steps={steps} />
        </div>
      </div>

      {/* Fulfillment / Tracking Info */}
      {shippedFulfillment && (
        <div className="rounded-3xl bg-white p-6 shadow-sm sm:p-8">
          <FulfillmentInfo fulfillment={shippedFulfillment} t={t} />
        </div>
      )}

      {/* Order Items */}
      <div className="rounded-3xl bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {t('orderTracking.items')}
        </h2>
        <div className="divide-y divide-gray-100">
          {order.items.map((item, index) => (
            <div key={index} className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
              <div>
                <p className="font-medium text-gray-900">{item.title}</p>
                <p className="text-sm text-gray-500">
                  {t('orderTracking.quantity')}: {item.quantity}
                </p>
              </div>
              <p className="font-medium text-gray-900">
                {formatPrice(item.unit_price * item.quantity, order.currency)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Price Breakdown */}
      <div className="rounded-3xl bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {t('orderTracking.priceBreakdown')}
        </h2>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">{t('orderTracking.subtotal')}</span>
            <span className="text-gray-900">{formatPrice(order.subtotal, order.currency)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">{t('orderTracking.tax')}</span>
            <span className="text-gray-900">{formatPrice(order.tax_amount, order.currency)}</span>
          </div>
          {order.total_discount > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-500">{t('orderTracking.discount')}</span>
              <span className="text-red-600">-{formatPrice(order.total_discount, order.currency)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-500">{t('orderTracking.shipping')}</span>
            <span className="text-gray-900">
              {order.shipping_fee > 0
                ? formatPrice(order.shipping_fee, order.currency)
                : t('orderTracking.free')}
            </span>
          </div>
          <div className="flex justify-between border-t border-gray-100 pt-3 text-base font-semibold">
            <span className="text-gray-900">{t('orderTracking.total')}</span>
            <span className="text-gray-900">{formatPrice(order.total_amount, order.currency)}</span>
          </div>
        </div>
      </div>

      {/* Shipping Address & Contact */}
      {(order.shipping || order.customer_email) && (
        <div className="rounded-3xl bg-white p-6 shadow-sm sm:p-8">
          {order.shipping && (
            <div className="mb-6 last:mb-0">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">
                {t('orderTracking.shippingAddress')}
              </h2>
              <div className="text-sm text-gray-600 space-y-1">
                {order.shipping.name && <p className="font-medium text-gray-900">{order.shipping.name}</p>}
                {order.shipping.address && (
                  <>
                    {order.shipping.address.postal_code && <p>{'\u3012'}{order.shipping.address.postal_code}</p>}
                    {order.shipping.address.state && order.shipping.address.city && (
                      <p>{order.shipping.address.state}{order.shipping.address.city}</p>
                    )}
                    {order.shipping.address.line1 && <p>{order.shipping.address.line1}</p>}
                    {order.shipping.address.line2 && <p>{order.shipping.address.line2}</p>}
                  </>
                )}
                {order.shipping.phone && (
                  <p className="mt-2">
                    <span className="text-gray-500">{t('orderTracking.phone')}: </span>
                    {order.shipping.phone}
                  </p>
                )}
              </div>
            </div>
          )}

          {order.customer_email && (
            <div className={order.shipping ? 'border-t border-gray-100 pt-4' : ''}>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{t('orderTracking.email')}</span>
                <span className="text-gray-900">{order.customer_email}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
