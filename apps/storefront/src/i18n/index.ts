import translations from './ja.json';

export type TranslationKey = string;

// 翻訳を取得する関数（ドット記法のキーをサポート、パラメータ置換可能）
// 例: t('nav.store'), t('cart.addForFreeShipping', { amount: '¥5,000' })
export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  const keys = key.split('.');
  let value: unknown = translations;

  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = (value as Record<string, unknown>)[k];
    } else {
      return key;
    }
  }

  if (typeof value !== 'string') {
    return key;
  }

  // パラメータ置換（例: "送料無料まであと{amount}"）
  if (params) {
    return Object.entries(params).reduce(
      (str, [paramKey, paramValue]) => str.replace(`{${paramKey}}`, String(paramValue)),
      value
    );
  }

  return value;
}

// Reactコンポーネント用のカスタムフック
export function useTranslation() {
  return { t };
}

export { translations };
