import { createClient } from '@supabase/supabase-js';
import { resolveOfferHint, extractModelReferences } from '@/lib/offers/resolver';
import { filterChunksByOffer } from '@/lib/offers/chunk-filter';
import { normalizeText } from '@/lib/offers/normalization';

// Integration tests for the complete offer resolution system
// Tests Norwegian language support and G3/G4 confusion prevention

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Mock site ID for testing - replace with actual test site
const TEST_SITE_ID = 'test-site-uuid';

// Test scenarios that must work correctly
const TEST_SCENARIOS = [
  // Norwegian queries
  {
    name: 'Norwegian question about G3',
    query: 'Er IVISKIN G3 bra?',
    expectedModel: 'g3',
    expectedDecision: ['single', 'multiple', 'none'] as const,
    language: 'norwegian'
  },
  {
    name: 'Norwegian question about G4',  
    query: 'Hva med G4 da?',
    expectedModel: 'g4',
    expectedDecision: ['single', 'multiple', 'none'] as const,
    language: 'norwegian'
  },
  {
    name: 'Norwegian weight question',
    query: 'Hvor mye veier IVISKIN G-3?',
    expectedModel: 'g3',
    expectedDecision: ['single', 'multiple', 'none'] as const,
    language: 'norwegian'
  },
  
  // English queries with separators
  {
    name: 'English G3 with dash',
    query: 'IVISKIN G-3 weight',
    expectedModel: 'g3',
    expectedDecision: ['single', 'multiple'] as const,
    language: 'english'
  },
  {
    name: 'English G4 with dot',
    query: 'IVISKIN G.4 specifications',
    expectedModel: 'g4', 
    expectedDecision: ['single', 'multiple'] as const,
    language: 'english'
  },
  {
    name: 'English G3 with space',
    query: 'tell me about G 3',
    expectedModel: 'g3',
    expectedDecision: ['single', 'multiple', 'none'] as const,
    language: 'english'
  },
  
  // Model-only queries
  {
    name: 'Simple G3',
    query: 'G3',
    expectedModel: 'g3',
    expectedDecision: ['single', 'multiple', 'none'] as const,
    language: 'english'
  },
  {
    name: 'Simple G4',
    query: 'G4',
    expectedModel: 'g4',
    expectedDecision: ['single', 'multiple', 'none'] as const,
    language: 'english'
  },
  
  // Comparison queries
  {
    name: 'G3 vs G4 comparison',
    query: 'G3 vs G4 differences',
    expectedModel: ['g3', 'g4'], // Should find both
    expectedDecision: ['multiple', 'none'] as const,
    language: 'english'
  },
  
  // Out-of-corpus queries (should refuse)
  {
    name: 'Unrelated product',
    query: 'toothbrush recommendations',
    expectedModel: null,
    expectedDecision: ['none'] as const,
    language: 'english'
  }
];

describe('Offer Resolution Integration Tests', () => {
  beforeAll(async () => {
    // Ensure test data exists - create sample offers for testing
    await setupTestData();
  });
  
  afterAll(async () => {
    // Clean up test data
    await cleanupTestData();
  });
  
  describe('Query Normalization', () => {
    TEST_SCENARIOS.forEach(scenario => {
      test(`normalizes "${scenario.query}" correctly`, () => {
        const normalized = normalizeText(scenario.query);
        
        if (typeof scenario.expectedModel === 'string') {
          expect(normalized).toContain(scenario.expectedModel);
        } else if (Array.isArray(scenario.expectedModel)) {
          scenario.expectedModel.forEach(model => {
            expect(normalized).toContain(model);
          });
        }
        
        // Norwegian characters should be transliterated
        if (scenario.language === 'norwegian') {
          expect(normalized).not.toMatch(/[æøå]/);
          if (scenario.query.includes('Hvor')) {
            expect(normalized).toContain('hvor');
          }
        }
      });
    });
  });
  
  describe('Model Reference Extraction', () => {
    test('extracts G3 and G4 correctly from various formats', () => {
      const cases = [
        ['IVISKIN G-3', ['iviskin', 'g3']],
        ['G.4 Laser', ['g4', 'laser']],
        ['Compare G 3 vs G 4', ['g3', 'g4']],
        ['Model X-1 vs Y-2', ['x1', 'y2']],
        ['no models here', []]
      ];
      
      cases.forEach(([query, expected]) => {
        const models = extractModelReferences(query as string);
        expected.forEach(expectedModel => {
          expect(models).toContain(expectedModel);
        });
      });
    });
  });
  
  describe('Offer Resolution', () => {
    TEST_SCENARIOS.forEach(scenario => {
      test(`resolves "${scenario.query}" correctly`, async () => {
        const result = await resolveOfferHint(scenario.query, TEST_SITE_ID);
        
        // Check decision type is acceptable
        expect(scenario.expectedDecision).toContain(result.type);
        
        // Check query normalization
        expect(result.query_norm).toBe(normalizeText(scenario.query));
        
        // If single decision, should have winner
        if (result.type === 'single') {
          expect(result.offer).toBeDefined();
          expect(result.offer?.title).toBeTruthy();
          
          // Winner should match expected model
          if (typeof scenario.expectedModel === 'string') {
            const winnerNorm = normalizeText(result.offer!.title);
            expect(winnerNorm).toContain(scenario.expectedModel);
          }
        }
        
        // If multiple decision, should have alternatives
        if (result.type === 'multiple') {
          expect(result.alternatives).toBeDefined();
          expect(result.alternatives!.length).toBeGreaterThan(1);
        }
        
        // If none decision, should have no winner
        if (result.type === 'none') {
          expect(result.offer).toBeUndefined();
          expect(result.alternatives).toBeUndefined();
        }
      });
    });
  });
  
  describe('Post-Filter Chunk Filtering', () => {
    const mockChunks = [
      { 
        chunkId: '1', 
        content: 'IVISKIN G3 specifications: weight 2kg, power 50W',
        similarity: 0.8,
        metadata: {},
        materialId: 'mat1',
        materialTitle: 'G3 Manual'
      },
      {
        chunkId: '2',
        content: 'IVISKIN G4 specifications: weight 2.5kg, power 60W', 
        similarity: 0.7,
        metadata: {},
        materialId: 'mat2',
        materialTitle: 'G4 Manual'
      },
      {
        chunkId: '3',
        content: 'General IVISKIN company information and contact details',
        similarity: 0.6,
        metadata: {},
        materialId: 'mat3', 
        materialTitle: 'Company Info'
      },
      {
        chunkId: '4',
        content: 'IVISKIN G3 laser safety protocols and usage guidelines',
        similarity: 0.5,
        metadata: {},
        materialId: 'mat1',
        materialTitle: 'G3 Manual' 
      }
    ];
    
    test('filters G3 chunks when G3 is winner', () => {
      const g3Winner = {
        brand_norm: 'iviskin',
        model_norm: 'g3'
      };
      
      const result = filterChunksByOffer(mockChunks, g3Winner);
      
      // Should only get chunks 1 and 4 (mention both iviskin and g3)
      expect(result.filtered).toHaveLength(2);
      expect(result.filtered.map(c => c.chunkId)).toEqual(['1', '4']);
      expect(result.method).toBe('brand_model');
      expect(result.fallback).toBe(false);
    });
    
    test('filters G4 chunks when G4 is winner', () => {
      const g4Winner = {
        brand_norm: 'iviskin', 
        model_norm: 'g4'
      };
      
      const result = filterChunksByOffer(mockChunks, g4Winner);
      
      // Should only get chunk 2 (mentions both iviskin and g4)
      expect(result.filtered).toHaveLength(1);
      expect(result.filtered[0].chunkId).toBe('2');
      expect(result.method).toBe('brand_model');
    });
    
    test('uses model-only fallback when brand+model yields nothing', () => {
      const chunksWithoutBrand = [
        {
          chunkId: '5',
          content: 'G3 model comparison and technical specifications',
          similarity: 0.8,
          metadata: {},
          materialId: 'mat5',
          materialTitle: 'Comparison'
        }
      ];
      
      const result = filterChunksByOffer(chunksWithoutBrand, {
        brand_norm: 'iviskin',
        model_norm: 'g3'
      });
      
      // Should fall back to model-only and find the G3 chunk
      expect(result.filtered).toHaveLength(1);
      expect(result.filtered[0].chunkId).toBe('5');
      expect(result.method).toBe('model_only');
      expect(result.fallback).toBe(true);
    });
    
    test('prevents G3/G4 mixing - G3 query should not get G4 specs', () => {
      const g3Winner = {
        brand_norm: 'iviskin',
        model_norm: 'g3'
      };
      
      const result = filterChunksByOffer(mockChunks, g3Winner);
      
      // Verify no G4 chunks are included
      result.filtered.forEach(chunk => {
        const contentNorm = normalizeText(chunk.content);
        expect(contentNorm).not.toContain('g4');
        expect(contentNorm).toContain('g3');
      });
    });
  });
});

// Helper functions for test setup
async function setupTestData() {
  try {
    // Create test offers if they don't exist
    const testOffers = [
      {
        site_id: TEST_SITE_ID,
        title: 'IVISKIN G3 Laser Hair Removal',
        brand: 'IVISKIN',
        model: 'G3',
        url: 'https://example.com/g3',
        description: 'Professional laser hair removal device G3 model'
      },
      {
        site_id: TEST_SITE_ID,
        title: 'IVISKIN G4 Laser Hair Removal',
        brand: 'IVISKIN', 
        model: 'G4',
        url: 'https://example.com/g4',
        description: 'Advanced laser hair removal device G4 model'
      }
    ];
    
    for (const offer of testOffers) {
      await supabase.from('offers').upsert(offer, { 
        onConflict: 'site_id,title' 
      });
    }
    
    console.log('Test offers created successfully');
  } catch (error) {
    console.warn('Could not create test offers:', error);
    // Tests may still work with existing data
  }
}

async function cleanupTestData() {
  try {
    // Clean up test offers
    await supabase
      .from('offers')
      .delete()
      .eq('site_id', TEST_SITE_ID);
      
    console.log('Test offers cleaned up');
  } catch (error) {
    console.warn('Could not clean up test offers:', error);
  }
}