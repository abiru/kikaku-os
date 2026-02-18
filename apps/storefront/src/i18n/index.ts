import jaTranslations from './ja.json';
import enTranslations from './en.json';

export type Locale = 'ja' | 'en';
export type TranslationKey = string;

const STORAGE_KEY = 'kikaku-locale';

const translationMap: Record<Locale, Record<string, unknown>> = {
  ja: jaTranslations as Record<string, unknown>,
  en: enTranslations as Record<string, unknown>,
};

/**
 * Detect the user's preferred locale.
 * Priority: localStorage > navigator.language > 'ja'
 * Admin routes always return 'ja'.
 */
export function getLocale(): Locale {
  // Server-side: default to 'ja'
  if (typeof window === 'undefined') {
    return 'ja';
  }

  // Admin routes: always Japanese
  try {
    if (window.location?.pathname?.startsWith('/admin')) {
      return 'ja';
    }
  } catch {
    // location not available
  }

  // 1. Check localStorage for saved preference
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'ja') {
      return saved;
    }
  } catch {
    // localStorage not available (SSR, privacy mode, etc.)
  }

  // 2. Check browser language
  try {
    const browserLang = navigator.language.toLowerCase();
    if (browserLang.startsWith('en')) {
      return 'en';
    }
  } catch {
    // navigator not available
  }

  // 3. Default to Japanese
  return 'ja';
}

/**
 * Save the user's locale preference to localStorage.
 */
export function setLocale(locale: Locale): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // localStorage not available
  }
}

/**
 * Get the current translations object based on locale.
 */
function getTranslations(): Record<string, unknown> {
  const locale = getLocale();
  return translationMap[locale];
}

// 翻訳を取得する関数（ドット記法のキーをサポート、パラメータ置換可能）
// 例: t('nav.store'), t('cart.addForFreeShipping', { amount: '¥5,000' })
export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  const keys = key.split('.');
  let value: unknown = getTranslations();

  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = (value as Record<string, unknown>)[k];
    } else {
      if (import.meta.env.DEV) {
        console.warn(`[i18n] Missing translation key: "${key}"`);
      }
      return '';
    }
  }

  if (typeof value !== 'string') {
    if (import.meta.env.DEV) {
      console.warn(`[i18n] Translation key "${key}" is not a string`);
    }
    return '';
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
  return { t, getLocale, setLocale };
}

// Export for backwards compatibility
export const translations = jaTranslations;
