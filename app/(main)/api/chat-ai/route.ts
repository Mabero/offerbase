import { streamText, UIMessage, convertToModelMessages } from 'ai';
import { openai } from '@ai-sdk/openai';
import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { getAIInstructions } from '@/lib/instructions';
// Import for context handling

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  console.log('🎯 /api/chat-ai endpoint hit!');
  console.log('🎯 Request URL:', request.url);
  console.log('🎯 Request method:', request.method);
  
  try {
    // Parse the request body - AI SDK sends { messages: UIMessage[], siteId: string }
    const body = await request.json();
    console.log('🔍 Received request body:', JSON.stringify(body, null, 2));
    
    const { messages, siteId } = body;
    
    // Basic validation with detailed logging
    console.log('🔍 Validation check:', { 
      siteId: !!siteId, 
      siteIdValue: siteId,
      messages: messages?.length,
      messagesIsArray: Array.isArray(messages),
      bodyKeys: Object.keys(body)
    });
    
    if (!siteId || !messages || !Array.isArray(messages)) {
      console.error('❌ Invalid request format:', { 
        siteId: !!siteId, 
        siteIdValue: siteId,
        messages: messages?.length,
        messagesIsArray: Array.isArray(messages),
        bodyKeys: Object.keys(body)
      });
      return new Response(
        JSON.stringify({ error: 'Missing required fields: siteId and messages' }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    const { userId } = await auth();
    
    // Initialize Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    // Use vector search to get relevant context
    const { VectorSearchService } = await import('@/lib/embeddings/search');
    const searchService = new VectorSearchService();
    
    // Get conversation context from recent messages
    const conversationHistory = messages
      .slice(-3) // Last 3 messages
      .map((msg: any) => {
        // Extract text content from message parts
        if (typeof msg.content === 'string') return msg.content;
        if (msg.parts) {
          return msg.parts
            .filter((part: any) => part.type === 'text')
            .map((part: any) => part.text)
            .join(' ');
        }
        return '';
      })
      .filter(Boolean);
    
    // Get the current user message
    const currentQuery = messages[messages.length - 1]?.content || 
      messages[messages.length - 1]?.parts?.find((p: any) => p.type === 'text')?.text || '';
    
    console.log('🔍 Vector Search Debug:');
    console.log('  - Current query:', currentQuery);
    console.log('  - Conversation history:', conversationHistory);
    console.log('  - Site ID:', siteId);
    
    // Perform hybrid search with reranking
    const searchResults = await searchService.searchWithContext(
      currentQuery,
      conversationHistory,
      siteId,
      {
        vectorWeight: 0.6, // Balance vector and keyword search
        limit: 10, // Get more chunks to work with
        useReranker: false, // Disable reranker for debugging (since no Cohere key)
        similarityThreshold: 0.1, // Lower threshold to get more results
      }
    );
    
    console.log('📊 Search Results:');
    console.log('  - Results found:', searchResults.length);
    searchResults.forEach((r, i) => {
      console.log(`  - Result ${i + 1}: similarity=${r.similarity.toFixed(3)}, source="${r.materialTitle}"`);
      console.log(`    Content preview: "${r.content.substring(0, 100)}..."`);
    });
    
    // Build context from search results
    const context = searchResults.length > 0
      ? searchResults
          .map(r => `[Source: ${r.materialTitle}]\n${r.content}`)
          .join('\n\n---\n\n')
      : 'No relevant training materials found for this query.';
    
    console.log('📝 Context being sent to AI:');
    console.log('  - Context length:', context.length);
    console.log('  - Context preview:', context.substring(0, 200) + '...');

    // Store search results for product recommendation
    const retrievedChunks = searchResults.map(r => ({
      content: r.content,
      materialTitle: r.materialTitle
    }));
    
    // Get AI instructions from centralized location
    const baseInstructions = getAIInstructions();
    
    const fullSystemPrompt = `${baseInstructions}\n\nRelevant Training Materials:\n${context}`;
    
    // Convert UI messages to model messages and add system prompt
    const modelMessages = [
      { role: 'system' as const, content: fullSystemPrompt },
      ...convertToModelMessages(messages)
    ];
    
    // Stream the response using AI SDK - products handled separately
    const result = streamText({
      model: openai('gpt-4o-mini'),
      messages: modelMessages,
      temperature: 0.7,
      maxOutputTokens: 1000,
    });

    // Return the UI message stream response
    const streamResponse = result.toUIMessageStreamResponse();
    
    return streamResponse;
    
  } catch (error) {
    console.error('Chat API error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}