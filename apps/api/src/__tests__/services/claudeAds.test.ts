import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateAdCopy } from '../../services/claudeAds';
import type { AdGenerateRequest, AdCandidate } from '../../types/ads';

// Mock the Claude client
vi.mock('../../services/ai/claudeClient', () => ({
  callClaudeAPIForJSON: vi.fn(),
}));

import { callClaudeAPIForJSON } from '../../services/ai/claudeClient';

const validCandidate: AdCandidate = {
  headlines: ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8', 'H9', 'H10'],
  descriptions: ['D1', 'D2', 'D3', 'D4'],
  suggestedKeywords: ['kw1', 'kw2'],
};

const baseRequest: AdGenerateRequest = {
  productName: 'LED Panel Light',
  productDescription: 'High-quality LED panel for office',
  targetAudience: 'Office managers',
  keywords: ['led', 'panel', 'office'],
  tone: 'professional',
  language: 'ja',
  adType: 'search',
  finalUrl: 'https://example.com/led-panel',
};

describe('claudeAds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateAdCopy', () => {
    it('should generate ad copy with valid candidates', async () => {
      (callClaudeAPIForJSON as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: {
          candidates: [validCandidate, validCandidate, validCandidate],
        },
        rawText: '{"candidates":[...]}',
        usage: { input_tokens: 500, output_tokens: 200, total_tokens: 700 },
      });

      const result = await generateAdCopy(baseRequest, 'sk-test');

      expect(result.candidates).toHaveLength(3);
      expect(result.promptUsed).toContain('LED Panel Light');
      expect(result.rawResponse).toBeDefined();
    });

    it('should include Japanese character limits for ja language', async () => {
      (callClaudeAPIForJSON as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { candidates: [validCandidate] },
        rawText: '',
        usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
      });

      const result = await generateAdCopy(baseRequest, 'sk-test');

      expect(result.promptUsed).toContain('15 characters max');
      expect(result.promptUsed).toContain('45 characters max');
    });

    it('should include English character limits for en language', async () => {
      const enRequest = { ...baseRequest, language: 'en' as const };

      (callClaudeAPIForJSON as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { candidates: [validCandidate] },
        rawText: '',
        usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
      });

      const result = await generateAdCopy(enRequest, 'sk-test');

      expect(result.promptUsed).toContain('30 characters max');
      expect(result.promptUsed).toContain('90 characters max');
    });

    it('should include all request fields in prompt', async () => {
      (callClaudeAPIForJSON as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { candidates: [validCandidate] },
        rawText: '',
        usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
      });

      const result = await generateAdCopy(baseRequest, 'sk-test');

      expect(result.promptUsed).toContain('LED Panel Light');
      expect(result.promptUsed).toContain('High-quality LED panel for office');
      expect(result.promptUsed).toContain('Office managers');
      expect(result.promptUsed).toContain('led, panel, office');
      expect(result.promptUsed).toContain('professional');
      expect(result.promptUsed).toContain('search');
      expect(result.promptUsed).toContain('https://example.com/led-panel');
    });

    it('should pass AI Gateway config', async () => {
      (callClaudeAPIForJSON as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { candidates: [validCandidate] },
        rawText: '',
        usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
      });

      await generateAdCopy(baseRequest, 'sk-test', {
        AI_GATEWAY_ACCOUNT_ID: 'acc-123',
        AI_GATEWAY_ID: 'gw-456',
      });

      const callArgs = (callClaudeAPIForJSON as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[2]).toEqual({
        AI_GATEWAY_ACCOUNT_ID: 'acc-123',
        AI_GATEWAY_ID: 'gw-456',
      });
    });

    it('should throw when candidates array is missing', async () => {
      (callClaudeAPIForJSON as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: {},
        rawText: '{}',
        usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
      });

      await expect(
        generateAdCopy(baseRequest, 'sk-test')
      ).rejects.toThrow('Invalid JSON structure: missing candidates array');
    });

    it('should throw when candidates array is empty', async () => {
      (callClaudeAPIForJSON as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { candidates: [] },
        rawText: '',
        usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
      });

      await expect(
        generateAdCopy(baseRequest, 'sk-test')
      ).rejects.toThrow('No candidates generated');
    });

    it('should throw when candidate missing headlines', async () => {
      (callClaudeAPIForJSON as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: {
          candidates: [
            { descriptions: ['D1'], suggestedKeywords: ['kw1'] },
          ],
        },
        rawText: '',
        usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
      });

      await expect(
        generateAdCopy(baseRequest, 'sk-test')
      ).rejects.toThrow('Candidate 1: missing headlines array');
    });

    it('should throw when candidate missing descriptions', async () => {
      (callClaudeAPIForJSON as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: {
          candidates: [
            { headlines: ['H1'], suggestedKeywords: ['kw1'] },
          ],
        },
        rawText: '',
        usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
      });

      await expect(
        generateAdCopy(baseRequest, 'sk-test')
      ).rejects.toThrow('Candidate 1: missing descriptions array');
    });

    it('should throw when candidate missing suggestedKeywords', async () => {
      (callClaudeAPIForJSON as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: {
          candidates: [
            { headlines: ['H1'], descriptions: ['D1'] },
          ],
        },
        rawText: '',
        usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
      });

      await expect(
        generateAdCopy(baseRequest, 'sk-test')
      ).rejects.toThrow('Candidate 1: missing suggestedKeywords array');
    });

    it('should validate all candidates in the array', async () => {
      (callClaudeAPIForJSON as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: {
          candidates: [
            validCandidate,
            { headlines: ['H1'], descriptions: ['D1'] }, // missing suggestedKeywords
          ],
        },
        rawText: '',
        usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
      });

      await expect(
        generateAdCopy(baseRequest, 'sk-test')
      ).rejects.toThrow('Candidate 2: missing suggestedKeywords array');
    });

    it('should request 3 candidate variations', async () => {
      (callClaudeAPIForJSON as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { candidates: [validCandidate, validCandidate, validCandidate] },
        rawText: '',
        usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
      });

      const result = await generateAdCopy(baseRequest, 'sk-test');

      expect(result.promptUsed).toContain('Generate exactly 3 variations');
    });

    it('should set max_tokens to 4096', async () => {
      (callClaudeAPIForJSON as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { candidates: [validCandidate] },
        rawText: '',
        usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
      });

      await generateAdCopy(baseRequest, 'sk-test');

      const callArgs = (callClaudeAPIForJSON as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].max_tokens).toBe(4096);
    });
  });
});
