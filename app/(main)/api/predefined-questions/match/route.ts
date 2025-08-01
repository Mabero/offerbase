import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { defaultUrlMatcher } from '@/lib/url-matcher';
import { UrlMatchApiResponse, PredefinedQuestionWithRules } from '@/types/predefined-questions';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    const pageUrl = searchParams.get('pageUrl');
    const maxResults = parseInt(searchParams.get('maxResults') || '4');

    // Validation
    if (!siteId) {
      return NextResponse.json({ error: 'Site ID is required' }, { status: 400 });
    }

    if (!pageUrl) {
      return NextResponse.json({ error: 'Page URL is required' }, { status: 400 });
    }

    // Validate URL format
    try {
      new URL(pageUrl);
    } catch {
      return NextResponse.json({ error: 'Invalid page URL format' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    
    // Note: This endpoint doesn't require authentication since it's called by the widget
    // The siteId itself provides the scoping needed
    
    // Fetch all active predefined questions for the site with their URL rules
    const { data: allQuestions, error } = await supabase
      .from('predefined_questions')
      .select(`
        id,
        site_id,
        question,
        answer,
        priority,
        is_site_wide,
        is_active,
        created_at,
        updated_at,
        question_url_rules (
          id,
          question_id,
          rule_type,
          pattern,
          is_active,
          created_at,
          updated_at
        )
      `)
      .eq('site_id', siteId)
      .eq('is_active', true)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching predefined questions for matching:', error);
      return NextResponse.json({ error: 'Failed to fetch questions' }, { status: 500 });
    }

    if (!allQuestions || allQuestions.length === 0) {
      const response: UrlMatchApiResponse = {
        questions: [],
        matchCount: 0,
        pageUrl
      };
      return NextResponse.json(response);
    }

    // Format questions for URL matching (ensure question_url_rules is always an array)
    const formattedQuestions: PredefinedQuestionWithRules[] = allQuestions.map(q => ({
      ...q,
      question_url_rules: q.question_url_rules || []
    }));

    // Use URL matcher to find matching questions
    const matchResult = defaultUrlMatcher.getUrlMatchResult(pageUrl, formattedQuestions, {
      maxResults: Math.min(maxResults, 10) // Cap at 10 for performance
    });

    // Convert to button format for the widget
    const questionButtons = matchResult.questions.slice(0, maxResults).map(match => ({
      id: match.question.id,
      question: match.question.question,
      answer: match.question.answer || '', // Make answer optional
      priority: match.question.priority
    }));

    const response: UrlMatchApiResponse = {
      questions: questionButtons,
      matchCount: matchResult.totalCount,
      pageUrl
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in GET /api/predefined-questions/match:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { siteId, pageUrl, maxResults = 4 } = body;

    // Validation
    if (!siteId) {
      return NextResponse.json({ error: 'Site ID is required' }, { status: 400 });
    }

    if (!pageUrl) {
      return NextResponse.json({ error: 'Page URL is required' }, { status: 400 });
    }

    // Validate URL format
    try {
      new URL(pageUrl);
    } catch {
      return NextResponse.json({ error: 'Invalid page URL format' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    
    // Fetch all active predefined questions for the site with their URL rules
    const { data: questionsWithRules, error: questionsError } = await supabase
      .from('predefined_questions')
      .select(`
        id,
        site_id,
        question,
        answer,
        priority,
        is_site_wide,
        is_active,
        created_at,
        updated_at,
        question_url_rules (
          id,
          question_id,
          rule_type,
          pattern,
          is_active,
          created_at,
          updated_at
        )
      `)
      .eq('site_id', siteId)
      .eq('is_active', true)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false });

    if (questionsError) {
      console.error('Error fetching predefined questions for matching:', questionsError);
      return NextResponse.json({ error: 'Failed to fetch questions' }, { status: 500 });
    }

    const allQuestions: PredefinedQuestionWithRules[] = (questionsWithRules || []).map(q => ({
      ...q,
      question_url_rules: q.question_url_rules || []
    }));

    if (allQuestions.length === 0) {
      const response: UrlMatchApiResponse = {
        questions: [],
        matchCount: 0,
        pageUrl
      };
      return NextResponse.json(response);
    }

    // Use URL matcher to find matching questions
    const matchResult = defaultUrlMatcher.getUrlMatchResult(pageUrl, allQuestions, {
      maxResults: Math.min(maxResults, 10) // Cap at 10 for performance
    });

    // Convert to button format for the widget
    const questionButtons = matchResult.questions.slice(0, maxResults).map(match => ({
      id: match.question.id,
      question: match.question.question,
      answer: match.question.answer || '', // Make answer optional
      priority: match.question.priority
    }));

    const response: UrlMatchApiResponse = {
      questions: questionButtons,
      matchCount: matchResult.totalCount,
      pageUrl
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in POST /api/predefined-questions/match:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}