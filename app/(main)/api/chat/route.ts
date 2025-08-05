import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import OpenAI from 'openai';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { buildSystemPrompt } from '@/lib/instructions';
import { StructuredAIResponse, AIResponseParseResult } from '@/types/training';
import { enforceLanguageInMessage, addLanguageToSystemPrompt } from '@/lib/ai/language';
import { selectRelevantContext, buildOptimizedContext } from '@/lib/ai/context';
import { findMostRelevantProduct } from '@/lib/ai/conversation';
import { findBestProductMatches } from '@/lib/ai/product-matching';
import { validateAIResponse } from '@/lib/ai/response-validator';
import { getCachedData, getCacheKey, CACHE_TTL } from '@/lib/cache';
import { chatRequestSchema, validateRequest, sanitizeString, createValidationErrorResponse } from '@/lib/validation';
import { rateLimiter, createRateLimitResponse } from '@/lib/rate-limiting';
import { openAICircuitBreaker, createOpenAIFallback } from '@/lib/circuit-breaker';
import { detectLanguageWithCaching } from '@/lib/session-language';
import { handleAPIError, withRetry } from '@/lib/error-handling';

export async function POST(request: NextRequest) {
  try {
    // We'll apply rate limiting after we get the siteId from validation

    // Parse and validate request body
    const body = await request.json();
    
    // Validate input using Zod schema
    const validation = validateRequest(chatRequestSchema, body);
    if (!validation.success) {
      return createValidationErrorResponse(validation.error);
    }

    const { message, siteId, conversationHistory = [], sessionId } = validation.data;

    // Now apply rate limiting with the actual siteId
    const finalRateLimitResult = await rateLimiter.checkChatRateLimit(
      request,
      siteId,
      request.headers.get('x-user-id') || undefined
    );

    if (!finalRateLimitResult.success) {
      return createRateLimitResponse(finalRateLimitResult);
    }

    // Sanitize message content
    const sanitizedMessage = sanitizeString(message);
    
    // Sanitize conversation history
    const sanitizedHistory = conversationHistory.map(msg => ({
      role: msg.role,
      content: sanitizeString(msg.content)
    }));

    const { userId } = await auth();
    
    // Get headers
    const xUserId = request.headers.get('x-user-id');
    
    
    // Initialize Supabase for session tracking
    const supabase = createSupabaseAdminClient();
    let chatSessionId = sessionId;
    
    
    // Create or update chat session
    if (!chatSessionId) {
      // Create new session
      const { data: newSession, error: sessionError } = await supabase
        .from('chat_sessions')
        .insert([{
          site_id: siteId,
          user_session_id: userId || xUserId || 'anonymous_' + Date.now(),
          user_agent: request.headers.get('user-agent'),
          ip_address: request.headers.get('x-forwarded-for')?.split(',')[0] || 
                     request.headers.get('x-real-ip') || 
                     'unknown'
        }])
        .select('id')
        .single();
      
      if (sessionError) {
        console.error('Failed to create chat session:', sessionError);
        // Continue without session tracking
      } else {
        chatSessionId = newSession.id;
      }
    } else {
      // Verify session exists and update activity, or create new one if it doesn't exist
      const { data: existingSession, error: fetchError } = await supabase
        .from('chat_sessions')
        .select('id')
        .eq('id', chatSessionId)
        .single();
      
      if (fetchError || !existingSession) {
        // Session doesn't exist, create a new one
        const { data: newSession, error: sessionError } = await supabase
          .from('chat_sessions')
          .insert([{
            site_id: siteId,
            user_session_id: userId || xUserId || 'anonymous_' + Date.now(),
            user_agent: request.headers.get('user-agent'),
            ip_address: request.headers.get('x-forwarded-for')?.split(',')[0] || 
                       request.headers.get('x-real-ip') || 
                       'unknown'
          }])
          .select('id')
          .single();
        
        if (sessionError) {
          console.error('Failed to create new chat session:', sessionError);
        } else {
          chatSessionId = newSession.id;
        }
      } else {
        // Update existing session activity
        const { error: updateError } = await supabase
          .from('chat_sessions')
          .update({ 
            last_activity_at: new Date().toISOString()
          })
          .eq('id', chatSessionId);
        
        if (updateError) {
          console.warn('Failed to update chat session:', updateError);
        } else {
        }
      }
    }
    
    // Generate AI response using OpenAI with sanitized data
    const response = await generateChatResponse(sanitizedMessage, sanitizedHistory, siteId, chatSessionId);
    
    // Log chat messages if session tracking is available
    if (chatSessionId && supabase) {
      try {
        // Log user message
        await supabase
          .from('chat_messages')
          .insert([{
            chat_session_id: chatSessionId,
            role: 'user',
            content: sanitizedMessage
          }]);
        
        // Log assistant response - always store the complete structured response
        const responseMessage = JSON.stringify(response);
        await supabase
          .from('chat_messages')
          .insert([{
            chat_session_id: chatSessionId,
            role: 'assistant',
            content: responseMessage
          }]);
          
      } catch (error) {
        console.warn('Failed to log chat messages:', error);
      }
    }
    
    // Include session ID in response for frontend tracking
    const responseWithSession = {
      ...response,
      sessionId: chatSessionId
    };
    
    // Add rate limit headers to response
    const rateLimitHeaders = rateLimiter.createRateLimitHeaders(finalRateLimitResult);
    
    return NextResponse.json(responseWithSession, {
      headers: {
        ...rateLimitHeaders,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    });
    
  } catch (error) {
    // Use structured error handling
    return handleAPIError(error, request, {
      userId: request.headers.get('x-user-id') || undefined,
      sessionId: request.headers.get('x-session-id') || undefined,
      endpoint: '/api/chat',
    });
  }
}

async function generateChatResponse(message: string, conversationHistory: { role: string; content: string }[], siteId: string, sessionId?: string) {
  // PERFORMANCE MONITORING: Track response time
  const startTime = Date.now();
  const perfLog = {
    siteId,
    messageLength: message.length,
    historyLength: conversationHistory.length,
    startTime,
    dbQueryTime: 0,
    aiResponseTime: 0,
    totalTime: 0,
    cacheHitCount: 0,
    cacheMissCount: 0
  };

  try {
    // Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
      return getFallbackResponse(message);
    }

    const supabase = createSupabaseAdminClient();

    // Initialize OpenAI client inside the function to avoid build-time errors
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    // PERFORMANCE OPTIMIZATION: Run all database queries in parallel with caching and retry logic
    const dbStartTime = Date.now();
    const [
      relevantContext,
      trainingMaterials,
      affiliateLinks,
      chatSettings
    ] = await Promise.all([
      // Select relevant training materials based on the query with conversation history
      // NOTE: Context selection is query-specific, so we don't cache this
      withRetry(
        () => selectRelevantContext(message, siteId, 7, conversationHistory),
        { siteId, operation: 'selectRelevantContext' }
      ),
      
      // Fetch all training materials for product matching (cached)
      getCachedData(
        getCacheKey(siteId, 'training_materials'),
        () => withRetry(
          async () => {
            const { data, error } = await supabase
              .from('training_materials')
              .select('title, metadata')
              .eq('site_id', siteId)
              .eq('scrape_status', 'success');
            
            if (error) throw error;
            return data || [];
          },
          { siteId, operation: 'fetchTrainingMaterials' }
        ),
        CACHE_TTL.TRAINING_MATERIALS
      ),
      
      // Fetch affiliate links for this site (cached)
      getCachedData(
        getCacheKey(siteId, 'affiliate_links'),
        () => withRetry(
          async () => {
            const { data, error } = await supabase
              .from('affiliate_links')
              .select('id, url, title, description, product_id, aliases, image_url, button_text, site_id, created_at, updated_at')
              .eq('site_id', siteId);
            
            if (error) throw error;
            return data || [];
          },
          { siteId, operation: 'fetchAffiliateLinks' }
        ),
        CACHE_TTL.AFFILIATE_LINKS
      ),
      
      // Fetch chat settings for custom instructions and preferred language (cached)
      getCachedData(
        getCacheKey(siteId, 'chat_settings'),
        () => withRetry(
          async () => {
            const { data, error } = await supabase
              .from('chat_settings')
              .select('instructions, preferred_language')
              .eq('site_id', siteId)
              .single();
            
            // Handle "no rows" error as success
            if (error && error.code !== 'PGRST116') throw error;
            return data;
          },
          { siteId, operation: 'fetchChatSettings' }
        ),
        CACHE_TTL.CHAT_SETTINGS
      )
    ]);

    // Track database query performance
    perfLog.dbQueryTime = Date.now() - dbStartTime;

    // Build training context from the parallel query result
    const trainingContext = buildOptimizedContext(relevantContext);

    // Detect language from user message with session caching
    const cachedLanguageResult = await detectLanguageWithCaching(
      sessionId || 'anonymous',
      message,
      chatSettings?.preferred_language
    );
    
    // Convert to expected format for compatibility
    const detectedLanguage = {
      name: cachedLanguageResult.name,
      code: cachedLanguageResult.code,
      confidence: cachedLanguageResult.confidence
    };
    
    console.log(`Language for session ${sessionId}: ${detectedLanguage.name} (${detectedLanguage.code}) confidence: ${detectedLanguage.confidence} [${cachedLanguageResult.messageCount} msgs]${chatSettings?.preferred_language ? ` (preferred: ${chatSettings.preferred_language})` : ''}`);
    
    // Build affiliate links context
    let affiliateContext = '';
    if (affiliateLinks && affiliateLinks.length > 0) {
      affiliateContext = '\n\nAvailable Product Links:\n';
      affiliateLinks.forEach((link, index) => {
        affiliateContext += `${index + 1}. ${link.title} - ${link.description || 'No description'}\n`;
      });
    }
    
    // Build system prompt with language enforcement
    let systemPrompt = buildSystemPrompt(chatSettings?.instructions || '');
    systemPrompt = addLanguageToSystemPrompt(systemPrompt, detectedLanguage);
    
    // Enforce language in user message
    const languageEnforcedMessage = enforceLanguageInMessage(message, detectedLanguage);

    // Build the conversation messages for OpenAI
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: systemPrompt + trainingContext + affiliateContext + `\n\nSite ID: ${siteId}`
      },
      ...conversationHistory.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      })),
      {
        role: 'user',
        content: languageEnforcedMessage
      }
    ];

    // Call OpenAI API with circuit breaker protection
    const aiStartTime = Date.now();
    const openAIResult = await openAICircuitBreaker.execute(
      async () => {
        return await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: messages,
          max_tokens: 500,
          temperature: 0.7,
          stream: false,
          response_format: { type: "json_object" }
        });
      },
      createOpenAIFallback()
    );

    // Check if circuit breaker failed
    if (!openAIResult.success) {
      console.error('OpenAI circuit breaker failed:', openAIResult.error);
      
      // If fallback was used, return the fallback response
      if (openAIResult.fallbackUsed && openAIResult.data) {
        perfLog.aiResponseTime = Date.now() - aiStartTime;
        perfLog.totalTime = Date.now() - startTime;
        
        console.log(`🔄 OpenAI fallback used. Circuit state: ${openAIResult.circuitState}`);
        return openAIResult.data;
      }
      
      // Otherwise return error
      throw new Error(openAIResult.error || 'OpenAI service unavailable');
    }

    const completion = openAIResult.data!;
    const rawResponse = completion.choices[0]?.message?.content;
    
    // Track AI response performance
    perfLog.aiResponseTime = Date.now() - aiStartTime;
    
    if (!rawResponse) {
      throw new Error('No response from OpenAI');
    }

    // Parse the structured JSON response from AI
    const parseResult = parseAIResponse(rawResponse);
    
    if (!parseResult.success) {
      return getFallbackResponseFromText(rawResponse, affiliateLinks || []);
    }

    // Validate and sanitize the AI response
    const validationResult = validateAIResponse(parseResult.structured!, affiliateLinks || []);
    
    if (!validationResult.isValid) {
      console.error('❌ AI Response Validation Failed:', validationResult.errors);
      return getFallbackResponseFromText(rawResponse, affiliateLinks || []);
    }

    if (validationResult.warnings.length > 0) {
      console.warn('⚠️ AI Response Warnings:', validationResult.warnings);
    }

    const structuredResponse = validationResult.sanitizedResponse!;
    
    // If AI decided to show products, return with links
    if (structuredResponse.show_products && affiliateLinks && affiliateLinks.length > 0) {
      let linksToShow = [...affiliateLinks];
      
      // If AI specified specific products, use smart matching service
      if (structuredResponse.specific_products && structuredResponse.specific_products.length > 0) {
        console.log('🎯 Product Box Matching - AI specified products:', structuredResponse.specific_products);
        
        const productMatches = findBestProductMatches(
          structuredResponse.specific_products,
          affiliateLinks,
          {
            maxResults: structuredResponse.max_products || 3,
            minConfidence: 0.5, // Higher confidence for product boxes
            conversationContext: {
              currentMessage: message,
              history: conversationHistory
            }
          }
        );
        
        if (productMatches.length > 0) {
          linksToShow = productMatches.map(match => match.product);
          console.log(`✅ Product Box Matching - Showing ${linksToShow.length} matched products`);
        } else {
          console.log('❌ Product Box Matching - No exact matches, trying contextual fallback...');
          
          // Use contextual matching as fallback when no specific matches found
          const contextualMatches = findBestProductMatches(
            [], // Empty specific products array
            affiliateLinks,
            {
              maxResults: Math.min(structuredResponse.max_products || 1, 2), // Limit fallback results
              minConfidence: 0.3, // Lower confidence for fallback
              conversationContext: {
                currentMessage: message,
                history: conversationHistory
              }
            }
          );
          
          if (contextualMatches.length > 0) {
            linksToShow = contextualMatches.map(match => match.product);
            console.log(`🔄 Product Box Matching - Using contextual fallback: ${linksToShow.length} products`);
          } else {
            console.log('❌ Product Box Matching - No contextual matches found, showing first available product');
            // Final fallback: show first product to avoid empty response when AI explicitly requested products
            linksToShow = affiliateLinks.slice(0, 1);
          }
        }
      } else {
        console.log('🎯 Product Box Matching - No specific products mentioned, using contextual matching');
        
        // When no specific products mentioned, use contextual matching
        const contextualMatches = findBestProductMatches(
          [], // Empty specific products array
          affiliateLinks,
          {
            maxResults: Math.min(structuredResponse.max_products || 1, 2),
            minConfidence: 0.3,
            conversationContext: {
              currentMessage: message,
              history: conversationHistory
            }
          }
        );
        
        if (contextualMatches.length > 0) {
          linksToShow = contextualMatches.map(match => match.product);
          console.log(`✅ Product Box Matching - Contextual matches: ${linksToShow.length} products`);
        } else {
          // Show first product as final fallback when AI explicitly requested products
          linksToShow = affiliateLinks.slice(0, Math.min(structuredResponse.max_products || 1, 2));
          console.log(`🔄 Product Box Matching - Final fallback: showing first ${linksToShow.length} products`);
        }
      }
      
      // If no products to show, return a simple message instead of empty links
      if (linksToShow.length === 0) {
        return {
          type: 'message',
          message: structuredResponse.message
        };
      }
      
      // Limit to max_products or default to 1
      const maxProducts = structuredResponse.max_products || 1;
      const links = linksToShow.slice(0, maxProducts).map(link => {
        // Use the image_url from affiliate link first
        let imageUrl = link.image_url || '';
        
        // Fallback to training materials if no image_url
        if (!imageUrl && trainingMaterials) {
          const relatedMaterial = trainingMaterials.find(m => 
            m.title?.toLowerCase().includes(link.title.toLowerCase()) ||
            link.title.toLowerCase().includes(m.title?.toLowerCase() || '')
          );
          if (relatedMaterial?.metadata?.mainImage) {
            imageUrl = relatedMaterial.metadata.mainImage;
          }
        }
        
        return {
          name: link.title,
          description: link.description || 'Click to learn more',
          url: link.url,
          button_text: link.button_text || 'View Product',
          image_url: imageUrl
        };
      });
      
      return {
        type: 'links',
        message: structuredResponse.message,
        links: links
      };
    }

    // If AI decided to show simple link, return with simple link
    if (structuredResponse.show_simple_link) {
      let linkUrl = structuredResponse.link_url;
      let selectedLink = null;
      
      // If link_url is a placeholder or example URL, try to find actual product URL
      if ((!linkUrl || 
           linkUrl.includes('[product_url_from_training_materials]') || 
           linkUrl.includes('example.com') ||
           linkUrl.length === 0) && 
          affiliateLinks && affiliateLinks.length > 0) {
        
        // First, try to match AI's specific products using smart matching service
        if (structuredResponse.specific_products && structuredResponse.specific_products.length > 0) {
          console.log('🔗 Simple Link Matching - AI specified products:', structuredResponse.specific_products);
          
          const productMatches = findBestProductMatches(
            structuredResponse.specific_products,
            affiliateLinks,
            {
              maxResults: 1, // Only need one link for simple link
              minConfidence: 0.4, // Lower confidence for simple links (more flexible)
              conversationContext: {
                currentMessage: message,
                history: conversationHistory
              }
            }
          );
          
          if (productMatches.length > 0) {
            selectedLink = productMatches[0].product;
            linkUrl = selectedLink.url;
            console.log(`✅ Simple Link Matching - Selected: ${selectedLink.title} (confidence: ${productMatches[0].confidence})`);
          } else {
            console.log('❌ Simple Link Matching - No matches found above confidence threshold');
          }
        }
        
        // If no match from AI's specific products, use conversation context
        if (!selectedLink) {
          selectedLink = findMostRelevantProduct(message, conversationHistory, affiliateLinks);
          if (selectedLink) {
            linkUrl = selectedLink.url;
          }
        }
        
        // Final fallback to first product
        if (!linkUrl) {
          linkUrl = affiliateLinks[0].url;
        }
      }
      
      return {
        type: 'simple_link',
        message: structuredResponse.message,
        simple_link: {
          text: structuredResponse.link_text || 'See more details',
          url: linkUrl
        }
      };
    }

    // Return regular message response
    const response = {
      type: 'message',
      message: structuredResponse.message
    };

    // Log final performance metrics
    perfLog.totalTime = Date.now() - startTime;
    const isSlowResponse = perfLog.totalTime > 2000; // Warn if over 2 seconds
    
    console.log(`${isSlowResponse ? '🐌' : '🚀'} Chat API Performance:`, {
      siteId: perfLog.siteId,
      totalTime: `${perfLog.totalTime}ms`,
      dbQueryTime: `${perfLog.dbQueryTime}ms`,
      aiResponseTime: `${perfLog.aiResponseTime}ms`,
      messageLength: perfLog.messageLength,
      historyLength: perfLog.historyLength,
      efficiency: `${Math.round((perfLog.dbQueryTime + perfLog.aiResponseTime) / perfLog.totalTime * 100)}% active processing`,
      ...(isSlowResponse && { warning: 'Response time over 2s - consider optimizing' })
    });

    return response;
    
  } catch (error) {
    // Log error performance
    perfLog.totalTime = Date.now() - startTime;
    console.error('OpenAI API error:', error);
    console.log(`❌ Chat API Error Performance: ${perfLog.totalTime}ms (DB: ${perfLog.dbQueryTime}ms, AI: ${perfLog.aiResponseTime}ms)`);
    
    // Fallback to simple responses if OpenAI fails
    return getFallbackResponse(message);
  }
}

// Parse structured JSON response from AI
function parseAIResponse(rawResponse: string): AIResponseParseResult {
  try {
    const parsed = JSON.parse(rawResponse);
    
    // Validate required fields
    if (!parsed.message || (typeof parsed.show_products !== 'boolean' && typeof parsed.show_simple_link !== 'boolean')) {
      console.error('Invalid AI response structure:', parsed);
      return {
        success: false,
        error: 'Invalid response structure: missing required fields',
        fallback_text: rawResponse
      };
    }
    
    const structuredResponse: StructuredAIResponse = {
      message: parsed.message,
      show_products: parsed.show_products || false,
      show_simple_link: parsed.show_simple_link || false,
      link_text: parsed.link_text || '',
      link_url: parsed.link_url || '',
      specific_products: parsed.specific_products || [],
      max_products: parsed.max_products || 1,
      product_context: parsed.product_context || ''
    };
    
    return {
      success: true,
      structured: structuredResponse
    };
    
  } catch (error) {
    return {
      success: false,
      error: `JSON parse error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      fallback_text: rawResponse
    };
  }
}

// Fallback function that uses old keyword detection when structured parsing fails
function getFallbackResponseFromText(text: string, affiliateLinks: { title: string; description?: string; url: string }[] = []) {
  const lowerText = text.toLowerCase();
  
  // Check if text suggests products using keyword detection as fallback
  const shouldShowLinks = lowerText.includes('product') || 
                         lowerText.includes('recommend') || 
                         lowerText.includes('item') ||
                         lowerText.includes('option') ||
                         lowerText.includes('choice') ||
                         lowerText.includes('available');
  
  if (shouldShowLinks && affiliateLinks && affiliateLinks.length > 0) {
    const links = affiliateLinks.slice(0, 1).map(link => ({
      name: link.title,
      description: link.description || 'Click to learn more',
      url: link.url,
      button_text: link.button_text || 'View Product',
      image_url: '' // No placeholder - let component handle missing images
    }));
    
    return {
      type: 'links',
      message: text,
      links: links
    };
  }
  
  return {
    type: 'message',
    message: text
  };
}

function getFallbackResponse(message: string) {
  const lowerMessage = message.toLowerCase();
  
  // Generic fallback responses that work for any niche
  if (lowerMessage.includes('recommend') || lowerMessage.includes('suggest') || lowerMessage.includes('best')) {
    return {
      type: 'message',
      message: 'I\'d be happy to help you find the right solution. Could you tell me more about what you\'re looking for?'
    };
  }
  
  // Check for greeting
  if (lowerMessage.includes('hello') || lowerMessage.includes('hi') || lowerMessage.includes('hey')) {
    return {
      type: 'message',
      message: 'Hello! I\'m here to help you find the perfect products. What are you looking for today?'
    };
  }
  
  // Check for help
  if (lowerMessage.includes('help') || lowerMessage.includes('support')) {
    return {
      type: 'message',
      message: 'I\'m here to help! I can assist you with product recommendations, answer questions about our offerings, and help you find exactly what you need. What would you like to know?'
    };
  }
  
  // Default response
  const responses = [
    'That\'s an interesting question! Let me help you with that.',
    'I understand what you\'re looking for. Here\'s what I can suggest...',
    'Thank you for asking! I\'d be happy to help you find the right solution.',
    'Great question! Let me provide you with some helpful information.',
    'I can definitely help you with that. What specific details would you like to know?'
  ];
  
  const randomResponse = responses[Math.floor(Math.random() * responses.length)];
  
  return {
    type: 'message',
    message: randomResponse
  };
}

export async function GET() {
  return NextResponse.json({ 
    message: 'Chat API is running',
    timestamp: new Date().toISOString()
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}