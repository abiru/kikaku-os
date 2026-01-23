import { describe, it, expect } from 'vitest';
import {
  validateCharacterCount,
  validateProhibitedPatterns,
  validateExclamationLimit,
  validateQuantityLimits,
  validateUrl,
  validateAdCopy,
} from './adValidation';

describe('adValidation', () => {
  describe('validateCharacterCount', () => {
    it('should pass for Japanese headline within limit', () => {
      const result = validateCharacterCount('テスト見出し', 'headline', 'ja');
      expect(result.valid).toBe(true);
      expect(result.length).toBe(6);
      expect(result.limit).toBe(15);
    });

    it('should fail for Japanese headline exceeding limit', () => {
      const result = validateCharacterCount('これは非常に長すぎる見出しテキスト', 'headline', 'ja');
      expect(result.valid).toBe(false);
      expect(result.length).toBeGreaterThan(15);
      expect(result.message).toContain('Exceeds 15 character limit');
    });

    it('should pass for English headline within limit', () => {
      const result = validateCharacterCount('Test Headline For Ads', 'headline', 'en');
      expect(result.valid).toBe(true);
      expect(result.length).toBe(21);
      expect(result.limit).toBe(30);
    });

    it('should fail for English headline exceeding limit', () => {
      const result = validateCharacterCount('This is a very long headline that exceeds the maximum limit', 'headline', 'en');
      expect(result.valid).toBe(false);
      expect(result.length).toBe(59);
      expect(result.message).toContain('Exceeds 30 character limit');
    });

    it('should pass for Japanese description within limit', () => {
      const result = validateCharacterCount('これは商品の説明文です。', 'description', 'ja');
      expect(result.valid).toBe(true);
      expect(result.length).toBe(12);
      expect(result.limit).toBe(45);
    });

    it('should fail for Japanese description exceeding limit', () => {
      const longDesc = 'これは非常に長い説明文で、制限を超えてしまう可能性があります。テストのために長く書いています。';
      const result = validateCharacterCount(longDesc, 'description', 'ja');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Exceeds 45 character limit');
    });

    it('should pass for English description within limit', () => {
      const result = validateCharacterCount('This is a product description that stays within the limit.', 'description', 'en');
      expect(result.valid).toBe(true);
      expect(result.length).toBe(58);
      expect(result.limit).toBe(90);
    });

    it('should fail for English description exceeding limit', () => {
      const longDesc = 'This is a very long description that will definitely exceed the maximum character limit for English descriptions in Google Ads.';
      const result = validateCharacterCount(longDesc, 'description', 'en');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Exceeds 90 character limit');
    });
  });

  describe('validateProhibitedPatterns', () => {
    it('should pass for clean text', () => {
      const result = validateProhibitedPatterns('This is clean text!');
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should fail for consecutive exclamation marks', () => {
      const result = validateProhibitedPatterns('Amazing!!!');
      expect(result.valid).toBe(false);
      expect(result.violations).toContain('Multiple consecutive exclamation marks (!!!) not allowed');
    });

    it('should fail for consecutive question marks', () => {
      const result = validateProhibitedPatterns('Really???');
      expect(result.valid).toBe(false);
      expect(result.violations).toContain('Multiple consecutive question marks (???) not allowed');
    });

    it('should fail for consecutive stars', () => {
      const result = validateProhibitedPatterns('Special★★★');
      expect(result.valid).toBe(false);
      expect(result.violations).toContain('Multiple consecutive stars (★★★) not allowed');
    });

    it('should fail for mixed consecutive special chars', () => {
      const result = validateProhibitedPatterns('Wow!!??');
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it('should detect multiple violations', () => {
      const result = validateProhibitedPatterns('Amazing!!! Really???');
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(1);
    });
  });

  describe('validateExclamationLimit', () => {
    it('should pass for no exclamation marks', () => {
      const result = validateExclamationLimit('Clean headline');
      expect(result.valid).toBe(true);
      expect(result.count).toBe(0);
    });

    it('should pass for one exclamation mark', () => {
      const result = validateExclamationLimit('Great deal!');
      expect(result.valid).toBe(true);
      expect(result.count).toBe(1);
    });

    it('should fail for two exclamation marks', () => {
      const result = validateExclamationLimit('Great! Amazing!');
      expect(result.valid).toBe(false);
      expect(result.count).toBe(2);
      expect(result.message).toContain('Too many exclamation marks (2)');
    });

    it('should fail for multiple exclamation marks', () => {
      const result = validateExclamationLimit('Wow! Great! Amazing!');
      expect(result.valid).toBe(false);
      expect(result.count).toBe(3);
    });
  });

  describe('validateQuantityLimits', () => {
    it('should pass for valid quantities', () => {
      const headlines = ['Headline 1', 'Headline 2', 'Headline 3'];
      const descriptions = ['Description 1', 'Description 2'];
      const result = validateQuantityLimits(headlines, descriptions);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail for too many headlines', () => {
      const headlines = Array(16).fill('Headline');
      const descriptions = ['Description'];
      const result = validateQuantityLimits(headlines, descriptions);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Too many headlines (16). Max 15.');
    });

    it('should fail for too many descriptions', () => {
      const headlines = ['Headline'];
      const descriptions = Array(5).fill('Description');
      const result = validateQuantityLimits(headlines, descriptions);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Too many descriptions (5). Max 4.');
    });

    it('should fail for no headlines', () => {
      const headlines: string[] = [];
      const descriptions = ['Description'];
      const result = validateQuantityLimits(headlines, descriptions);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least 1 headline required.');
    });

    it('should fail for no descriptions', () => {
      const headlines = ['Headline'];
      const descriptions: string[] = [];
      const result = validateQuantityLimits(headlines, descriptions);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least 1 description required.');
    });

    it('should detect multiple errors', () => {
      const headlines: string[] = [];
      const descriptions: string[] = [];
      const result = validateQuantityLimits(headlines, descriptions);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(2);
    });
  });

  describe('validateUrl', () => {
    it('should pass for valid HTTPS URL', () => {
      const result = validateUrl('https://example.com/product');
      expect(result.valid).toBe(true);
    });

    it('should pass for valid HTTP URL', () => {
      const result = validateUrl('http://example.com');
      expect(result.valid).toBe(true);
    });

    it('should fail for invalid URL format', () => {
      const result = validateUrl('not-a-url');
      expect(result.valid).toBe(false);
      expect(result.message).toBe('Invalid URL format');
    });

    it('should fail for non-http protocol', () => {
      const result = validateUrl('ftp://example.com');
      expect(result.valid).toBe(false);
      expect(result.message).toBe('URL must use http or https protocol');
    });
  });

  describe('validateAdCopy', () => {
    it('should pass for valid Japanese ad', () => {
      const headlines = ['見出し1', '見出し2', '見出し3'];
      const descriptions = ['説明文1', '説明文2'];
      const finalUrl = 'https://example.com';
      const result = validateAdCopy(headlines, descriptions, finalUrl, 'ja');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should pass for valid English ad', () => {
      const headlines = ['Headline 1', 'Headline 2', 'Headline 3'];
      const descriptions = ['Description 1', 'Description 2'];
      const finalUrl = 'https://example.com';
      const result = validateAdCopy(headlines, descriptions, finalUrl, 'en');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail for Japanese headline exceeding character limit', () => {
      const headlines = ['これは非常に長すぎる見出しテキスト'];
      const descriptions = ['説明文'];
      const finalUrl = 'https://example.com';
      const result = validateAdCopy(headlines, descriptions, finalUrl, 'ja');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Exceeds 15 character limit'))).toBe(true);
    });

    it('should fail for prohibited patterns', () => {
      const headlines = ['Amazing!!!'];
      const descriptions = ['Great product'];
      const finalUrl = 'https://example.com';
      const result = validateAdCopy(headlines, descriptions, finalUrl, 'en');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('exclamation marks'))).toBe(true);
    });

    it('should warn for multiple exclamations in headline', () => {
      const headlines = ['Great! Amazing!'];
      const descriptions = ['Description'];
      const finalUrl = 'https://example.com';
      const result = validateAdCopy(headlines, descriptions, finalUrl, 'en');
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some((w) => w.includes('Too many exclamation marks'))).toBe(true);
    });

    it('should fail for invalid URL', () => {
      const headlines = ['Headline'];
      const descriptions = ['Description'];
      const finalUrl = 'not-a-url';
      const result = validateAdCopy(headlines, descriptions, finalUrl, 'en');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid URL'))).toBe(true);
    });

    it('should fail for too many headlines', () => {
      const headlines = Array(16).fill('Headline');
      const descriptions = ['Description'];
      const finalUrl = 'https://example.com';
      const result = validateAdCopy(headlines, descriptions, finalUrl, 'en');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Too many headlines'))).toBe(true);
    });

    it('should detect multiple errors', () => {
      const headlines = ['これは長すぎる見出しです', 'Amazing!!!'];
      const descriptions: string[] = [];
      const finalUrl = 'not-a-url';
      const result = validateAdCopy(headlines, descriptions, finalUrl, 'ja');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });
});
