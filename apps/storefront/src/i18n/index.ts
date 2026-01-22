import translations from './ja.json';

export type TranslationKey = string;

/**
 * 翻訳を取得する関数
 * @param key - ドット記法のキー (例: "nav.store", "cart.title")
 * @param params - 動的な値を置換するためのパラメータ（オプション）
 * @returns 翻訳されたテキスト
 */
export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  const keys = key.split('.');
  let value: unknown = translations;

  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = (value as Record<string, unknown>)[k];
    } else {
      console.warn(`Translation key not found: ${key}`);
      return key;
    }
  }

  if (typeof value !== 'string') {
    console.warn(`Translation value is not a string: ${key}`);
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

/**
 * Reactコンポーネント用のカスタムフック
 * @returns t関数を含むオブジェクト
 */
export function useTranslation() {
  return { t };
}

export { translations };
