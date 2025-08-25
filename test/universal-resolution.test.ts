/**
 * Universal Resolution Integration Tests
 * Tests the complete resolution pipeline with various scenarios
 */

import { resolveQuery } from '../lib/universal/resolution-engine';
import { getAIInstructions } from '../lib/instructions';

// Mock siteId for testing (replace with real one)
const TEST_SITE_ID = 'test-site-id';

describe('Universal Resolution Engine', () => {
  const baseInstructions = getAIInstructions();

  describe('Ambiguous Queries', () => {
    test('handles ambiguous product codes', async () => {
      const result = await resolveQuery(
        'g3',
        TEST_SITE_ID,
        {
          messages: ['g3'],
          pageContext: { title: 'Product Comparison' }
        },
        baseInstructions
      );

      // Should either clarify or pick the best match
      expect(result.mode).toMatch(/single|multi|refusal/);
      if (result.mode === 'multi') {
        expect(result.chunks).toBeDefined();
        expect(result.systemPrompt).toContain('Multiple products');
        expect(result.systemPrompt).toContain('Do NOT merge specs');
      }
    }, 10000);

    test('handles explicit brand queries without ambiguity', async () => {
      const result = await resolveQuery(
        'iviskin g3',
        TEST_SITE_ID,
        {
          messages: ['iviskin g3'],
          pageContext: { title: 'Beauty Products' }
        },
        baseInstructions
      );

      // Should be single context since brand is specified
      expect(result.mode).toBe('single');
      if (result.mode === 'single') {
        expect(result.chunks).toBeDefined();
        expect(result.systemPrompt).not.toContain('Multiple products');
      }
    }, 10000);
  });

  describe('Context Extraction', () => {
    test('uses page context for disambiguation', async () => {
      const beautyContext = await resolveQuery(
        'g3',
        TEST_SITE_ID,
        {
          messages: ['g3'],
          pageContext: { 
            title: 'Hair Removal Devices - Beauty Products',
            description: 'Best hair removal devices for smooth skin'
          }
        },
        baseInstructions
      );

      const vacuumContext = await resolveQuery(
        'g3', 
        TEST_SITE_ID,
        {
          messages: ['g3'],
          pageContext: {
            title: 'Vacuum Cleaners - Home Appliances',
            description: 'Powerful vacuum cleaners for home cleaning'
          }
        },
        baseInstructions
      );

      // Context should influence results (may be same mode but different content)
      expect(beautyContext).toBeDefined();
      expect(vacuumContext).toBeDefined();
    }, 10000);

    test('extracts conversation context safely', async () => {
      const result = await resolveQuery(
        'g3 vs g4',
        TEST_SITE_ID,
        {
          messages: [
            'What are good hair removal options?',
            'I heard about IPL devices',
            'g3 vs g4'
          ]
        },
        baseInstructions
      );

      expect(result).toBeDefined();
      expect(result.mode).toMatch(/single|multi|refusal/);
    }, 10000);
  });

  describe('Service Queries', () => {
    test('handles service queries without brand/model', async () => {
      const result = await resolveQuery(
        '1-hour marketing consultation',
        TEST_SITE_ID,
        {
          messages: ['1-hour marketing consultation'],
          pageContext: { title: 'Professional Services' }
        },
        baseInstructions
      );

      expect(result).toBeDefined();
      // Should work even without traditional brand/model structure
    }, 10000);

    test('handles book/media queries', async () => {
      const result = await resolveQuery(
        'Harry Potter book 1',
        TEST_SITE_ID,
        {
          messages: ['Harry Potter book 1'],
          pageContext: { title: 'Books and Media' }
        },
        baseInstructions
      );

      expect(result).toBeDefined();
      // Should resolve via title matching
    }, 10000);
  });

  describe('Error Handling', () => {
    test('handles empty queries gracefully', async () => {
      const result = await resolveQuery(
        '',
        TEST_SITE_ID,
        { messages: [''] },
        baseInstructions
      );

      expect(result.mode).toBe('refusal');
    });

    test('handles invalid site ID', async () => {
      const result = await resolveQuery(
        'test query',
        'invalid-site-id',
        { messages: ['test query'] },
        baseInstructions
      );

      // Should not crash, may return refusal
      expect(result).toBeDefined();
    });
  });

  describe('Performance', () => {
    test('completes within acceptable time', async () => {
      const start = Date.now();
      
      const result = await resolveQuery(
        'g3 weight specifications',
        TEST_SITE_ID,
        {
          messages: ['g3 weight specifications'],
          pageContext: { title: 'Product Specs' }
        },
        baseInstructions
      );
      
      const duration = Date.now() - start;
      
      expect(result).toBeDefined();
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
});