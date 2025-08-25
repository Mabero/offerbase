import { normalizeText, getNormalizationHash, NORMALIZATION_TEST_CASES } from '@/lib/offers/normalization';
import { createClient } from '@supabase/supabase-js';

// Test suite for normalization parity between SQL and TypeScript
// Critical for ensuring consistent offer resolution and post-filtering

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

describe('Normalization Parity: SQL vs TypeScript', () => {
  // Test that SQL normalize_text() and TS normalizeText() produce identical results
  test.each(NORMALIZATION_TEST_CASES)(
    'normalize(%s) -> %s',
    async (input, expected) => {
      // Test TypeScript implementation
      const tsResult = normalizeText(input);
      expect(tsResult).toBe(expected);
      
      // Test SQL implementation via RPC
      const { data: sqlResult, error } = await supabase.rpc('normalize_text', { 
        input: input 
      });
      
      expect(error).toBeNull();
      expect(sqlResult).toBe(expected);
      
      // Most importantly: SQL and TS must match exactly
      expect(sqlResult).toBe(tsResult);
    }
  );
});

describe('Norwegian Character Handling', () => {
  const norwegianCases = [
    // Common Norwegian words
    ['Hårfjerning', 'haarfjerning'],
    ['Kjøp nå', 'koep naa'],
    ['Læs mere', 'laes mere'],
    ['På norsk', 'paa norsk'],
    
    // Brand names with Norwegian chars
    ['IVISKIN Hårfjerning', 'iviskin haarfjerning'],
    ['Køb IVISKIN G-3', 'koep iviskin g3'],
    ['Læs om G-4 vs G-3', 'laes om g4 vs g3'],
    
    // Questions that might be asked
    ['Er IVISKIN G3 bra?', 'er iviskin g3 bra?'],
    ['Hva med G4 da?', 'hva med g4 da?'],
    ['Hvor mye koster den?', 'hvor mye koster den?']
  ];
  
  test.each(norwegianCases)(
    'Norwegian: %s -> %s',
    async (input, expected) => {
      const result = normalizeText(input);
      expect(result).toBe(expected);
      
      // Verify SQL matches
      const { data: sqlResult } = await supabase.rpc('normalize_text', { input });
      expect(sqlResult).toBe(result);
    }
  );
});

describe('G3/G4 Separator Handling', () => {
  // Critical test: Ensure G3/G4 normalization prevents mixing
  const separatorCases = [
    // Different separators should all become g3/g4
    ['G-3', 'g3'],
    ['G.3', 'g3'],
    ['G 3', 'g3'],
    ['g-3', 'g3'],
    ['g.3', 'g3'],
    ['g 3', 'g3'],
    
    ['G-4', 'g4'],
    ['G.4', 'g4'],
    ['G 4', 'g4'],
    ['g-4', 'g4'],
    ['g.4', 'g4'],
    ['g 4', 'g4'],
    
    // Brand + model combinations
    ['IVISKIN G-3', 'iviskin g3'],
    ['IVISKIN G-4', 'iviskin g4'],
    ['IviSkin G.3', 'iviskin g3'],
    ['IviSkin G.4', 'iviskin g4'],
    
    // Other models
    ['Model X-1', 'model x1'],
    ['Type A.2', 'type a2'],
    ['Version B-5', 'version b5']
  ];
  
  test.each(separatorCases)(
    'Separator: %s -> %s',
    async (input, expected) => {
      const result = normalizeText(input);
      expect(result).toBe(expected);
      
      // Verify SQL matches  
      const { data: sqlResult } = await supabase.rpc('normalize_text', { input });
      expect(sqlResult).toBe(result);
    }
  );
});

describe('Whitespace Normalization', () => {
  const whitespaceCases = [
    // Multiple spaces should collapse to single
    ['  hello   world  ', 'hello world'],
    ['IVISKIN  G-3  Laser', 'iviskin g3 laser'],
    ['\t\ntest\r\n  text\t', 'test text'],
    
    // Leading/trailing whitespace should be trimmed
    ['   trimmed   ', 'trimmed'],
    ['', ''], // Empty string
    ['   ', ''], // Only whitespace
  ];
  
  test.each(whitespaceCases)(
    'Whitespace: %s -> %s',
    async (input, expected) => {
      const result = normalizeText(input);
      expect(result).toBe(expected);
      
      // Verify SQL matches
      const { data: sqlResult } = await supabase.rpc('normalize_text', { input });
      expect(sqlResult).toBe(result);
    }
  );
});

describe('Edge Cases', () => {
  test('handles null/undefined gracefully', async () => {
    expect(normalizeText('')).toBe('');
    expect(normalizeText(null as any)).toBe('');
    expect(normalizeText(undefined as any)).toBe('');
    
    // SQL should handle NULL  
    const { data: sqlResult } = await supabase.rpc('normalize_text', { input: null });
    expect(sqlResult).toBeNull(); // SQL returns NULL for NULL input
  });
  
  test('handles numbers and special characters', async () => {
    const cases = [
      ['123', '123'],
      ['G3', 'g3'], 
      ['Model-123', 'model123'],
      ['Test!@#$', 'test!@#$'], // Punctuation preserved except separators
    ];
    
    for (const [input, expected] of cases) {
      const result = normalizeText(input);
      expect(result).toBe(expected);
      
      const { data: sqlResult } = await supabase.rpc('normalize_text', { input });
      expect(sqlResult).toBe(result);
    }
  });
});

describe('Hash Consistency', () => {
  test('identical normalized strings produce identical hashes', () => {
    const inputs = ['IVISKIN G-3', 'iviskin g3', '  IVISKIN   G.3  '];
    const hashes = inputs.map(input => getNormalizationHash(input));
    
    // All should produce the same hash since they normalize to the same string
    expect(hashes[1]).toBe(hashes[2]); // 'iviskin g3' === normalized('  IVISKIN   G.3  ')
  });
  
  test('different normalized strings produce different hashes', () => {
    const hash1 = getNormalizationHash('IVISKIN G3');
    const hash2 = getNormalizationHash('IVISKIN G4');
    
    expect(hash1).not.toBe(hash2);
  });
});

describe('Performance', () => {
  test('normalization completes quickly', () => {
    const longText = 'IVISKIN G-3 Hårfjerning '.repeat(100);
    
    const start = Date.now();
    const result = normalizeText(longText);
    const duration = Date.now() - start;
    
    // Should complete in well under 100ms even for long text
    expect(duration).toBeLessThan(100);
    expect(result).toContain('iviskin g3 haarfjerning');
  });
});

// Integration test: Verify offer resolution works with normalized queries
describe('Offer Resolution Integration', () => {
  test('G3 and G4 queries normalize to different values', () => {
    const g3Queries = [
      'IVISKIN G-3 weight',
      'iviskin g.3 specifications', 
      'tell me about g 3',
      'G3 vs G4'
    ];
    
    const g4Queries = [
      'IVISKIN G-4 weight',
      'iviskin g.4 specifications',
      'tell me about g 4', 
      'G4 vs G3'
    ];
    
    g3Queries.forEach(query => {
      const normalized = normalizeText(query);
      expect(normalized).toContain('g3');
      expect(normalized).not.toContain('g4');
    });
    
    g4Queries.forEach(query => {
      const normalized = normalizeText(query);
      expect(normalized).toContain('g4');
      expect(normalized).not.toContain('g3');
    });
  });
});