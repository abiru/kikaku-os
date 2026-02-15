import type { AdGenerateRequest, AdCandidate } from '../types/ads';
import { callClaudeAPIForJSON } from './ai/claudeClient';

const CANDIDATE_COUNT = 3;

/**
 * Build prompt for Claude API based on request parameters
 */
function buildPrompt(request: AdGenerateRequest): string {
  const { productName, productDescription, targetAudience, keywords, tone, language, adType, finalUrl } = request;

  const limits = language === 'ja'
    ? 'Headlines: 15 characters max, Descriptions: 45 characters max'
    : 'Headlines: 30 characters max, Descriptions: 90 characters max';

  return `You are a Google Ads copywriting expert. Generate ${CANDIDATE_COUNT} variations of ad copy for the following product.

Product Information:
- Name: ${productName}
- Description: ${productDescription}
- Target Audience: ${targetAudience}
- Keywords: ${keywords.join(', ')}
- Tone: ${tone}
- Language: ${language}
- Ad Type: ${adType}
- Landing Page: ${finalUrl}

Requirements:
- ${limits}
- Generate 10 headlines and 4 descriptions per variation
- Headlines should be compelling, concise, and include keywords naturally
- Descriptions should expand on value propositions
- Follow Google Ads policies: No misleading claims, excessive punctuation, or deceptive content
- Max 1 exclamation mark per headline
- Avoid consecutive special characters (!!!, ???, ★★★)

Output Format (strict JSON only, no markdown):
{
  "candidates": [
    {
      "headlines": ["headline1", "headline2", ..., "headline10"],
      "descriptions": ["desc1", "desc2", "desc3", "desc4"],
      "suggestedKeywords": ["keyword1", "keyword2", ...]
    }
  ]
}

Generate exactly ${CANDIDATE_COUNT} variations. Output ONLY valid JSON.`;
}

interface CandidatesResponse {
  candidates: AdCandidate[];
}

/**
 * Generate ad copy using Claude API via shared AI Gateway client
 */
export async function generateAdCopy(
  request: AdGenerateRequest,
  apiKey: string,
  env?: {
    AI_GATEWAY_ACCOUNT_ID?: string;
    AI_GATEWAY_ID?: string;
  }
): Promise<{
  candidates: AdCandidate[];
  promptUsed: string;
  rawResponse: string;
}> {
  const prompt = buildPrompt(request);

  const { data: parsed, rawText } = await callClaudeAPIForJSON<CandidatesResponse>(
    apiKey,
    {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4096,
    },
    env
  );

  // Validate structure
  if (!parsed.candidates || !Array.isArray(parsed.candidates)) {
    throw new Error('Invalid JSON structure: missing candidates array');
  }

  if (parsed.candidates.length === 0) {
    throw new Error('No candidates generated');
  }

  // Validate each candidate structure
  for (let i = 0; i < parsed.candidates.length; i++) {
    const candidate = parsed.candidates[i];
    if (!candidate) {
      throw new Error(`Candidate ${i + 1}: missing from response`);
    }
    if (!candidate.headlines || !Array.isArray(candidate.headlines)) {
      throw new Error(`Candidate ${i + 1}: missing headlines array`);
    }
    if (!candidate.descriptions || !Array.isArray(candidate.descriptions)) {
      throw new Error(`Candidate ${i + 1}: missing descriptions array`);
    }
    if (!candidate.suggestedKeywords || !Array.isArray(candidate.suggestedKeywords)) {
      throw new Error(`Candidate ${i + 1}: missing suggestedKeywords array`);
    }
  }

  return {
    candidates: parsed.candidates,
    promptUsed: prompt,
    rawResponse: rawText,
  };
}
