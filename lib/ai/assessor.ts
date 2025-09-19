// Soft-inference assessor: decides whether a cautious, qualified answer is reasonable
// Works across domains; never invents specific facts.

import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';

export interface AssessorInputChunk {
  title: string;
  excerpt: string;
}

export interface AssessorPayload {
  query: string;
  contextTerms: string[];
  offerAnchor?: { brand?: string; model?: string; title?: string } | null;
  chunks: AssessorInputChunk[];
}

export const AssessorSchema = z.object({
  confidence: z.enum(['high', 'medium', 'low']).describe('Confidence that a cautious inference is appropriate'),
  safe_inference: z.boolean().describe('True only if a cautious inference is considered safe and reasonable'),
  reason: z.string().optional()
});

export async function assessSoftInference(payload: AssessorPayload) {
  try {
    const { query, contextTerms, offerAnchor, chunks } = payload;
    const chunkText = chunks.map((c, i) => `${i + 1}. ${c.title}: ${c.excerpt}`).join('\n');
    const terms = contextTerms.join(', ');
    const anchor = offerAnchor ? `${offerAnchor.brand || ''} ${offerAnchor.model || ''} ${offerAnchor.title || ''}`.trim() : '';

    const res = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: AssessorSchema,
      temperature: 0.1,
      maxOutputTokens: 140,
      prompt: `You are a cautious assessor for a retrieval-augmented chat system.
Decide if a cautious, qualified answer is reasonable without inventing facts.

Rules:
- Do NOT assume specifics not supported by the texts.
- If the question asks about applicability to a similar context and the texts provide general principles, safe_inference can be true with medium confidence.
- If safety/health/financial risk is implied, set safe_inference=false.
- Output only the JSON object.

User query: ${query}
Context terms (recent): ${terms || 'none'}
Offer anchor: ${anchor || 'none'}
Top texts (title: excerpt):
${chunkText || 'none'}
`
    });
    return res.object;
  } catch {
    return { confidence: 'low', safe_inference: false, reason: 'assessor_error' } as const;
  }
}
