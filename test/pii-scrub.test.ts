/**
 * PII Scrub Tests - Ensure short product IDs survive
 */

import { scrubPII } from '../lib/context/safe-extract';

describe('PII Scrub - Preserve Product IDs', () => {
  test('preserves short product codes', () => {
    const testCases = [
      'g3',
      'x1', 
      's23',
      'G4',
      'X2',
      'pro',
      'max'
    ];
    
    testCases.forEach(code => {
      const result = scrubPII(code);
      expect(result.text).toBe(code);
      expect(result.redacted).toBe(false);
    });
  });
  
  test('scrubs actual PII', () => {
    const testCases = [
      {
        input: 'Contact john@example.com about g3',
        expected: 'Contact [email] about g3',
        shouldRedact: true
      },
      {
        input: 'Call 555-123-4567 for x1 info',
        expected: 'Call [phone] for x1 info',
        shouldRedact: true
      },
      {
        input: 'Visit https://example.com/g3-specs',
        expected: 'Visit [url]',
        shouldRedact: true
      },
      {
        input: 'Address: 123 Main Street, but g3 is good',
        expected: 'Address: [address], but g3 is good',
        shouldRedact: true
      }
    ];
    
    testCases.forEach(({ input, expected, shouldRedact }) => {
      const result = scrubPII(input);
      expect(result.text).toBe(expected);
      expect(result.redacted).toBe(shouldRedact);
    });
  });
  
  test('preserves product codes in context with PII', () => {
    const input = 'Email me at test@example.com about the g3 vs x1 comparison';
    const result = scrubPII(input);
    
    expect(result.text).toContain('g3');
    expect(result.text).toContain('x1');
    expect(result.text).toContain('[email]');
    expect(result.redacted).toBe(true);
  });
});