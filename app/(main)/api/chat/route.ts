import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { buildSystemPrompt } from '@/lib/instructions';
import { StructuredAIResponse, AIResponseParseResult } from '@/types/training';
import { enforceLanguageInMessage, addLanguageToSystemPrompt } from '@/lib/ai/language';
import { selectRelevantContext, buildOptimizedContext } from '@/lib/ai/context';
import { findMostRelevantProduct } from '@/lib/ai/conversation';
import { findBestProductMatches } from '@/lib/ai/product-matching';
import { validateAIResponse } from '@/lib/ai/response-validator';
import { detectLanguageWithoutRedis } from '@/lib/ai/simple-language';
import { chatRequestSchema, validateRequest, sanitizeString, createValidationErrorResponse } from '@/lib/validation';

export async function POST(request: NextRequest) {
  try {
    console.log('🚀 Chat API: Starting request processing');
    
    // Parse and validate request body
    const body = await request.json();
    console.log('📝 Chat API: Request body parsed', { messageLength: body.message?.length, siteId: body.siteId });
    
    // Validate input using Zod schema
    const validation = validateRequest(chatRequestSchema, body);
    if (!validation.success) {
      return createValidationErrorResponse(validation.error);
    }

    const { message, siteId, conversationHistory = [], sessionId } = validation.data;
    console.log('✅ Chat API: Validation passed');

    // Sanitize message content
    const sanitizedMessage = sanitizeString(message);
    console.log('🧹 Chat API: Message sanitized');
    
    // Sanitize conversation history
    const sanitizedHistory = conversationHistory.map(msg => ({
      role: msg.role,
      content: sanitizeString(msg.content)
    }));

    const { userId } = await auth();
    
    // Get headers
    const xUserId = request.headers.get('x-user-id');
    
    // Initialize Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
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
    }
    
    // Generate AI response using OpenAI with sanitized data
    const response = await generateChatResponse(sanitizedMessage, sanitizedHistory, siteId, chatSessionId || undefined);
    
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
        
        // Log assistant response
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
    
    return NextResponse.json(responseWithSession, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    });
    
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function generateChatResponse(message: string, conversationHistory: { role: string; content: string }[], siteId: string, sessionId?: string) {
  try {
    // Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
      return getFallbackResponse(message);
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    // Fetch data with smart context selection (no caching to avoid Redis issues)
    const [
      relevantContext,
      trainingMaterials,
      affiliateLinks,
      chatSettings
    ] = await Promise.all([
      // Select relevant training materials based on the query with conversation history
      selectRelevantContext(message, siteId, 7, conversationHistory),
      
      // Fetch all training materials for product matching
      supabase
        .from('training_materials')
        .select('title, metadata')
        .eq('site_id', siteId)
        .eq('scrape_status', 'success')
        .then(result => {
          if (result.error) throw result.error;
          return result.data || [];
        }),
      
      // Fetch affiliate links for this site
      supabase
        .from('affiliate_links')
        .select('id, url, title, description, product_id, aliases, image_url, button_text, site_id, created_at, updated_at')
        .eq('site_id', siteId)
        .then(result => {
          if (result.error) throw result.error;
          return result.data || [];
        }),
      
      // Fetch chat settings for custom instructions and preferred language
      supabase
        .from('chat_settings')
        .select('instructions, preferred_language')
        .eq('site_id', siteId)
        .single()
        .then(result => {
          // Handle "no rows" error as success
          if (result.error && result.error.code !== 'PGRST116') throw result.error;
          return result.data;
        })
    ]);

    // Build training context from the smart context selection
    const trainingContext = buildOptimizedContext(relevantContext);
    
    // Debug: Log training context availability
    console.log(`🔍 Training Context: ${trainingContext ? trainingContext.length : 0} characters, ${relevantContext.length} materials selected`);
    if (trainingContext.length < 100) {
      console.warn('⚠️ Very little training context available - AI may not have enough information');
    }

    // Detect language from user message with simple session memory (no Redis)
    const cachedLanguageResult = await detectLanguageWithoutRedis(
      sessionId || 'anonymous',
      message,
      chatSettings?.preferred_language
    );
    
    // Convert to expected format for compatibility
    const detectedLanguage = {
      name: cachedLanguageResult.name,
      code: cachedLanguageResult.code,
      confidence: cachedLanguageResult.confidence,
      instruction: `You must respond in ${cachedLanguageResult.name}.`
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
    
    // Add explicit warning if no training context available
    if (trainingContext.length < 50) {
      systemPrompt += '\n\n⚠️ WARNING: Very limited or no training materials provided. You MUST refuse to answer questions as you have no information to work with.';
    }
    
    // Enforce language in user message
    const languageEnforcedMessage = enforceLanguageInMessage(message, detectedLanguage);
    
    // Build final system message content
    const finalSystemContent = systemPrompt + trainingContext + affiliateContext + `\n\nSite ID: ${siteId}`;
    
    // Debug: Log system prompt length and key parts
    console.log(`📝 System Prompt: ${systemPrompt.length} chars, Training: ${trainingContext.length} chars, Final: ${finalSystemContent.length} chars`);
    
    // Debug: Log if critical rule is in the prompt
    const hasCriticalRule = finalSystemContent.includes('🚨 CRITICAL RULE');
    const hasTrainingMaterials = finalSystemContent.includes('Relevant Training Materials:');
    console.log(`🔍 Debug: Critical rule present: ${hasCriticalRule}, Training materials present: ${hasTrainingMaterials}`);
    
    // Debug: Log first 500 chars of what we're sending to AI
    console.log(`🤖 First 500 chars sent to AI:`, finalSystemContent.substring(0, 500));
    
    // Build the conversation messages for OpenAI
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: finalSystemContent
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

    // Call OpenAI API directly
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages,
      max_tokens: 500,
      temperature: 0.7,
      stream: false,
      response_format: { type: "json_object" }
    });

    const rawResponse = completion.choices[0]?.message?.content;
    
    // Debug: Log AI's raw response
    console.log(`🤖 AI Raw Response:`, rawResponse?.substring(0, 300));
    
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
      
      // Helper function to check if product is relevant to user's query
      const isRelevantToQuery = (product: { title: string; product_id: string | null; aliases: string[] | null }, userMessage: string) => {
        const normalizedMessage = userMessage.toLowerCase();
        const productTerms: string[] = [
          product.title.toLowerCase(),
          product.product_id?.toLowerCase(),
          ...(product.aliases || []).map(a => a?.toLowerCase())
        ].filter((term): term is string => term !== null && term !== undefined);
        
        return productTerms.some(term => normalizedMessage.includes(term));
      };
      
      // If AI specified specific products, use smart matching service
      if (structuredResponse.specific_products && structuredResponse.specific_products.length > 0) {
        console.log('🎯 Product Box Matching - AI specified products:', structuredResponse.specific_products);
        
        const productMatches = findBestProductMatches(
          structuredResponse.specific_products,
          affiliateLinks,
          {
            maxResults: structuredResponse.max_products || 3,
            minConfidence: 0.7, // Higher confidence to prevent wrong products
            conversationContext: {
              currentMessage: message,
              history: conversationHistory
            }
          }
        );
        
        if (productMatches.length > 0) {
          // Filter matches to only include products relevant to the user's query
          const relevantMatches = productMatches.filter(match => 
            isRelevantToQuery(match.product, message)
          );
          
          if (relevantMatches.length > 0) {
            linksToShow = relevantMatches.map(match => match.product);
            console.log(`✅ Product Box Matching - Showing ${linksToShow.length} query-relevant products`);
          } else {
            console.log('❌ Product Box Matching - No matches relevant to user query, showing message only');
            // Don't show products if none are relevant to the user's specific question
            return {
              type: 'message',
              message: structuredResponse.message
            };
          }
        } else {
          console.log('❌ Product Box Matching - No high-confidence matches found, showing message only');
          // When AI specifies products but we can't find good matches, don't fall back to random products
          return {
            type: 'message',
            message: structuredResponse.message
          };
        }
      } else {
        console.log('🎯 Product Box Matching - No specific products mentioned, using contextual matching');
        
        // When no specific products mentioned, use contextual matching
        const contextualMatches = findBestProductMatches(
          [], // Empty specific products array
          affiliateLinks,
          {
            maxResults: Math.min(structuredResponse.max_products || 1, 2),
            minConfidence: 0.4, // Moderate confidence for contextual matching
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
        
        // Helper function to check if product is relevant to user's query
        const isRelevantToQuery = (product: { title: string; product_id: string | null; aliases: string[] | null }, userMessage: string) => {
          const normalizedMessage = userMessage.toLowerCase();
          const productTerms: string[] = [
            product.title.toLowerCase(),
            product.product_id?.toLowerCase(),
            ...(product.aliases || []).map(a => a?.toLowerCase())
          ].filter((term): term is string => term !== null && term !== undefined);
          
          return productTerms.some(term => normalizedMessage.includes(term));
        };
        
        // First, try to match AI's specific products using smart matching service
        if (structuredResponse.specific_products && structuredResponse.specific_products.length > 0) {
          console.log('🔗 Simple Link Matching - AI specified products:', structuredResponse.specific_products);
          
          const productMatches = findBestProductMatches(
            structuredResponse.specific_products,
            affiliateLinks,
            {
              maxResults: 1, // Only need one link for simple link
              minConfidence: 0.6, // Higher confidence for simple links to prevent wrong products
              conversationContext: {
                currentMessage: message,
                history: conversationHistory
              }
            }
          );
          
          if (productMatches.length > 0) {
            // Check if the matched product is relevant to the user's query
            const relevantMatch = productMatches.find(match => 
              isRelevantToQuery(match.product, message)
            );
            
            if (relevantMatch) {
              selectedLink = relevantMatch.product;
              linkUrl = selectedLink.url;
              console.log(`✅ Simple Link Matching - Selected: ${selectedLink.title} (confidence: ${relevantMatch.confidence})`);
            } else {
              console.log('❌ Simple Link Matching - No matches relevant to user query');
            }
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
    return {
      type: 'message',
      message: structuredResponse.message
    };
    
  } catch (error) {
    console.error('OpenAI API error:', error);
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
function getFallbackResponseFromText(text: string, affiliateLinks: { title: string; description?: string; url: string; button_text?: string }[] = []) {
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
      image_url: ''
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