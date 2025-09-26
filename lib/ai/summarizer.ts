import OpenAI from 'openai';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { analyzeContentIntelligence, ContentType, StructuredData } from './content-intelligence';

interface SummarizationResult {
  summary: string;
  keyPoints: string[];
  contentType: ContentType;
  structuredData: StructuredData;
  intentKeywords: string[];
  primaryProducts: string[];
  confidenceScore: number;
  productInfo?: {
    name?: string;
    price?: string;
    features?: string[];
    benefits?: string[];
  };
  // New fields derived by LLM specifically for domain guard
  subjects?: string[];       // multi-word topics (stored in intent_keywords)
  brandTerms?: string[];     // single-word brands (stored in structured_data.brand_terms)
  modelCodes?: string[];     // alphanumeric model codes (stored in structured_data.model_codes)
  category?: string;         // coarse category (stored in structured_data.category)
  keywords?: string[];       // single-word domain nouns/brands to supplement subjects
}

/**
 * Summarize training material content using AI
 */
export async function summarizeTrainingMaterial(
  content: string,
  title: string,
  metadata?: Record<string, unknown>
): Promise<SummarizationResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  // First, analyze the content intelligence
  const contentAnalysis = analyzeContentIntelligence(title, content, metadata);

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Create content-type specific system prompt, extended to extract guard subjects
  const systemPrompt = createContentAwareSystemPrompt(contentAnalysis.contentType);

  // Include structured data context if available
  const structuredDataContext = Object.keys(contentAnalysis.structuredData).length > 0 
    ? `\n\nPre-analyzed structured data: ${JSON.stringify(contentAnalysis.structuredData, null, 2)}`
    : '';

  const userPrompt = `Title: ${title}

Content Type: ${contentAnalysis.contentType}

Content (sampled):
${content.substring(0, 6000)}${content.length > 6000 ? '...' : ''}

${structuredDataContext}

${metadata ? `Additional metadata: ${JSON.stringify(metadata)}` : ''}

Return JSON with keys:
- summary: string
- keyPoints: string[] (3-7)
- subjects: string[] (3-6 concise multi-word topics; include single-word domain nouns if they are core topics like "nettsidebygger"; no dates, months, years, or generic words like best/beste/price/pris/guide/bruk/review/anmeldelse)
- brandTerms: string[] (single tokens like brand names; 0-6)
- modelCodes: string[] (alphanumeric codes like g4/g3, etc; 0-6)
- primaryProducts: string[] (2-6 multi-word product/service names if present)
- category: string (one coarse topic)
- keywords: string[] (up to 15 single-word subject keywords: domains/brands; exclude generic words, dates, months, numbers)
`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2, // Lower temperature for more consistent summaries
      max_tokens: 1000, // Increased for more detailed summaries
      response_format: { type: "json_object" }
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      throw new Error('No response from OpenAI');
    }

    const parsed = JSON.parse(response);

    // Post-clean terms (language-agnostic minimal filters)
    const clean = (arr: unknown): string[] => Array.isArray(arr)
      ? Array.from(new Set(
          (arr as string[])
            .map((s) => (typeof s === 'string' ? s.trim() : ''))
            .filter(Boolean)
            .map((s) => s.replace(/\s+/g, ' ').trim())
            .filter((s) => s.length >= 2)
            .filter((s) => !/^(19|20)\d{2}$/.test(s))
            .filter((s) => !/^\d+$/.test(s))
        ))
      : [];

    const subjects = clean(parsed.subjects);
    const brandTerms = clean(parsed.brandTerms).filter((t) => !t.includes(' '));
    const modelCodes = clean(parsed.modelCodes);
    const primaryProducts = clean(parsed.primaryProducts).filter((t) => t.includes(' '));
    const category = typeof parsed.category === 'string' ? parsed.category.trim() : '';
    const keywords = clean(parsed.keywords).filter((t) => !t.includes(' '));

    return {
      summary: parsed.summary || '',
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
      contentType: contentAnalysis.contentType,
      structuredData: contentAnalysis.structuredData,
      intentKeywords: Array.from(new Set([...(subjects || []), ...(keywords || [])])).filter(Boolean),
      primaryProducts: primaryProducts.length ? primaryProducts : contentAnalysis.primaryProducts,
      confidenceScore: contentAnalysis.confidenceScore,
      productInfo: parsed.productInfo,
      subjects,
      brandTerms,
      modelCodes,
      category,
      keywords
    };
  } catch (error) {
    console.error('Error summarizing content:', error);
    // Return a basic summary with content analysis if AI fails
    return {
      summary: title || 'Product information',
      keyPoints: ['Product details available', 'Contact for more information'],
      contentType: contentAnalysis.contentType,
      structuredData: contentAnalysis.structuredData,
      intentKeywords: contentAnalysis.intentKeywords,
      primaryProducts: contentAnalysis.primaryProducts,
      confidenceScore: contentAnalysis.confidenceScore,
    };
  }
}

/**
 * Create content-type specific system prompts
 */
function createContentAwareSystemPrompt(contentType: ContentType): string {
  const basePrompt = `You are an expert at extracting key information from various types of content. 
IMPORTANT: Extract information in the same language as the source content. If the content is in Norwegian, respond in Norwegian.

Your task is to create concise summaries that preserve the most important context and decision-making information.

CRUCIAL for subjects extraction:
- Ignore boilerplate (disclaimer, guarantees, cookie banners, privacy, updated dates), navigation, and promotional claims.
- Ignore generic evaluatives (best/beste/top/topp, review/anmeldelse, price/pris, guide/bruk, ranking/rangering, alternatives/alternativer).
- Ignore dates, months, years, and pure numbers.
- Subjects must be concise domain concepts (prefer multi‑word phrases).`;

  const typeSpecificPrompts: Record<ContentType, string> = {
    ranking: `
${basePrompt}

CONTENT TYPE: RANKING/TOP LIST
Focus on:
1. Preserve the ranking order and WHY each item is ranked where it is
2. Clearly identify the #1/best choice and the reasoning behind it
3. Extract scoring criteria or evaluation methods used
4. Capture key differentiators between ranked items
5. Include any "Editor's Choice", "Best Overall", or similar designations

Create:
- summary: Brief overview mentioning this is a ranking with X items, highlighting the top choice
- keyPoints: 3-7 bullet points preserving rank order and key reasons (e.g., "#1: Product X - reason", "#2: Product Y - reason")
- Include winner information and ranking methodology if mentioned

Critical: If the content declares a "best" or "#1" product, this MUST be clearly stated in both summary and keyPoints.`,

    comparison: `
${basePrompt}

CONTENT TYPE: COMPARISON
Focus on:
1. Identify what products/services are being compared
2. Preserve the conclusion or winner if stated
3. Capture key differentiating factors and trade-offs
4. Include pros/cons if mentioned
5. Note recommendation context (e.g., "best for beginners", "best for enterprise")

Create:
- summary: Overview of what's being compared and the conclusion/winner
- keyPoints: Key differences, winner declaration, and context for recommendations`,

    product_page: `
${basePrompt}

CONTENT TYPE: PRODUCT PAGE
Focus on:
1. Core product value proposition
2. Key features and benefits
3. Pricing information
4. Target audience/use cases
5. Unique selling points

Create:
- summary: Clear value proposition and what the product does
- keyPoints: Main features, benefits, pricing, and target users`,

    review: `
${basePrompt}

CONTENT TYPE: REVIEW
Focus on:
1. Overall verdict and rating/score
2. Key strengths and weaknesses identified
3. Reviewer's recommendation and context
4. Who this product is best/worst for
5. Value assessment

Create:
- summary: Review verdict and overall assessment
- keyPoints: Rating, pros/cons, recommendation, and target users`,

    service: `
${basePrompt}

CONTENT TYPE: SERVICE DESCRIPTION
Focus on:
1. What the service does and key benefits
2. Target customers and use cases
3. Service tiers or plans if mentioned
4. Unique advantages or differentiators
5. Pricing structure if available

Create:
- summary: Service overview and main value proposition
- keyPoints: Key benefits, target users, plans/pricing, differentiators`,

    tutorial: `
${basePrompt}

CONTENT TYPE: TUTORIAL/GUIDE
Focus on:
1. What the tutorial teaches
2. Prerequisites or target skill level
3. Key steps or concepts covered
4. Tools or products mentioned
5. Expected outcomes

Create:
- summary: What users will learn and achieve
- keyPoints: Key concepts, tools used, target audience, main steps`,

    general: `
${basePrompt}

CONTENT TYPE: GENERAL
Focus on:
1. Main topic and key information
2. Important facts or insights
3. Any products or services mentioned
4. Target audience or context
5. Key takeaways

Create:
- summary: Main topic and primary value/information
- keyPoints: Key facts, insights, and takeaways`
  };

  return typeSpecificPrompts[contentType] + '\n\nRespond ONLY as valid JSON with keys: summary, keyPoints, subjects, brandTerms, modelCodes, primaryProducts, category.';
}

/**
 * Process and store summary for a training material
 */
export async function processTrainingMaterialSummary(materialId: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  
  // Fetch the training material
  const { data: material, error } = await supabase
    .from('training_materials')
    .select('*')
    .eq('id', materialId)
    .single();

  if (error || !material) {
    throw new Error('Training material not found');
  }

  // Skip if already summarized recently (within 7 days)
  if (material.summarized_at) {
    const summarizedDate = new Date(material.summarized_at);
    const daysSinceSummary = (Date.now() - summarizedDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceSummary < 7) {
      console.log('Material already summarized recently, skipping');
      return;
    }
  }

  // Skip if no content
  if (!material.content) {
    console.log('No content to summarize');
    return;
  }

  try {
    // Generate summary
    const summaryResult = await summarizeTrainingMaterial(
      material.content,
      material.title,
      material.metadata
    );

    // Update the material with enhanced summary
    const structuredDataMerged: any = {
      ...(material.structured_data || {}),
      ...(summaryResult.structuredData || {}),
    };
    if (summaryResult.brandTerms && summaryResult.brandTerms.length) {
      structuredDataMerged.brand_terms = summaryResult.brandTerms;
    }
    if (summaryResult.modelCodes && summaryResult.modelCodes.length) {
      structuredDataMerged.model_codes = summaryResult.modelCodes;
    }
    if (summaryResult.category) {
      structuredDataMerged.category = summaryResult.category;
    }

    const { error: updateError } = await supabase
      .from('training_materials')
      .update({
        summary: summaryResult.summary,
        key_points: summaryResult.keyPoints,
        content_type: summaryResult.contentType,
        structured_data: structuredDataMerged,
        intent_keywords: summaryResult.intentKeywords,
        primary_products: summaryResult.primaryProducts,
        confidence_score: summaryResult.confidenceScore,
        summarized_at: new Date().toISOString(),
        metadata: {
          ...material.metadata,
          productInfo: summaryResult.productInfo
        }
      })
      .eq('id', materialId);

    if (updateError) {
      throw updateError;
    }

    console.log(`Successfully summarized material: ${material.title}`);
  } catch (error) {
    console.error('Error processing summary:', error);
    throw error;
  }
}

/**
 * Batch process summaries for all unsummarized materials
 */
export async function batchSummarizeTrainingMaterials(siteId: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  
  // Fetch unsummarized materials
  const { data: materials, error } = await supabase
    .from('training_materials')
    .select('id')
    .eq('site_id', siteId)
    .eq('scrape_status', 'success')
    .is('summary', null)
    .not('content', 'is', null)
    .limit(10); // Process in batches to avoid rate limits

  if (error) {
    throw error;
  }

  if (!materials || materials.length === 0) {
    console.log('No materials to summarize');
    return;
  }

  console.log(`Processing ${materials.length} materials for summarization`);

  // Process materials sequentially to avoid rate limits
  for (const material of materials) {
    try {
      await processTrainingMaterialSummary(material.id);
      // Add delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Failed to summarize material ${material.id}:`, error);
      // Continue with next material even if one fails
    }
  }
}
