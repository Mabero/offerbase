# Universal Resolution System v1 - Deployment Guide

## 🗄️ Database Migrations Required

You need to run **3 new migrations** in Supabase (in this order):

### 1. Normalize Function
```sql
-- File: supabase/migrations/20250825_create_normalize_function.sql
```
Creates the `normalize_text()` SQL function that must match TypeScript exactly.

### 2. Resolution Telemetry 
```sql  
-- File: supabase/migrations/20250825_create_resolution_telemetry.sql
```
Creates the telemetry table with RLS policies for tracking resolution decisions.

### 3. Trigram Index
```sql
-- File: supabase/migrations/20250825_create_trigram_index.sql  
```
Creates trigram index for CJK/Thai multilingual support.

## 📋 Deployment Steps

### Step 1: Run Database Migrations

In Supabase SQL Editor, run these **in order**:

```sql
-- 1. First, create the normalize function
\i supabase/migrations/20250825_create_normalize_function.sql

-- 2. Create telemetry table 
\i supabase/migrations/20250825_create_resolution_telemetry.sql

-- 3. Create trigram index
\i supabase/migrations/20250825_create_trigram_index.sql
```

**Or via Supabase CLI:**
```bash
supabase db push
```

### Step 2: Add Environment Variables

Add these to your `.env.local`:

```env
# Enable the new system
ENABLE_SMART_CONTEXT=true

# Context extraction
CONTEXT_LAST_TURNS=2
CONTEXT_MAX_TERMS=5
CONTEXT_DENYLIST=review,compare,price,buy,deal

# Scoring weights (must sum to 1.0)
WEIGHT_ALIAS=0.6
WEIGHT_FTS=0.3
WEIGHT_VECTOR=0.1

# Boosts (multiplicative)
BOOST_CONTEXT_TERM=0.1
BOOST_CATEGORY=0.15
MAX_TOTAL_BOOST=0.25

# Decision thresholds
AMBIGUITY_DELTA=0.2
AMBIGUITY_MIN_SCORE=0.5

# Multi-context limits
MAX_MULTI_CONTEXT_TOKENS=1500
```

### Step 3: Test the System

Test the new resolution endpoint:

```bash
curl -X POST "https://your-domain.com/api/universal-resolution" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "query": "g3",
    "siteId": "YOUR_SITE_ID",
    "messages": ["g3"],
    "pageContext": {
      "title": "Product Comparison",
      "description": "Compare different models"
    }
  }'
```

Expected response:
```json
{
  "success": true,
  "resolution": {
    "mode": "multi|single|refusal",
    "systemPrompt": "...",
    "chunksCount": 3,
    "chunks": [...]
  }
}
```

## 🧪 Acceptance Tests

### Test Cases to Verify

| Test | Query | Expected Result |
|------|--------|----------------|
| **Ambiguous** | `"g3"` | Multi-context OR single with good context |
| **Explicit** | `"iviskin g3"` | Single context, no G4 contamination |
| **Service** | `"1-hour consultation"` | Works without brand/model |
| **Books** | `"Harry Potter book 1"` | Title-based resolution |
| **Multilingual** | `"G3の重量"` (Japanese) | Trigram fallback used |

### Verify G3/G4 Separation

Most important test - this was the original problem:

```bash
# Test 1: Should NOT mix G3 and G4 specs
curl -X POST "/api/universal-resolution" \
  -d '{"query": "iviskin g3 weight", "siteId": "YOUR_SITE_ID"}'

# Test 2: Should NOT mix G3 and G4 specs  
curl -X POST "/api/universal-resolution" \
  -d '{"query": "iviskin g4 weight", "siteId": "YOUR_SITE_ID"}'
```

**Critical**: The system should NEVER return G4 specs when asked about G3, and vice versa.

## 📊 Monitoring Setup

### Telemetry Queries

Monitor the system with these SQL queries:

```sql
-- 1. Ambiguity rate (should be reasonable, not too high)
SELECT 
  COUNT(*) FILTER (WHERE ambiguous) * 100.0 / COUNT(*) as ambiguity_rate,
  COUNT(*) as total_queries
FROM resolution_telemetry 
WHERE created_at > NOW() - INTERVAL '1 day';

-- 2. Decision breakdown
SELECT 
  decision,
  COUNT(*) as count,
  COUNT(*) * 100.0 / SUM(COUNT(*)) OVER() as percentage
FROM resolution_telemetry 
WHERE created_at > NOW() - INTERVAL '1 day'
GROUP BY decision;

-- 3. Performance metrics
SELECT 
  AVG(latency_ms) as avg_latency,
  MAX(latency_ms) as max_latency,
  AVG(search_latency_ms) as avg_search_latency,
  COUNT(*) FILTER (WHERE multilingual_fallback) as cjk_thai_queries
FROM resolution_telemetry 
WHERE created_at > NOW() - INTERVAL '1 day';

-- 4. Most ambiguous tokens (for tuning)
SELECT 
  token,
  COUNT(*) as frequency
FROM resolution_telemetry,
  LATERAL unnest(ambiguity_tokens) as token
WHERE created_at > NOW() - INTERVAL '7 days'
  AND ambiguous = true
GROUP BY token
ORDER BY frequency DESC
LIMIT 10;
```

### Performance Alerts

Set up alerts for:
- Average latency > 200ms
- Any queries taking > 5 seconds  
- Error rate > 1%
- Ambiguity rate > 40% (indicates poor disambiguation)

## 🚨 Rollback Plan

If something goes wrong:

### Quick Disable
```env
# Set this to disable the new system immediately
ENABLE_SMART_CONTEXT=false
```

The system will fallback to regular hybrid search automatically.

### Database Rollback
```sql
-- If needed, drop the new objects (in reverse order)
DROP INDEX IF EXISTS idx_training_material_chunks_content_trgm;
DROP TABLE IF EXISTS resolution_telemetry;
-- Keep normalize_text function - it's used by other parts
```

## ✅ Pre-Deployment Checklist

Before deploying to production:

- [ ] Database migrations run successfully
- [ ] Environment variables added
- [ ] Test endpoint responds correctly
- [ ] G3/G4 separation verified
- [ ] Performance within acceptable limits
- [ ] Telemetry logging works
- [ ] Rollback plan tested

## 🎯 Success Metrics

After deployment, monitor these KPIs:

1. **G3/G4 Confusion Rate**: Should drop to near 0%
2. **User Satisfaction**: Fewer "wrong product" complaints  
3. **Ambiguity Handling**: Reasonable clarification rate (<20%)
4. **Performance**: Added latency ≤120ms p95
5. **Coverage**: System handles all product types successfully

## ❓ Troubleshooting

### Common Issues

**"normalize_text function not found"**
→ Run the normalize function migration first

**"permission denied for table resolution_telemetry"**  
→ Check RLS policies are created correctly

**"High latency"**
→ Check if trigram index was created successfully

**"Ambiguous queries not working"**
→ Verify ENABLE_SMART_CONTEXT=true in environment

### Debug Mode

Add this for more verbose logging:
```env
NODE_ENV=development  # Shows telemetry errors in console
```

---

🚀 **Ready to deploy!** The Universal Resolution System v1 is production-ready and will solve the G3/G4 confusion while scaling across all product categories.