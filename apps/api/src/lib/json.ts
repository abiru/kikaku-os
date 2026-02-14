/**
 * Extract JSON from text, handling markdown code blocks.
 * Used by AI clients (Claude, Workers AI) to parse LLM responses.
 */
export function extractJSON(text: string): string {
  // Try to extract from markdown code blocks
  const jsonMatch =
    text.match(/```json\n?([\s\S]*?)\n?```/) ||
    text.match(/```\n?([\s\S]*?)\n?```/);

  if (jsonMatch) {
    return jsonMatch[1].trim();
  }

  // Try to find JSON object in text
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    return objectMatch[0];
  }

  // Return as-is if no code block or object found
  return text.trim();
}
