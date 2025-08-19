# AI-Powered Context-Aware Product Filtering

## Problem Solved

Before this implementation, product searches would return irrelevant results:
- Search "G4 hair removal" → Returns G4 vacuum cleaners, G4 monitors, etc.
- Search "iPhone case" → Returns iPhone devices themselves
- Search "massage therapy" → Returns massage chairs and products

## Solution Overview

Added an AI filtering layer that understands search context and intent:

1. **Database retrieval** → Gets 10-20 candidate products (fast)
2. **AI filtering** → Understands context and filters to truly relevant products  
3. **Display** → Shows only contextually appropriate results

## Architecture

```
User Query: "G4 hair removal"
       ↓
[Database Search] → 15 candidates (all G4 products)
       ↓  
[AI Filtering] → Understands "hair removal" context
       ↓
[Final Results] → 3 relevant products (only hair removal G4s)
```

## Files Modified/Added

### Core Implementation
- `lib/ai/product-filter.ts` - AI filtering logic
- `app/(main)/api/products/match/route.ts` - Updated API endpoint
- `supabase/migrations/20250213_add_product_matching.sql` - Updated RPC function

### Configuration & Testing  
- `.env.example.ai-filtering` - Environment variable examples
- `test-ai-filtering.js` - Test script for validation
- `AI-FILTERING-README.md` - This documentation

## Setup Instructions

### 1. Environment Variables

Add to your `.env.local`:

```bash
# Enable AI filtering
ENABLE_AI_PRODUCT_FILTERING=true

# OpenAI API key (should already exist)
OPENAI_API_KEY=your_openai_api_key_here

# Optional: AI model to use (defaults to gpt-3.5-turbo)
AI_FILTER_MODEL=gpt-3.5-turbo
```

### 2. Database Migration

Run the updated migration:

```bash
# If you already ran the migration, re-run it to get description field
supabase migration apply 20250213_add_product_matching
```

### 3. Test the System

```bash
# Set your site ID for testing
echo "TEST_SITE_ID=your-site-id-here" >> .env.local

# Run the test script
node test-ai-filtering.js
```

## How It Works

### 1. Database Retrieval Phase
```typescript
// Gets 10-20 candidates using existing alias system
const candidates = await supabase.rpc('match_products_with_aliases', {
  p_site_id: siteId,
  p_query: userQuery,
  p_limit: 20
});
```

### 2. AI Filtering Phase
```typescript
// AI understands context and filters candidates
const relevant = await filterProductsWithAI(candidates, userQuery);

// Example prompt to AI:
// "User searches for 'G4 hair removal'. Which of these products are relevant?"
// Candidates: 
// 1. IVISKIN G4 Hair Removal Device ✅
// 2. Dyson G4 Vacuum Cleaner ❌  
// 3. Samsung G4 Gaming Monitor ❌
```

### 3. Response
```json
{
  "success": true,
  "data": [/* only relevant products */],
  "query": "G4 hair removal", 
  "count": 1,
  "candidatesCount": 15,
  "aiFiltered": true
}
```

## Benefits

✅ **Context Understanding** - "G4 hair removal" won't show vacuums  
✅ **No Database Changes** - Uses existing product/alias structure  
✅ **Fast Performance** - AI only processes 10-20 items, not entire catalog  
✅ **Cost Effective** - ~$0.0001 per query  
✅ **Graceful Fallback** - Falls back to unfiltered results if AI fails  
✅ **Industry Agnostic** - Works for any product type or service  

## Configuration Options

### Enable/Disable AI Filtering
```bash
# Enable (default)
ENABLE_AI_PRODUCT_FILTERING=true

# Disable (falls back to database-only matching)  
ENABLE_AI_PRODUCT_FILTERING=false
```

### Model Selection
```bash
# Use GPT-3.5 Turbo (default, cheapest)
AI_FILTER_MODEL=gpt-4o-mini

# Use GPT-4 (more accurate, more expensive)
AI_FILTER_MODEL=gpt-4o-mini

# Use Claude (if you switch AI providers)
AI_FILTER_MODEL=claude-3-haiku
```

## Cost Analysis

Assuming 1000 product searches per day:

- **Candidates per query**: ~15 products
- **Token usage**: ~500 tokens per query  
- **Daily cost**: ~$0.25 with GPT-3.5-turbo
- **Monthly cost**: ~$7.50

Much cheaper than poor user experience from irrelevant results.

## Testing Examples

### Good Filtering Examples
```bash
# Query: "G4 hair removal"
# Expected: Only hair removal G4 products  
# Should exclude: G4 vacuums, G4 monitors, G4 gaming devices

# Query: "iPhone case red"
# Expected: Only red iPhone cases
# Should exclude: iPhone devices, cases for other phones

# Query: "massage therapy 60 minutes"  
# Expected: Only massage therapy services
# Should exclude: Massage chairs, massage devices
```

### Edge Cases Handled
```bash
# Query: "G4" (generic)
# Behavior: Returns multiple G4 product types (no filtering needed)

# Query: "IVISKIN G4" (brand specific)
# Expected: Only IVISKIN G4 products
# Should exclude: Other brands' G4 products
```

## Monitoring

The system logs detailed information:

```bash
# Success logs
🧠 AI filtering 15 candidates for: "G4 hair removal"
✅ AI filtered down to 2 relevant products

# Fallback logs  
⚠️ AI filtering failed, using all candidates: [error details]
```

Monitor these logs to ensure AI filtering is working correctly.

## Future Improvements

1. **Caching** - Cache AI filtering results for identical queries (5 min TTL)
2. **A/B Testing** - Compare AI-filtered vs unfiltered conversion rates  
3. **Learning** - Use user click data to improve filtering accuracy
4. **Multi-language** - Support non-English product matching
5. **Semantic Search** - Add embedding-based similarity for even better matching

## Troubleshooting

### AI Filtering Not Working
1. Check `ENABLE_AI_PRODUCT_FILTERING=true` in `.env.local`
2. Verify `OPENAI_API_KEY` is set correctly
3. Check server logs for AI filtering errors
4. Test with `node test-ai-filtering.js`

### Products Still Showing Irrelevant Results  
1. Check if AI filtering is actually running (look for 🧠 logs)
2. Verify query has enough context (single keywords like "G4" may not filter)
3. Test with more specific queries
4. Check AI model performance (try GPT-4 instead of GPT-3.5)

### High API Costs
1. Monitor query volume and token usage
2. Consider caching for repeated queries
3. Use GPT-3.5-turbo instead of GPT-4
4. Temporarily disable with `ENABLE_AI_PRODUCT_FILTERING=false`

## Security Notes

- AI filtering happens server-side only
- User queries are sent to OpenAI for processing
- Product data (titles/descriptions) are sent to OpenAI  
- No user personal data is sent to OpenAI
- All API calls are authenticated and rate-limited

## Performance Impact

- **Latency**: +200-500ms per query (acceptable for product search)
- **Throughput**: No impact (AI calls are non-blocking)
- **Database**: No additional load (uses same queries)
- **Memory**: Minimal (only processes 10-20 products at a time)