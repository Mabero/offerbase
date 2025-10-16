/**
 * Centralized, deterministic language instruction builder.
 * No language lists or mappings. Avoids guessing specific names.
 */
export function pickLanguageInstruction(options: {
  preferredLanguage?: string | null;
  acceptLanguage?: string | null;
  lastUserText?: string | null;
}): string {
  const preferred = (options?.preferredLanguage || '').trim();
  const accept = (options?.acceptLanguage || '').trim();
  const last = (options?.lastUserText || '').trim();

  // Heuristic: consider the first/ambiguous turn when the text is short
  // or contains very few tokens. In that case we lean on site preference.
  const tokenCount = last ? last.split(/\s+/).filter(Boolean).length : 0;
  const ambiguous = !last || tokenCount <= 3 || last.length < 12;

  const parts: string[] = [];

  if (ambiguous && preferred) {
    // Site-first on first/ambiguous turn
    parts.push(`IMPORTANT: Use the site's preferred language for replies (code: ${preferred}).`);
    parts.push('If the user clearly writes in another language later, switch to that and keep it consistent.');
  } else {
    // User-first once the user signals a language
    parts.push("IMPORTANT: Respond in the same language as the user's last message.");
    if (preferred || accept) {
      const hints: string[] = [];
      if (preferred) hints.push(`site preference code: ${preferred}`);
      if (accept) hints.push(`Accept-Language: ${accept}`);
      parts.push(`If unclear, prefer (${hints.join('; ')}).`);
    } else {
      parts.push('If unclear, keep the current conversation language.');
    }
  }

  parts.push('Do not switch languages mid-conversation.');
  return `\n\n${parts.join(' ')}`;
}
