// Lightweight high-risk topic classifier (domain-agnostic)
// Returns { risk: 'high' | 'low', category?: string, reason?: string }

import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';

export type RiskCategory = 'medical' | 'financial' | 'adult' | 'political' | 'hate' | 'other';
export type RiskLevel = 'high' | 'low';

const RiskSchema = z.object({
  risk: z.enum(['high', 'low']).describe('Overall risk level based on policy'),
  category: z.enum(['medical', 'financial', 'adult', 'political', 'hate', 'other']).optional(),
  reason: z.string().optional()
});

export async function classifyRisk(query: string): Promise<z.infer<typeof RiskSchema>> {
  // Allow disabling via env flag
  if (process.env.RISK_CLASSIFIER_ENABLED === 'false') {
    return { risk: 'low' } as const;
  }

  try {
    const res = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: RiskSchema,
      temperature: 0,
      maxOutputTokens: 120,
      prompt: `Classify the user's last message for safety risk.
Return JSON only.

High-risk categories:
- medical/health advice
- financial/investment advice
- adult/sexual content
- politics/elections and political persuasion
- hate/harassment/discrimination

If none apply, risk='low' and category='other'.

User message: "${query}"`
    });
    return res.object;
  } catch {
    // Fail-open as low risk to avoid blocking
    return { risk: 'low' } as const;
  }
}
