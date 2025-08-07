import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { buildSystemPrompt } from '@/lib/instructions';
import { StructuredAIResponse, AIResponseParseResult } from '@/types/training';
import { selectRelevantContext, buildOptimizedContext } from '@/lib/ai/context';
import { validateAIResponse } from '@/lib/ai/response-validator';
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
      console.error('🚨 Validation Error:', validation.error, 'Body received:', JSON.stringify(body, null, 2));
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
    
    // Fetch data with simple context selection (no caching to avoid Redis issues)
    const [
      relevantContext,
      trainingMaterials,
      affiliateLinks,
      chatSettings
    ] = await Promise.all([
      // Select relevant training materials based on the query
      selectRelevantContext(message, siteId, 10),
      
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
    
    // More intelligent handling of limited context
    let contextGuidance = '';
    if (trainingContext.length < 100) {
      console.warn('⚠️ Limited training context available - using flexible interpretation');
      contextGuidance = '\n\nNote: Limited training materials available. Use intelligent interpretation to provide helpful responses based on available information.';
    } else if (trainingContext.length < 500) {
      contextGuidance = '\n\nNote: Moderate amount of training materials available. Make reasonable inferences where appropriate.';
    }

    // Language will be handled naturally by AI based on user input and preferences
    console.log(`Session ${sessionId}: AI will naturally respond in user's language${chatSettings?.preferred_language ? ` (site preference: ${chatSettings.preferred_language})` : ''}`);
    
    // Build domain-aware product catalog for AI-first selection
    let productCatalog = '';
    if (affiliateLinks && affiliateLinks.length > 0) {
      productCatalog = '\n\nProduct Catalog with Domain Context (use product IDs for recommendations):\n';
      affiliateLinks.forEach((link) => {
        // Try to find related training material to understand product domain context
        const relatedMaterial = trainingMaterials?.find(material => {
          const materialTitle = material.title?.toLowerCase() || '';
          const productTitle = link.title.toLowerCase();
          
          // Check if training material and product are related
          return materialTitle.includes(productTitle.split(' ')[0]) || 
                 productTitle.includes(materialTitle.split(' ')[0]) ||
                 (material.metadata?.url && link.url && 
                  extractDomainFromUrl(material.metadata.url as string) === extractDomainFromUrl(link.url));
        });
        
        // Add domain context to product listing
        let contextInfo = '';
        if (relatedMaterial?.metadata?.url) {
          const domain = extractDomainFromUrl(relatedMaterial.metadata.url as string);
          if (domain) {
            const company = domain.replace(/\.(com|org|net|io|co|app|dev)$/, '').replace(/www\./, '');
            contextInfo = ` [Domain: ${domain} | Company: ${company}]`;
          }
        }
        
        productCatalog += `ID: ${link.id} | Title: ${link.title}${contextInfo} | Description: ${link.description || 'No description'}\n`;
      });
      productCatalog += '\nIMPORTANT: Only recommend products that are contextually relevant to the user\'s question and match the domain/company being discussed.';
    }
    
    // Helper function to extract domain from URL
    function extractDomainFromUrl(url: string): string {
      try {
        return new URL(url).hostname.replace('www.', '');
      } catch {
        const match = url.match(/(?:https?:\/\/)?(?:www\.)?([^\/\?]+)/);
        return match ? match[1] : '';
      }
    }
    
    // Build system prompt with AI-native language handling
    let systemPrompt = buildSystemPrompt(
      chatSettings?.instructions || '',
      undefined, // contextInfo
      'moderate', // strictnessLevel
      chatSettings?.preferred_language // preferredLanguage
    );
    
    // Add context guidance instead of strict refusal
    systemPrompt += contextGuidance;
    
    // Build final system message content
    const finalSystemContent = systemPrompt + trainingContext + productCatalog + `\n\nSite ID: ${siteId}`;
    
    // Debug: Log system prompt length and key parts
    console.log(`📝 System Prompt: ${systemPrompt.length} chars, Training: ${trainingContext.length} chars, Final: ${finalSystemContent.length} chars`);
    
    // Debug: Log validation approach
    const hasIntelligentGuidelines = finalSystemContent.includes('INTELLIGENT CONTENT GUIDELINES');
    const hasTrainingMaterials = finalSystemContent.includes('Relevant Training Materials:');
    console.log(`🔍 Debug: Intelligent guidelines: ${hasIntelligentGuidelines}, Training materials present: ${hasTrainingMaterials}`);
    
    // Debug: Log first 500 chars of what we're sending to AI
    console.log(`🤖 First 500 chars sent to AI:`, finalSystemContent.substring(0, 500));
    
    // Debug: Log what training materials contain vs user question
    if (trainingContext.length > 0) {
      console.log(`📚 Training materials topics:`, trainingContext.substring(0, 200));
      console.log(`❓ User question:`, message);
    }
    
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
        content: message
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

    // Simple validation - trust AI to provide appropriate responses
    const validationResult = validateAIResponse(parseResult.structured!);
    
    if (!validationResult.isValid) {
      console.warn('⚠️ Basic structure validation failed, using fallback');
      return getFallbackResponseFromText(rawResponse, affiliateLinks || []);
    }

    const structuredResponse = validationResult.sanitizedResponse;
    
    // Handle AI-selected products (AI-first approach)
    if (structuredResponse.products && structuredResponse.products.length > 0) {
      console.log(`🤖 AI Selected Products: ${structuredResponse.products.join(', ')}`);
      
      // Find selected products by ID
      const selectedProducts = (affiliateLinks || []).filter(link => 
        structuredResponse.products!.includes(link.id)
      );
      
      if (selectedProducts.length > 0) {
        // Format products with image fallback from training materials
        const links = selectedProducts.map(product => {
          let imageUrl = product.image_url || '';
          
          // Fallback to training materials if no image_url
          if (!imageUrl && trainingMaterials) {
            const relatedMaterial = trainingMaterials.find(m => 
              m.title?.toLowerCase().includes(product.title.toLowerCase()) ||
              product.title.toLowerCase().includes(m.title?.toLowerCase() || '')
            );
            if (relatedMaterial?.metadata?.mainImage) {
              imageUrl = relatedMaterial.metadata.mainImage;
            }
          }
          
          return {
            name: product.title,
            description: product.description || 'Click to learn more',
            url: product.url,
            button_text: product.button_text || 'View Product',
            image_url: imageUrl
          };
        });
        
        return {
          type: 'links',
          message: structuredResponse.message,
          links: links
        };
      } else {
        console.warn(`⚠️ AI selected products not found in catalog: ${structuredResponse.products.join(', ')}`);
      }
    }

    // If AI decided to show simple link, validate URL before showing
    if (structuredResponse.show_simple_link) {
      const linkUrl = structuredResponse.link_url;
      
      // Strict validation: only allow real affiliate/product URLs
      if (linkUrl && isValidAffiliateUrl(linkUrl, affiliateLinks || [])) {
        return {
          type: 'simple_link',
          message: structuredResponse.message,
          simple_link: {
            text: structuredResponse.link_text || 'See more details',
            url: linkUrl
          }
        };
      } else {
        // Invalid or inappropriate URL - don't show link
        console.log(`🚫 Simple Link blocked: Invalid or non-affiliate URL: ${linkUrl}`);
        // Return just the message without any link
        return {
          type: 'message',
          message: structuredResponse.message
        };
      }
    }
    
    // Helper function to validate affiliate URLs
    function isValidAffiliateUrl(url: string, affiliateLinks: Array<{url?: string}>): boolean {
      if (!url || url.length === 0) return false;
      
      // Block internal/dashboard URLs
      if (url.includes('localhost') || 
          url.includes('127.0.0.1') ||
          url.includes('/dashboard') ||
          url.includes('/admin') ||
          url.includes('/api/') ||
          url.includes('[product_url_from_training_materials]') ||
          url.includes('example.com') ||
          url.includes('your-domain.com')) {
        return false;
      }
      
      // Must be a real URL
      try {
        new URL(url);
      } catch {
        return false;
      }
      
      // Ideally should match one of our affiliate links
      const isAffiliate = affiliateLinks.some(link => 
        link.url && (link.url === url || url.includes(extractDomainFromUrl(link.url)))
      );
      
      // Allow if it's a known affiliate link OR a valid external URL
      const isValidExternal = url.startsWith('http') && !url.includes('localhost');
      
      return isAffiliate || isValidExternal;
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
    if (!parsed.message) {
      console.error('Invalid AI response structure:', parsed);
      return {
        success: false,
        error: 'Invalid response structure: missing message field',
        fallback_text: rawResponse
      };
    }
    
    const structuredResponse: StructuredAIResponse = {
      message: parsed.message,
      show_simple_link: parsed.show_simple_link || false,
      link_text: parsed.link_text || '',
      link_url: parsed.link_url || '',
      products: parsed.products || undefined
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