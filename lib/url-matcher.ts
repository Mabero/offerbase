/**
 * URL Pattern Matching Service for Predefined Questions
 * 
 * This service handles matching URLs against patterns for the predefined questions feature.
 * It supports exact matching, contains matching, and exclude patterns with proper URL normalization.
 */

import { 
  PredefinedQuestion, 
  QuestionUrlRule, 
  UrlRuleType,
  UrlMatchingOptions,
  UrlMatchResult,
  MatchingQuestion,
  UrlMatcherConfig,
  UrlNormalizationOptions,
  PatternTestResult,
  PredefinedQuestionWithRules
} from '@/types/predefined-questions';

export class UrlMatcher {
  private config: UrlMatcherConfig;

  constructor(config: UrlMatcherConfig = {}) {
    this.config = {
      caseSensitive: false,
      normalizeUrl: true,
      maxPatternLength: 500,
      ...config
    };
  }

  /**
   * Normalize URL for consistent matching
   */
  private normalizeUrl(url: string, options: UrlNormalizationOptions = {}): string {
    if (!this.config.normalizeUrl) return url;

    try {
      const urlObj = new URL(url);
      
      // Apply normalization options
      if (options.lowercaseHost !== false) {
        urlObj.hostname = urlObj.hostname.toLowerCase();
      }
      
      if (options.removeTrailingSlash !== false && urlObj.pathname.endsWith('/') && urlObj.pathname.length > 1) {
        urlObj.pathname = urlObj.pathname.slice(0, -1);
      }
      
      if (options.removeQueryParams) {
        urlObj.search = '';
      }
      
      if (options.removeFragment) {
        urlObj.hash = '';
      }
      
      return urlObj.href;
    } catch (error) {
      // If URL parsing fails, return original URL
      console.warn('UrlMatcher: Failed to parse URL for normalization:', url, error);
      return url;
    }
  }

  /**
   * Normalize pattern for consistent matching
   */
  private normalizePattern(pattern: string): string {
    if (!this.config.caseSensitive) {
      return pattern.toLowerCase();
    }
    return pattern;
  }

  /**
   * Check if URL matches exact pattern
   */
  private matchesExact(url: string, pattern: string): boolean {
    const normalizedUrl = this.normalizeUrl(url);
    const normalizedPattern = this.normalizePattern(pattern.trim());
    
    // Try full URL comparison first
    if (!this.config.caseSensitive) {
      return normalizedUrl.toLowerCase() === normalizedPattern;
    }
    return normalizedUrl === normalizedPattern;
  }

  /**
   * Check if URL contains pattern
   */
  private matchesContains(url: string, pattern: string): boolean {
    const normalizedPattern = this.normalizePattern(pattern.trim());
    
    try {
      const urlObj = new URL(url);
      const fullUrl = this.normalizeUrl(url);
      const pathname = urlObj.pathname;
      const hostname = urlObj.hostname;
      const search = urlObj.search;
      
      // Check against different parts of the URL
      const targets = [fullUrl, pathname, hostname];
      
      // Include search params if pattern might be looking for query params
      if (normalizedPattern.includes('?') || normalizedPattern.includes('=')) {
        targets.push(search);
      }
      
      return targets.some(target => {
        if (!this.config.caseSensitive) {
          return target.toLowerCase().includes(normalizedPattern);
        }
        return target.includes(normalizedPattern);
      });
    } catch (error) {
      // Fallback to simple string matching if URL parsing fails
      if (!this.config.caseSensitive) {
        return url.toLowerCase().includes(normalizedPattern);
      }
      return url.includes(normalizedPattern);
    }
  }

  /**
   * Check if URL matches wildcard pattern
   */
  private matchesWildcard(url: string, pattern: string): boolean {
    try {
      // Convert glob pattern to regex
      // Escape special regex characters except * and ?
      const regexPattern = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
        .replace(/\*/g, '.*')  // Convert * to .*
        .replace(/\?/g, '.');  // Convert ? to .
      
      const flags = this.config.caseSensitive ? '' : 'i';
      const regex = new RegExp(`^${regexPattern}$`, flags);
      
      // Test against normalized URL
      const normalizedUrl = this.normalizeUrl(url);
      return regex.test(normalizedUrl);
    } catch (error) {
      console.warn('UrlMatcher: Failed to create regex for pattern:', pattern, error);
      return false;
    }
  }

  /**
   * Check if URL matches a specific rule
   */
  private matchesRule(url: string, rule: QuestionUrlRule): boolean {
    if (!rule.is_active || !rule.pattern?.trim()) {
      return false;
    }

    const pattern = rule.pattern.trim();
    
    // Validate pattern length
    if (pattern.length > (this.config.maxPatternLength || 500)) {
      console.warn('UrlMatcher: Pattern too long, skipping:', pattern.substring(0, 50) + '...');
      return false;
    }

    switch (rule.rule_type) {
      case 'exact':
        return this.matchesExact(url, pattern);
      case 'contains':
        return this.matchesContains(url, pattern);
      case 'exclude':
        // For exclude rules, we check if the pattern matches (to exclude it later)
        return this.matchesContains(url, pattern) || this.matchesWildcard(url, pattern);
      default:
        console.warn('UrlMatcher: Unknown rule type:', rule.rule_type);
        return false;
    }
  }

  /**
   * Check if URL should be excluded based on exclude rules
   */
  private isExcluded(url: string, rules: QuestionUrlRule[]): boolean {
    const excludeRules = rules.filter(rule => 
      rule.rule_type === 'exclude' && rule.is_active
    );
    
    return excludeRules.some(rule => this.matchesRule(url, rule));
  }

  /**
   * Check if URL matches any positive rules (exact or contains)
   */
  private matchesPositiveRules(url: string, rules: QuestionUrlRule[]): boolean {
    const positiveRules = rules.filter(rule => 
      rule.rule_type !== 'exclude' && rule.is_active
    );
    
    // If no positive rules, this should be handled at the question level
    if (positiveRules.length === 0) {
      return false;
    }
    
    return positiveRules.some(rule => this.matchesRule(url, rule));
  }

  /**
   * Check if a question matches the given URL
   */
  public matchesQuestion(url: string, question: PredefinedQuestionWithRules): boolean {
    if (!question.is_active) {
      return false;
    }

    const rules = question.question_url_rules || [];
    
    // Check exclusions first
    if (this.isExcluded(url, rules)) {
      return false;
    }

    // If no URL rules, treat as site-wide
    if (rules.length === 0) {
      return question.is_site_wide;
    }

    // Check positive rules
    const hasPositiveRules = rules.some(rule => 
      rule.rule_type !== 'exclude' && rule.is_active
    );
    
    if (hasPositiveRules) {
      return this.matchesPositiveRules(url, rules);
    } else {
      // Only exclude rules exist, so default to site-wide behavior
      return question.is_site_wide;
    }
  }

  /**
   * Get all matching questions for a URL, sorted by priority
   */
  public getMatchingQuestions(
    url: string, 
    questions: PredefinedQuestionWithRules[],
    options: Partial<UrlMatchingOptions> = {}
  ): MatchingQuestion[] {
    const matchingQuestions: MatchingQuestion[] = [];

    for (const question of questions) {
      if (this.matchesQuestion(url, question)) {
        const matchedRules = (question.question_url_rules || []).filter(rule =>
          rule.is_active && this.matchesRule(url, rule)
        );

        matchingQuestions.push({
          question,
          matchedRules,
          priority: question.priority
        });
      }
    }

    // Sort by priority (higher priority first), then by creation date
    return matchingQuestions
      .sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        // If priorities are equal, sort by creation date (newer first)
        return new Date(b.question.created_at).getTime() - new Date(a.question.created_at).getTime();
      })
      .slice(0, options.maxResults || Number.MAX_SAFE_INTEGER);
  }

  /**
   * Get URL match result with statistics
   */
  public getUrlMatchResult(
    url: string,
    questions: PredefinedQuestionWithRules[],
    options: Partial<UrlMatchingOptions> = {}
  ): UrlMatchResult {
    const matchingQuestions = this.getMatchingQuestions(url, questions, options);
    
    const siteWideCount = matchingQuestions.filter(mq => mq.question.is_site_wide).length;
    const urlSpecificCount = matchingQuestions.length - siteWideCount;

    return {
      questions: matchingQuestions,
      totalCount: matchingQuestions.length,
      siteWideCount,
      urlSpecificCount
    };
  }

  /**
   * Test a pattern against multiple URLs (for admin interface)
   */
  public testPattern(
    pattern: string,
    ruleType: UrlRuleType,
    testUrls: string[]
  ): PatternTestResult {
    const results = testUrls.map(url => {
      let matches = false;
      let explanation = '';

      try {
        const mockRule: QuestionUrlRule = {
          id: 'test',
          question_id: 'test',
          rule_type: ruleType,
          pattern,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        matches = this.matchesRule(url, mockRule);
        
        if (matches) {
          explanation = `Pattern "${pattern}" matches URL "${url}" using ${ruleType} rule`;
        } else {
          explanation = `Pattern "${pattern}" does not match URL "${url}" using ${ruleType} rule`;
        }
      } catch (error) {
        explanation = `Error testing pattern: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }

      return {
        url,
        matches,
        explanation
      };
    });

    return {
      pattern,
      rule_type: ruleType,
      tests: results
    };
  }

  /**
   * Validate a URL pattern
   */
  public validatePattern(pattern: string, ruleType: UrlRuleType): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!pattern || !pattern.trim()) {
      errors.push('Pattern cannot be empty');
      return { isValid: false, errors };
    }

    const trimmedPattern = pattern.trim();

    if (trimmedPattern.length > (this.config.maxPatternLength || 500)) {
      errors.push(`Pattern too long (max ${this.config.maxPatternLength} characters)`);
    }

    // Basic validation based on rule type
    switch (ruleType) {
      case 'exact':
        // For exact matches, try to parse as URL if it looks like one
        if (trimmedPattern.includes('://')) {
          try {
            new URL(trimmedPattern);
          } catch {
            errors.push('Invalid URL format for exact match pattern');
          }
        }
        break;
      
      case 'contains':
        // Contains patterns should not be empty after trimming
        if (trimmedPattern.length < 1) {
          errors.push('Contains pattern must have at least 1 character');
        }
        break;
      
      case 'exclude':
        // Same validation as contains for exclude patterns
        if (trimmedPattern.length < 1) {
          errors.push('Exclude pattern must have at least 1 character');
        }
        break;
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Get suggestions for common URL patterns
   */
  public getPatternSuggestions(sampleUrl?: string): Array<{ pattern: string; ruleType: UrlRuleType; description: string }> {
    const suggestions = [
      { pattern: '/products/', ruleType: 'contains' as UrlRuleType, description: 'All product pages' },
      { pattern: '/blog/', ruleType: 'contains' as UrlRuleType, description: 'All blog pages' },
      { pattern: '/category/', ruleType: 'contains' as UrlRuleType, description: 'All category pages' },
      { pattern: 'checkout', ruleType: 'contains' as UrlRuleType, description: 'Checkout and payment pages' },
      { pattern: '/admin', ruleType: 'exclude' as UrlRuleType, description: 'Exclude admin pages' },
      { pattern: '/login', ruleType: 'exclude' as UrlRuleType, description: 'Exclude login pages' },
      { pattern: '/api/', ruleType: 'exclude' as UrlRuleType, description: 'Exclude API endpoints' },
    ];

    // Add sample URL-based suggestions if provided
    if (sampleUrl) {
      try {
        const urlObj = new URL(sampleUrl);
        const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);
        
        if (pathParts.length > 0) {
          suggestions.unshift({
            pattern: sampleUrl,
            ruleType: 'exact',
            description: `Exact match for this specific page`
          });
          
          // Add path-based suggestions
          pathParts.forEach((part, index) => {
            const partialPath = '/' + pathParts.slice(0, index + 1).join('/') + '/';
            suggestions.push({
              pattern: partialPath,
              ruleType: 'contains',
              description: `All pages under ${partialPath}`
            });
          });
        }
      } catch {
        // Invalid URL, skip sample-based suggestions
      }
    }

    return suggestions.slice(0, 10); // Limit to 10 suggestions
  }
}

// Export a default instance with standard configuration
export const defaultUrlMatcher = new UrlMatcher({
  caseSensitive: false,
  normalizeUrl: true,
  maxPatternLength: 500
});

// Export factory function for custom configurations
export function createUrlMatcher(config: UrlMatcherConfig): UrlMatcher {
  return new UrlMatcher(config);
}