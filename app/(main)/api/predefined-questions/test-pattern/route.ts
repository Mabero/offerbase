import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { defaultUrlMatcher } from '@/lib/url-matcher';
import { PatternTestRequest, PatternTestResult } from '@/types/predefined-questions';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: PatternTestRequest = await request.json();
    const { pattern, rule_type, test_urls } = body;

    // Validation
    if (!pattern || !pattern.trim()) {
      return NextResponse.json({ error: 'Pattern is required' }, { status: 400 });
    }

    if (!rule_type || !['exact', 'contains', 'exclude'].includes(rule_type)) {
      return NextResponse.json({ error: 'Valid rule_type is required (exact, contains, exclude)' }, { status: 400 });
    }

    if (!test_urls || !Array.isArray(test_urls) || test_urls.length === 0) {
      return NextResponse.json({ error: 'Test URLs array is required' }, { status: 400 });
    }

    if (test_urls.length > 20) {
      return NextResponse.json({ error: 'Maximum 20 test URLs allowed' }, { status: 400 });
    }

    // Validate each URL format
    const invalidUrls = [];
    for (const url of test_urls) {
      try {
        new URL(url);
      } catch {
        invalidUrls.push(url);
      }
    }

    if (invalidUrls.length > 0) {
      return NextResponse.json({ 
        error: `Invalid URL format: ${invalidUrls.slice(0, 3).join(', ')}${invalidUrls.length > 3 ? '...' : ''}` 
      }, { status: 400 });
    }

    // Validate pattern
    const validation = defaultUrlMatcher.validatePattern(pattern, rule_type);
    if (!validation.isValid) {
      return NextResponse.json({ 
        error: `Invalid pattern: ${validation.errors.join(', ')}` 
      }, { status: 400 });
    }

    // Test the pattern against all URLs
    const testResult: PatternTestResult = defaultUrlMatcher.testPattern(
      pattern,
      rule_type,
      test_urls
    );

    return NextResponse.json(testResult);
  } catch (error) {
    console.error('Error in POST /api/predefined-questions/test-pattern:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sampleUrl = searchParams.get('sampleUrl');

    // Get pattern suggestions
    const suggestions = defaultUrlMatcher.getPatternSuggestions(sampleUrl || undefined);

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error('Error in GET /api/predefined-questions/test-pattern:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}