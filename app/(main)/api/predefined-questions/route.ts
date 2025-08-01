import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { 
  CreatePredefinedQuestionRequest, 
  PredefinedQuestionsApiResponse,
  PredefinedQuestionFilters 
} from '@/types/predefined-questions';

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100); // Max 100 items
    const search = searchParams.get('search');
    const isActive = searchParams.get('is_active');
    const isSiteWide = searchParams.get('is_site_wide');

    if (!siteId) {
      return NextResponse.json({ error: 'Site ID is required' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    
    // First verify the site belongs to the user
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('id')
      .eq('id', siteId)
      .eq('user_id', userId)
      .single();

    if (siteError || !site) {
      return NextResponse.json({ error: 'Site not found or unauthorized' }, { status: 404 });
    }

    // Build query with filters
    let query = supabase
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
      .eq('site_id', siteId);

    // Apply filters
    if (search) {
      query = query.or(`question.ilike.%${search}%,answer.ilike.%${search}%`);
    }
    
    if (isActive !== null && isActive !== '') {
      query = query.eq('is_active', isActive === 'true');
    }
    
    if (isSiteWide !== null && isSiteWide !== '') {
      query = query.eq('is_site_wide', isSiteWide === 'true');
    }

    // Get total count for pagination
    const { count } = await supabase
      .from('predefined_questions')
      .select('*', { count: 'exact', head: true })
      .eq('site_id', siteId);

    // Apply pagination and ordering
    const { data: questions, error } = await query
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (error) {
      console.error('Error fetching predefined questions:', error);
      return NextResponse.json({ error: 'Failed to fetch predefined questions' }, { status: 500 });
    }

    const response: PredefinedQuestionsApiResponse = {
      questions: questions || [],
      total: count || 0,
      page,
      limit
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in GET /api/predefined-questions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: CreatePredefinedQuestionRequest & { siteId: string } = await request.json();
    
    const { 
      siteId, 
      question, 
      answer, 
      priority = 0, 
      is_site_wide = false, 
      is_active = true,
      url_rules = []
    } = body;

    // Validation
    if (!siteId || !question?.trim()) {
      return NextResponse.json({ 
        error: 'Site ID and question are required' 
      }, { status: 400 });
    }

    if (question.trim().length > 500) {
      return NextResponse.json({ 
        error: 'Question must be 500 characters or less' 
      }, { status: 400 });
    }

    if (answer && answer.trim().length > 2000) {
      return NextResponse.json({ 
        error: 'Answer must be 2000 characters or less' 
      }, { status: 400 });
    }

    if (priority < 0 || priority > 100) {
      return NextResponse.json({ 
        error: 'Priority must be between 0 and 100' 
      }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    
    // First verify the site belongs to the user
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('id')
      .eq('id', siteId)
      .eq('user_id', userId)
      .single();

    if (siteError || !site) {
      return NextResponse.json({ error: 'Site not found or unauthorized' }, { status: 404 });
    }

    // Create the question
    const { data: newQuestion, error: questionError } = await supabase
      .from('predefined_questions')
      .insert([{
        site_id: siteId,
        question: question.trim(),
        answer: answer?.trim() || null, // Allow null for optional answer
        priority,
        is_site_wide,
        is_active
      }])
      .select('id, question, answer, priority, is_site_wide, is_active, created_at, updated_at')
      .single();

    if (questionError) {
      console.error('Error creating predefined question:', questionError);
      return NextResponse.json({ error: 'Failed to create predefined question' }, { status: 500 });
    }

    // Create URL rules if provided
    let urlRules: Array<{
      id: string;
      question_id: string;
      rule_type: string;
      pattern: string;
      is_active: boolean;
      created_at: string;
      updated_at: string;
    }> = [];
    if (url_rules.length > 0) {
      const rulesData = url_rules.map(rule => ({
        question_id: newQuestion.id,
        rule_type: rule.rule_type,
        pattern: rule.pattern.trim(),
        is_active: rule.is_active !== false // Default to true
      }));

      const { data: createdRules, error: rulesError } = await supabase
        .from('question_url_rules')
        .insert(rulesData)
        .select('id, question_id, rule_type, pattern, is_active, created_at, updated_at');

      if (rulesError) {
        console.error('Error creating URL rules:', rulesError);
        // Don't fail the entire request, but log the error
      } else {
        urlRules = createdRules || [];
      }
    }

    const questionWithRules = {
      ...newQuestion,
      question_url_rules: urlRules
    };

    return NextResponse.json({ question: questionWithRules }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/predefined-questions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}