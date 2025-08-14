/**
 * Enterprise-grade automatic alias generation for products and services
 * Works across all industries: e-commerce, medical, education, services, etc.
 */

export function generateSmartAliases(title: string): string[] {
  if (!title || title.length < 2) return [];
  
  const aliases = new Set<string>();
  
  // A. Extract key identifiers (model numbers, versions, codes)
  // Matches: G4, V2.0, MK3, 2024, Rev-B, Series-X, etc.
  const identifierPatterns = [
    /\b([A-Z]+\d+[\.\d]*)\b/gi,          // G4, MK3, A1
    /\b(V\d+[\.\d]*)\b/gi,               // V2, V1.5, V3.0
    /\b(20\d{2})\b/g,                    // 2024, 2023
    /\b(Rev[\-\s]?[A-Z])\b/gi,           // Rev-B, Rev A
    /\b(Series[\-\s]?[A-Z0-9]+)\b/gi,    // Series-X, Series 3
    /\b(Gen[\-\s]?\d+)\b/gi,             // Gen-2, Gen 3
    /\b(Mark[\-\s]?\d+)\b/gi,            // Mark-II, Mark 3
  ];
  
  identifierPatterns.forEach(pattern => {
    const matches = title.match(pattern);
    if (matches) {
      matches.forEach(match => aliases.add(match.trim()));
    }
  });
  
  // B. Extract acronyms and abbreviations (2-5 uppercase letters)
  const acronyms = title.match(/\b[A-Z]{2,5}\b/g);
  if (acronyms) {
    acronyms.forEach(acronym => {
      // Filter out common words that happen to be uppercase
      if (!['THE', 'AND', 'FOR', 'WITH'].includes(acronym)) {
        aliases.add(acronym);
      }
    });
  }
  
  // C. Split by common separators and extract meaningful segments
  const separators = /[\-\:\|\,\(\)\/\[\]]/;
  const segments = title.split(separators);
  
  segments.forEach(segment => {
    const cleaned = segment.trim();
    // Keep segments that are meaningful (not too short or too long)
    if (cleaned.length > 2 && cleaned.length < 50) {
      // Skip common filler segments
      const fillers = ['professional', 'premium', 'best', 'new', 'the', 'and', 'or', 'for'];
      if (!fillers.includes(cleaned.toLowerCase())) {
        aliases.add(cleaned);
      }
    }
  });
  
  // D. Extract parenthetical and bracketed content
  const parenContent = title.match(/[\(\[]([^\)\]]+)[\)\]]/g);
  if (parenContent) {
    parenContent.forEach(content => {
      const cleaned = content.replace(/[\(\)\[\]]/g, '').trim();
      if (cleaned.length > 1) {
        aliases.add(cleaned);
      }
    });
  }
  
  // E. Create combinations of brand/service + identifier
  const words = title.split(/\s+/).filter(w => w.length > 0);
  const identifiers = Array.from(aliases).filter(a => 
    /^[A-Z]*\d+/.test(a) || /^V\d+/.test(a) || /^20\d{2}$/.test(a)
  );
  
  if (identifiers.length > 0 && words.length > 0) {
    // First meaningful word + identifier
    const firstMeaningful = words.find(w => 
      w.length > 2 && !/^(the|and|or|for|with)$/i.test(w)
    );
    
    if (firstMeaningful) {
      identifiers.forEach(id => {
        const combo = `${firstMeaningful} ${id}`;
        if (combo.length < 50) {
          aliases.add(combo);
        }
      });
    }
  }
  
  // F. Handle time-based patterns (for services)
  const timePatterns = [
    /\b(\d+)\s*mins?\b/gi,
    /\b(\d+)\s*hours?\b/gi,
    /\b(\d+)\s*hrs?\b/gi,
    /\b(\d+)\s*minutes?\b/gi,
    /\b(\d+)\s*sessions?\b/gi,
  ];
  
  timePatterns.forEach(pattern => {
    const matches = title.match(pattern);
    if (matches) {
      matches.forEach(match => {
        aliases.add(match.trim());
        // Also add normalized versions
        const num = match.match(/\d+/);
        if (num) {
          aliases.add(`${num[0]} min`);
          aliases.add(`${num[0]} minute`);
        }
      });
    }
  });
  
  // G. Extract price patterns
  const pricePatterns = title.match(/\$\d+[\.\d]*/g);
  if (pricePatterns) {
    pricePatterns.forEach(price => aliases.add(price));
  }
  
  // H. Create a clean version without common filler words
  const fillerWords = [
    'the', 'and', 'or', 'for', 'with', 'by', 'from', 'about',
    'product', 'service', 'professional', 'premium', 'best',
    'new', 'latest', 'advanced', 'ultimate', 'deluxe', 'super'
  ];
  
  const withoutFillers = title
    .split(/\s+/)
    .filter(word => !fillerWords.includes(word.toLowerCase()))
    .join(' ')
    .trim();
  
  if (withoutFillers.length > 5 && withoutFillers.length < 50 && withoutFillers !== title) {
    aliases.add(withoutFillers);
  }
  
  // I. Handle compound words with hyphens/underscores
  const compoundWords = title.match(/\b\w+[\-_]\w+\b/g);
  if (compoundWords) {
    compoundWords.forEach(compound => {
      aliases.add(compound);
      // Also add version with space instead of hyphen
      aliases.add(compound.replace(/[\-_]/g, ' '));
    });
  }
  
  // J. Add the full title if it's not too long
  if (title.length <= 50) {
    aliases.add(title);
  }
  
  // Convert Set to Array, filter, and limit
  return Array.from(aliases)
    .map(alias => alias.trim())
    .filter(alias => {
      // Remove aliases that are too short, too long, or match the original title
      return alias.length > 1 && 
             alias.length <= 100 &&
             alias.toLowerCase() !== title.toLowerCase();
    })
    .slice(0, 10); // Cap at 10 aliases for database performance
}

/**
 * Test function to verify alias generation
 */
export function testAliasGeneration() {
  const testCases = [
    "IVISKIN G4 IPL Hair-Removal Device - Professional Grade",
    "Deep Tissue Massage (60 min) - Therapeutic",
    "JavaScript Masterclass 2024: From Zero to Hero",
    "Tax Consultation - Small Business (1hr Session)",
    "iPhone 15 Pro Max - 256GB (Space Gray)",
    "Chiropractic Adjustment - Full Spine",
    "CBD Oil 1000mg - Full Spectrum",
    "WordPress Website Development (5 Pages)",
    "Series-X Gaming Console Bundle",
    "Yoga Class - Beginners (90 minutes)",
  ];
  
  testCases.forEach(title => {
    console.log(`\nTitle: "${title}"`);
    console.log("Aliases:", generateSmartAliases(title));
  });
}