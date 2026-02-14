import type { AdGenerateRequest, AdCandidate } from '../types/ads';
import { extractJSON } from '../lib/json';

const CLAUDE_MODEL = 'claude-sonnet-4-5-20250929';
const MAX_RETRIES = 3;
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

/**
 * Generate ad copy using Claude API with retry logic
 */
export async function generateAdCopy(
  request: AdGenerateRequest,
  apiKey: string
): Promise<{
  candidates: AdCandidate[];
  promptUsed: string;
  rawResponse: string;
}> {
  if (!apiKey) {
    throw new Error('CLAUDE_API_KEY not configured');
  }

  let prompt = buildPrompt(request);
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 4096,
          messages: [
            { role: 'user', content: prompt }
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Claude API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json() as { content: Array<{ text: string }> };
      const rawText = data.content[0]?.text || '';

      // Extract JSON from potential markdown formatting
      const jsonText = extractJSON(rawText);

      // Parse JSON
      const parsed = JSON.parse(jsonText) as { candidates?: AdCandidate[] };

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
        promptUsed: buildPrompt(request), // Return original prompt
        rawResponse: rawText,
      };

    } catch (error) {
      console.error(`Claude API attempt ${attempt}/${MAX_RETRIES} failed:`, error);
      lastError = error as Error;

      if (attempt < MAX_RETRIES) {
        // Update prompt to emphasize JSON-only output
        prompt = `${buildPrompt(request)}\n\nIMPORTANT: Your previous response failed JSON parsing. Output ONLY valid JSON with no markdown formatting, no explanations, just the raw JSON object.`;

        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
      }
    }
  }

  throw new Error(`Failed to generate ad copy after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}
