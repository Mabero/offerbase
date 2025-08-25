/**
 * Normalization Parity Tests
 * Ensures TypeScript normalize_text() matches SQL normalize_text() exactly
 * Critical for preventing subtle drift that could break G3/G4 differentiation
 */

import { createClient } from '@supabase/supabase-js';
import { normalize_text } from '../lib/context/safe-extract';

// Initialize Supabase client for testing
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

describe('Normalization Parity - TS matches SQL', () => {
  const testCases = [
    // Nordic characters
    'IVISKIN G-3',      // Should become 'iviskin g3'
    'Høy  kvalitet',    // Should become 'hoey kvalitet' (double space → single)
    'Vægt på G3',       // Should become 'vaegt paa g3'
    'Größe von Ä-1',   // Should become 'groesse von ae1'
    
    // Spacing and separators  
    'pro  PLAN',        // Should become 'pro plan'
    'X-1  device',      // Should become 'x1 device'
    'G.3.Pro',          // Should become 'g3pro'
    'model   S-23',     // Should become 'model s23'
    
    // Mixed cases
    'IVISkin G4 Pro',   // Should become 'iviskin g4 pro'
    'H.P. LaserJet P-1102',  // Should become 'hp laserjet p1102'
    
    // Edge cases
    '',                 // Empty string
    '   ',              // Only spaces
    'æøå',             // Only Nordic chars
    'G3-Pro-Max',       // Multiple separators
    
    // Real product names
    'iPhone 14 Pro',
    'Samsung Galaxy S-23',
    'Dyson V-15',
    'Tesla Model S'
  ];

  test.each(testCases)('normalizes "%s" consistently', async (input) => {
    // TypeScript normalization
    const tsNormalized = normalize_text(input);
    
    // SQL normalization via RPC
    const { data: sqlNormalized, error } = await supabase
      .rpc('normalize_text', { input });

    if (error) {
      throw new Error(`SQL normalization failed: ${error.message}`);
    }

    // Must match exactly
    expect(tsNormalized).toBe(sqlNormalized);
  });

  test('handles null/undefined inputs consistently', async () => {
    // TypeScript behavior
    const tsNull = normalize_text('');
    const tsUndefined = normalize_text(null as any);
    
    // SQL behavior  
    const { data: sqlNull } = await supabase.rpc('normalize_text', { input: null });
    const { data: sqlEmpty } = await supabase.rpc('normalize_text', { input: '' });
    
    expect(tsNull).toBe(sqlEmpty);
    expect(tsUndefined).toBe('');
    expect(sqlNull).toBeNull();
  });

  test('preserves product codes after normalization', async () => {
    const productCodes = ['G3', 'g-4', 'X.1', 'S 23', 'H-1'];
    
    for (const code of productCodes) {
      const tsNormalized = normalize_text(code);
      const { data: sqlNormalized } = await supabase.rpc('normalize_text', { input: code });
      
      // Both should preserve the alphanumeric content
      expect(tsNormalized).toBe(sqlNormalized);
      expect(tsNormalized).toMatch(/[a-z]\d+/); // Should be like 'g3', 'x1', etc.
    }
  });

  test('handles complex multilingual text', async () => {
    const multilingualCases = [
      'Høy kvalitet G3 enhet',
      'Größte Leistung X-1',
      'Schöne Åpparatur S23'
    ];
    
    for (const text of multilingualCases) {
      const tsResult = normalize_text(text);
      const { data: sqlResult } = await supabase.rpc('normalize_text', { input: text });
      
      expect(tsResult).toBe(sqlResult);
      // Should not contain original special characters
      expect(tsResult).not.toMatch(/[æøåäöüß]/);
    }
  });
});