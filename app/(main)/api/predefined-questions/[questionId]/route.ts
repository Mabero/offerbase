import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { UpdatePredefinedQuestionRequest } from '@/types/predefined-questions';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ questionId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { questionId } = await context.params;
    const supabase = createSupabaseAdminClient();
    
    // Fetch question with ownership verification
    const { data: question, error } = await supabase
      .from('predefined_questions')
      .select(`
        id,
        question,
        answer,
        priority,
        is_site_wide,
        is_active,
        created_at,
        updated_at,
        sites!inner (
          id,
          user_id
        ),
        question_url_rules (
          id,
          rule_type,
          pattern,
          is_active,
          created_at,
          updated_at
        )
      `)
      .eq('id', questionId)
      .eq('sites.user_id', userId)
      .single();

    if (error || !question) {
      return NextResponse.json({ error: 'Question not found or unauthorized' }, { status: 404 });
    }

    // Remove the sites relation from the response
    const { sites, ...questionData } = question;

    return NextResponse.json({ question: questionData });
  } catch (error) {
    console.error('Error in GET /api/predefined-questions/[questionId]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ questionId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { questionId } = await context.params;
    const body: UpdatePredefinedQuestionRequest = await request.json();
    
    const { 
      question, 
      answer, 
      priority, 
      is_site_wide, 
      is_active,
      url_rules 
    } = body;

    // Validation
    if (question !== undefined && (!question.trim() || question.trim().length > 500)) {
      return NextResponse.json({ 
        error: 'Question must be between 1 and 500 characters' 
      }, { status: 400 });
    }

    if (answer !== undefined && answer.trim().length > 2000) {
      return NextResponse.json({ 
        error: 'Answer must be 2000 characters or less' 
      }, { status: 400 });
    }

    if (priority !== undefined && (priority < 0 || priority > 100)) {
      return NextResponse.json({ 
        error: 'Priority must be between 0 and 100' 
      }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    
    // First verify ownership
    const { data: existingQuestion, error: verifyError } = await supabase
      .from('predefined_questions')
      .select(`
        id,
        sites!inner (
          id,
          user_id
        )
      `)
      .eq('id', questionId)
      .eq('sites.user_id', userId)
      .single();

    if (verifyError || !existingQuestion) {
      return NextResponse.json({ error: 'Question not found or unauthorized' }, { status: 404 });
    }

    // Build update object
    interface UpdateData {
      updated_at: string;
      question?: string;
      answer?: string | null;
      priority?: number;
      is_site_wide?: boolean;
      is_active?: boolean;
    }
    
    const updateData: UpdateData = {
      updated_at: new Date().toISOString()
    };

    if (question !== undefined) updateData.question = question.trim();
    if (answer !== undefined) updateData.answer = answer.trim() || null; // Allow null for optional answer
    if (priority !== undefined) updateData.priority = priority;
    if (is_site_wide !== undefined) updateData.is_site_wide = is_site_wide;
    if (is_active !== undefined) updateData.is_active = is_active;

    // Update the question
    const { data: updatedQuestion, error: updateError } = await supabase
      .from('predefined_questions')
      .update(updateData)
      .eq('id', questionId)
      .select('id, question, answer, priority, is_site_wide, is_active, created_at, updated_at')
      .single();

    if (updateError) {
      console.error('Error updating predefined question:', updateError);
      return NextResponse.json({ error: 'Failed to update predefined question' }, { status: 500 });
    }

    // Handle URL rules updates if provided
    let urlRules = [];
    if (url_rules) {
      try {
        // Get existing rules
        const { data: existingRules } = await supabase
          .from('question_url_rules')
          .select('id')
          .eq('question_id', questionId);

        const existingRuleIds = new Set(existingRules?.map(r => r.id) || []);

        // Process rules updates
        const rulesToCreate = [];
        const rulesToUpdate = [];
        const rulesToDelete = [];

        for (const rule of url_rules) {
          if (rule._delete) {
            if (rule.id) {
              rulesToDelete.push(rule.id);
            }
          } else if (rule.id && existingRuleIds.has(rule.id)) {
            // Update existing rule
            rulesToUpdate.push({
              id: rule.id,
              rule_type: rule.rule_type,
              pattern: rule.pattern.trim(),
              is_active: rule.is_active !== false,
              updated_at: new Date().toISOString()
            });
          } else {
            // Create new rule
            rulesToCreate.push({
              question_id: questionId,
              rule_type: rule.rule_type,
              pattern: rule.pattern.trim(),
              is_active: rule.is_active !== false
            });
          }
        }

        // Execute rule operations in parallel
        const operations = [];

        if (rulesToDelete.length > 0) {
          operations.push(
            supabase
              .from('question_url_rules')
              .delete()
              .in('id', rulesToDelete)
          );
        }

        if (rulesToCreate.length > 0) {
          operations.push(
            supabase
              .from('question_url_rules')
              .insert(rulesToCreate)
              .select('id, rule_type, pattern, is_active, created_at, updated_at')
          );
        }

        // Update rules one by one (batch update not well supported)
        for (const rule of rulesToUpdate) {
          const { id, ...updateData } = rule;
          operations.push(
            supabase
              .from('question_url_rules')
              .update(updateData)
              .eq('id', id)
              .select('id, rule_type, pattern, is_active, created_at, updated_at')
          );
        }

        // Execute all operations
        const results = await Promise.allSettled(operations);
        
        // Get all current rules after updates
        const { data: currentRules } = await supabase
          .from('question_url_rules')
          .select('id, rule_type, pattern, is_active, created_at, updated_at')
          .eq('question_id', questionId)
          .eq('is_active', true);

        urlRules = currentRules || [];

      } catch (rulesError) {
        console.error('Error updating URL rules:', rulesError);
        // Don't fail the entire request, but log the error
      }
    } else {
      // If no rules update provided, fetch existing rules
      const { data: currentRules } = await supabase
        .from('question_url_rules')
        .select('id, rule_type, pattern, is_active, created_at, updated_at')
        .eq('question_id', questionId);

      urlRules = currentRules || [];
    }

    const questionWithRules = {
      ...updatedQuestion,
      question_url_rules: urlRules
    };

    return NextResponse.json({ question: questionWithRules });
  } catch (error) {
    console.error('Error in PUT /api/predefined-questions/[questionId]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ questionId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { questionId } = await context.params;
    const supabase = createSupabaseAdminClient();
    
    // First verify ownership
    const { data: question, error: verifyError } = await supabase
      .from('predefined_questions')
      .select(`
        id,
        sites!inner (
          id,
          user_id
        )
      `)
      .eq('id', questionId)
      .eq('sites.user_id', userId)
      .single();

    if (verifyError || !question) {
      return NextResponse.json({ error: 'Question not found or unauthorized' }, { status: 404 });
    }

    // Delete the question (URL rules will be deleted automatically due to CASCADE)
    const { error: deleteError } = await supabase
      .from('predefined_questions')
      .delete()
      .eq('id', questionId);

    if (deleteError) {
      console.error('Error deleting predefined question:', deleteError);
      return NextResponse.json({ error: 'Failed to delete predefined question' }, { status: 500 });
    }

    return NextResponse.json({ message: 'Question deleted successfully' });
  } catch (error) {
    console.error('Error in DELETE /api/predefined-questions/[questionId]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}