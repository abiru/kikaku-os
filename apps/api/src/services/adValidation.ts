import type { Language, CharCountResult, ValidationResult } from '../types/ads';

// Character limits for Google Ads
const LIMITS = {
  ja: { headline: 15, description: 45 },
  en: { headline: 30, description: 90 },
};

// Prohibited patterns with regex and messages
const PROHIBITED_PATTERNS = [
  { regex: /!{2,}/g, message: 'Multiple consecutive exclamation marks (!!!) not allowed' },
  { regex: /\?{2,}/g, message: 'Multiple consecutive question marks (???) not allowed' },
  { regex: /★{2,}/g, message: 'Multiple consecutive stars (★★★) not allowed' },
  { regex: /[!?★]{3,}/g, message: 'Three or more consecutive special characters not allowed' },
];

/**
 * Validate character count for a headline or description
 */
export function validateCharacterCount(
  text: string,
  type: 'headline' | 'description',
  language: Language
): CharCountResult {
  const limit = LIMITS[language as keyof typeof LIMITS][type];
  const length = text.length;

  if (length > limit) {
    return {
      valid: false,
      length,
      limit,
      message: `Exceeds ${limit} character limit (${length} chars)`,
    };
  }

  return { valid: true, length, limit };
}

/**
 * Validate prohibited patterns in text
 */
export function validateProhibitedPatterns(text: string): {
  valid: boolean;
  violations: string[];
} {
  const violations: string[] = [];

  for (const { regex, message } of PROHIBITED_PATTERNS) {
    if (regex.test(text)) {
      violations.push(message);
    }
  }

  return { valid: violations.length === 0, violations };
}

/**
 * Validate exclamation mark limit (max 1 per headline)
 */
export function validateExclamationLimit(headline: string): {
  valid: boolean;
  count: number;
  message?: string;
} {
  const count = (headline.match(/!/g) || []).length;

  if (count > 1) {
    return {
      valid: false,
      count,
      message: `Too many exclamation marks (${count}). Max 1 per headline.`,
    };
  }

  return { valid: true, count };
}

/**
 * Validate quantity limits (headlines: max 15, descriptions: max 4)
 */
export function validateQuantityLimits(
  headlines: string[],
  descriptions: string[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (headlines.length > 15) {
    errors.push(`Too many headlines (${headlines.length}). Max 15.`);
  }

  if (descriptions.length > 4) {
    errors.push(`Too many descriptions (${descriptions.length}). Max 4.`);
  }

  if (headlines.length === 0) {
    errors.push('At least 1 headline required.');
  }

  if (descriptions.length === 0) {
    errors.push('At least 1 description required.');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate URL format
 */
export function validateUrl(url: string): { valid: boolean; message?: string } {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, message: 'URL must use http or https protocol' };
    }
    return { valid: true };
  } catch {
    return { valid: false, message: 'Invalid URL format' };
  }
}

/**
 * Comprehensive validation for ad copy
 */
export function validateAdCopy(
  headlines: string[],
  descriptions: string[],
  finalUrl: string,
  language: Language
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Quantity limits
  const quantityResult = validateQuantityLimits(headlines, descriptions);
  if (!quantityResult.valid) {
    errors.push(...quantityResult.errors);
  }

  // URL validation
  const urlResult = validateUrl(finalUrl);
  if (!urlResult.valid) {
    errors.push(urlResult.message || 'Invalid URL');
  }

  // Validate each headline
  headlines.forEach((headline, index) => {
    // Character count
    const charResult = validateCharacterCount(headline, 'headline', language);
    if (!charResult.valid) {
      errors.push(`Headline ${index + 1}: ${charResult.message}`);
    }

    // Prohibited patterns
    const patternResult = validateProhibitedPatterns(headline);
    if (!patternResult.valid) {
      errors.push(`Headline ${index + 1}: ${patternResult.violations.join(', ')}`);
    }

    // Exclamation limit
    const exclamationResult = validateExclamationLimit(headline);
    if (!exclamationResult.valid) {
      warnings.push(`Headline ${index + 1}: ${exclamationResult.message}`);
    }
  });

  // Validate each description
  descriptions.forEach((description, index) => {
    // Character count
    const charResult = validateCharacterCount(description, 'description', language);
    if (!charResult.valid) {
      errors.push(`Description ${index + 1}: ${charResult.message}`);
    }

    // Prohibited patterns
    const patternResult = validateProhibitedPatterns(description);
    if (!patternResult.valid) {
      errors.push(`Description ${index + 1}: ${patternResult.violations.join(', ')}`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
