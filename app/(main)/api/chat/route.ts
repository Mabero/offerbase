// FILE PURPOSE: Main chat API endpoint - processes user messages and returns AI responses with products
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
    const timestamp = new Date().toISOString();
    const environment = process.env.NODE_ENV || 'unknown';
    
    console.log('🔥 PRODUCTION DEBUG - Chat API Called:', { 
      timestamp, 
      environment, 
      userAgent: request.headers.get('user-agent')?.substring(0, 50) 
    });
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
    
    // Extract debug info from response and remove it from the response
    interface DebugInfo {
      hasRawResponse?: boolean;
      rawResponseLength?: number;
      hasReasoning?: boolean;
      complianceMarkers?: number;
    }
    const responseDebugInfo = (response as Record<string, unknown>)?._debugInfo as DebugInfo || {};
    delete (response as Record<string, unknown>)._debugInfo; // Clean up internal debug info
    
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
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Debug-Timestamp': timestamp,
        'X-Debug-Environment': environment,
        'X-Debug-API-Version': 'v2.1.0-with-reasoning',
        'X-Debug-Has-Reasoning': responseDebugInfo?.hasReasoning ? 'true' : 'false',
        'X-Debug-Response-Length': String(responseDebugInfo?.rawResponseLength || 0),
        'X-Debug-Compliance-Markers': String(responseDebugInfo?.complianceMarkers || 0)
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
      
      // Fetch chat settings for preferred language only
      supabase
        .from('chat_settings')
        .select('preferred_language')
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
    
    // Build contextually filtered product catalog - only relevant products
    let productCatalog = '';
    let relevantProducts: typeof affiliateLinks = []; // Move to broader scope
    
    if (affiliateLinks && affiliateLinks.length > 0) {
      // Extract domains from current training context to filter products
      const contextDomains = new Set<string>();
      const contextCompanies = new Set<string>();
      
      relevantContext.forEach(item => {
        if (item.sourceInfo?.domain) {
          contextDomains.add(item.sourceInfo.domain.toLowerCase());
        }
        if (item.sourceInfo?.company) {
          contextCompanies.add(item.sourceInfo.company.toLowerCase());
        }
      });
      
      console.log(`🔍 Context domains for product filtering:`, Array.from(contextDomains));
      console.log(`🔍 Context companies for product filtering:`, Array.from(contextCompanies));
      
      // Filter products with more inclusive logic - don't be too restrictive
      relevantProducts = affiliateLinks.filter(link => {
        // Strategy 1: Check if product matches any of the context domains/companies
        if (link.url) {
          const productDomain = extractDomainFromUrl(link.url).toLowerCase();
          if (contextDomains.has(productDomain)) {
            return true;
          }
        }
        
        // Strategy 2: Check if product title matches context companies
        const productTitleLower = link.title.toLowerCase();
        for (const company of contextCompanies) {
          const companyLower = company.toLowerCase();
          // Only exact word matches - no partial string includes
          if (companyLower.length > 2 && productTitleLower.includes(companyLower)) {
            return true;
          }
        }
        
        // Strategy 3: FALLBACK - If no training context matches, include products that semantically match user query
        // This ensures products are visible even without perfect training material context
        const userQuery = message.toLowerCase();
        const titleLower = link.title.toLowerCase();
        
        // Simple keyword matching - if user query contains words from product title (3+ chars)
        const productWords = titleLower.split(/\s+/).filter((word: string) => word.length >= 3);
        const queryWords = userQuery.split(/\s+/).filter((word: string) => word.length >= 3);
        
        const hasCommonWords = productWords.some((productWord: string) => 
          queryWords.some((queryWord: string) => 
            queryWord.includes(productWord) || productWord.includes(queryWord)
          )
        );
        
        if (hasCommonWords) {
          return true;
        }
        
        return false;
      });
      
      console.log(`🎯 Filtered products: ${relevantProducts.length} relevant out of ${affiliateLinks.length} total`);
      
      // Safety net: If filtering is too restrictive and no products match, show recent products
      // This ensures AI always has some products to choose from, preventing empty catalogs
      if (relevantProducts.length === 0 && affiliateLinks.length > 0) {
        console.log('⚠️ No products matched context - using recent products as safety net');
        relevantProducts = affiliateLinks.slice(0, 5); // Show up to 5 most recent products
      }
      
      if (relevantProducts.length > 0) {
        productCatalog = '\n\nRelevant Products (use product IDs for recommendations):\n';
        relevantProducts.forEach((link) => {
          const domain = link.url ? extractDomainFromUrl(link.url) : '';
          const contextInfo = domain ? ` [Domain: ${domain}]` : '';
          productCatalog += `ID: ${link.id} | Title: ${link.title}${contextInfo} | Description: ${link.description || 'No description'}\n`;
        });
        productCatalog += '\nNOTE: Only these products are contextually relevant to the current conversation.';
        console.log(`📦 PRODUCT CATALOG BUILT:`, productCatalog.substring(0, 300));
      } else {
        console.log('⚠️ No contextually relevant products found for current conversation');
      }
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
      '', // No custom instructions
      undefined, // contextInfo
      'moderate', // strictnessLevel
      chatSettings?.preferred_language // preferredLanguage
    );
    
    // CRITICAL: Verify key instructions are present before proceeding
    const requiredInstructions = [
      'NEVER POSITION YOURSELF AS A SPECIALIST',
      'WHEN DECLINING UNKNOWN TOPICS',
      'NO ALTERNATIVE SUGGESTIONS',
      'I don\'t have specific information about that topic'
    ];
    
    const missingInstructions = requiredInstructions.filter(instruction => 
      !systemPrompt.includes(instruction)
    );
    
    if (missingInstructions.length > 0) {
      console.error('🚨 CRITICAL ERROR: Missing required instructions:', missingInstructions);
      console.error('🚨 System prompt may be corrupted or outdated');
      console.error('🚨 First 500 chars of systemPrompt:', systemPrompt.substring(0, 500));
    } else {
      console.log('✅ All required instructions are present in system prompt');
    }
    
    // Add context guidance instead of strict refusal
    systemPrompt += contextGuidance;
    
    // Add environment debugging information
    const currentEnvironment = process.env.NODE_ENV || 'unknown';
    const environmentInfo = `\n\nEnvironment: ${currentEnvironment} | Site ID: ${siteId} | Debug Mode: Active`;
    
    // Build final system message content
    const finalSystemContent = systemPrompt + trainingContext + productCatalog + environmentInfo;
    
    // Debug: Log system prompt length and key parts
    console.log(`📝 System Prompt: ${systemPrompt.length} chars, Training: ${trainingContext.length} chars, Final: ${finalSystemContent.length} chars`);
    
    // Minimal debug for production performance
    console.log(`🔍 SYSTEM PROMPT: ${finalSystemContent.length} chars, Environment: ${currentEnvironment}`);
    
    // Debug: Log validation approach
    const hasIntelligentGuidelines = finalSystemContent.includes('INTELLIGENT CONTENT GUIDELINES');
    const hasTrainingMaterials = finalSystemContent.includes('Relevant Training Materials:');
    console.log(`🔍 Debug: Intelligent guidelines: ${hasIntelligentGuidelines}, Training materials present: ${hasTrainingMaterials}`);
    
    // Production: Log only system prompt length for performance
    // console.log(`🤖 FULL SYSTEM PROMPT SENT TO AI:`, finalSystemContent); // Disabled for speed
    
    // Critical Debug: Log specific rule sections for troubleshooting
    console.log('🔥 CRITICAL RULES CHECK:');
    console.log('- Multi-domain awareness rules present:', finalSystemContent.includes('CRITICAL: MULTI-DOMAIN AWARENESS RULES'));
    console.log('- Forbidden phrases section present:', finalSystemContent.includes('FORBIDDEN phrases'));
    console.log('- Generic response template present:', finalSystemContent.includes("I don't have specific information about that topic"));
    console.log('- Compliance markers present:', finalSystemContent.includes('Avoiding domain-specific language'));
    
    // PRODUCTION DEBUG: Enhanced instruction verification
    console.log('🚨 PRODUCTION INSTRUCTION DEBUG:');
    console.log('- NEVER POSITION YOURSELF AS A SPECIALIST present:', finalSystemContent.includes('NEVER POSITION YOURSELF AS A SPECIALIST'));
    console.log('- WHEN DECLINING UNKNOWN TOPICS present:', finalSystemContent.includes('WHEN DECLINING UNKNOWN TOPICS'));
    console.log('- NO ALTERNATIVE SUGGESTIONS present:', finalSystemContent.includes('NO ALTERNATIVE SUGGESTIONS'));
    console.log('- FORBIDDEN phrases list present:', finalSystemContent.includes('FORBIDDEN phrases:'));
    console.log('- Generic decline response present:', finalSystemContent.includes('I don\'t have specific information about that topic'));
    console.log('- Environment:', currentEnvironment);
    
    // Log critical instruction sections to verify they exist
    if (finalSystemContent.includes('NEVER POSITION YOURSELF AS A SPECIALIST')) {
      const specialistSection = finalSystemContent.match(/CRITICAL: NEVER POSITION YOURSELF AS A SPECIALIST:[\s\S]*?(?=\n\n|$)/);
      console.log('📋 SPECIALIST RULES SECTION:', specialistSection ? specialistSection[0].substring(0, 300) + '...' : 'NOT FOUND');
    }
    
    if (finalSystemContent.includes('WHEN DECLINING UNKNOWN TOPICS')) {
      const decliningSection = finalSystemContent.match(/CRITICAL: WHEN DECLINING UNKNOWN TOPICS[\s\S]*?(?=\n\n|$)/);
      console.log('📋 DECLINING RULES SECTION:', decliningSection ? decliningSection[0].substring(0, 300) + '...' : 'NOT FOUND');
    }
    
    // Debug: Log what training materials contain vs user question
    if (trainingContext.length > 0) {
      console.log(`📚 Training materials topics:`, trainingContext.substring(0, 500));
      console.log(`❓ User question:`, message);
      
      // Log training material titles/sources for debugging
      const materialTitles = relevantContext.map(item => item.title).join(', ');
      console.log(`📋 Training material titles included:`, materialTitles);
    } else {
      console.log(`⚠️ NO TRAINING MATERIALS FOUND for question:`, message);
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

  const completion = await openai.responses.create({
  model: 'gpt-5-nano',                 // use your exact Nano model id
  input: messages,                      // array of {role, content} is fine
  reasoning: { effort: 'minimal' },     // fastest thinking
  max_output_tokens: 500,               // increased for product recommendations + JSON
  text: {
    verbosity: 'low',
    format: { type: 'json_object' }     // moved from response_format
  },
  stream: false
});

const rawResponse = completion.output_text;
if (!rawResponse) {
  console.error('Unexpected response:', JSON.stringify(completion, null, 2).slice(0, 2000));
  throw new Error('No response from OpenAI');
}
    
    // Production: Minimal AI response logging for speed
    console.log(`🤖 AI response length:`, rawResponse?.length || 0, 'chars');
    
    // Simplified tracking for performance
    const hasReasoning = false;
    const complianceMarkers = 0;
    
    const debugInfo = {
      hasRawResponse: !!rawResponse,
      rawResponseLength: rawResponse?.length || 0,
      hasReasoning,
      complianceMarkers
    };

    if (!rawResponse) {
      console.error('Unexpected response shape:', JSON.stringify(completion, null, 2).slice(0, 2000));
      throw new Error('No response from OpenAI');
    }

    // Parse the structured JSON response from AI
    const parseResult = parseAIResponse(rawResponse);
    
    if (!parseResult.success) {
      console.error('❌ JSON Parse Failed:', parseResult.error);
      console.log('📝 Raw response that failed to parse:', rawResponse?.substring(0, 500));
      console.log('🔍 Using fallback response handler with affiliateLinks');
      return getFallbackResponseFromText(rawResponse, affiliateLinks || []);
    }

    // Simple validation - trust AI to provide appropriate responses
    const validationResult = validateAIResponse(parseResult.structured!);
    
    if (!validationResult.isValid) {
      console.warn('⚠️ Basic structure validation failed, using fallback');
      console.log('📝 Parsed structure that failed validation:', JSON.stringify(parseResult.structured, null, 2));
      return getFallbackResponseFromText(rawResponse, affiliateLinks || []);
    }

    const structuredResponse = validationResult.sanitizedResponse;
    
    // Handle AI-selected products (AI-first approach)
    if (structuredResponse.products && structuredResponse.products.length > 0) {
      console.log(`🤖 AI Selected Products: ${structuredResponse.products.join(', ')}`);
      
      // Find selected products by ID from FULL catalog (not filtered subset)
      // BUG FIX: Must look up IDs in affiliateLinks to get correct product info
      const selectedProducts = (affiliateLinks || []).filter(link => 
        structuredResponse.products!.includes(link.id)
      );
      
      if (selectedProducts.length > 0) {
        console.log(`✅ Found ${selectedProducts.length} products from catalog:`, selectedProducts.map(p => `${p.id}: ${p.title}`));
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
          links: links,
          _debugInfo: debugInfo
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
          },
          _debugInfo: debugInfo
        };
      } else {
        // Invalid or inappropriate URL - don't show link
        console.log(`🚫 Simple Link blocked: Invalid or non-affiliate URL: ${linkUrl}`);
        // Return just the message without any link
        return {
          type: 'message',
          message: structuredResponse.message,
          _debugInfo: debugInfo
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

    // Return regular message response with debug info
    return {
      type: 'message',
      message: structuredResponse.message,
      _debugInfo: debugInfo
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
    // Extract JSON from response that may contain reasoning text before JSON
    let jsonString = rawResponse.trim();
    
    // If response contains reasoning text before JSON, extract just the JSON part
    // More robust regex that finds the LAST complete JSON object
    const jsonMatch = rawResponse.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}$/);
    if (jsonMatch) {
      jsonString = jsonMatch[0];
      console.log(`🔍 Extracted JSON from reasoning response:`, jsonString.substring(0, 200));
    } else {
      // Fallback: Try to find any JSON-like structure
      const fallbackMatch = rawResponse.match(/\{[\s\S]*"message"[\s\S]*\}/);
      if (fallbackMatch) {
        jsonString = fallbackMatch[0];
        console.log(`🔍 Used fallback JSON extraction:`, jsonString.substring(0, 200));
      }
    }
    
    const parsed = JSON.parse(jsonString);
    
    // Handle both response formats:
    // Format 1: { "message": "...", "products": [...] }
    // Format 2: { "reasoning": "...", "response": { "message": "...", "products": [...] } }
    let actualResponse = parsed;
    if (parsed.response && typeof parsed.response === 'object') {
      console.log('🔍 Detected nested response format, extracting from "response" field');
      actualResponse = parsed.response;
    }
    
    // Validate required fields
    if (!actualResponse.message) {
      console.error('Invalid AI response structure:', parsed);
      return {
        success: false,
        error: 'Invalid response structure: missing message field',
        fallback_text: rawResponse
      };
    }
    
    const structuredResponse: StructuredAIResponse = {
      message: actualResponse.message,
      show_simple_link: actualResponse.show_simple_link || false,
      link_text: actualResponse.link_text || '',
      link_url: actualResponse.link_url || '',
      products: actualResponse.products || undefined
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
function getFallbackResponseFromText(text: string, affiliateLinks: { id?: string; title: string; description?: string; url: string; button_text?: string }[] = []) {
  const lowerText = text.toLowerCase();
  
  // Try to extract product IDs and message from the malformed response
  const productIdMatch = text.match(/"products"\s*:\s*\[\s*"([^"]+)"/);
  let extractedMessage = 'Here is my recommendation:';
  
  // Try to extract the actual message from nested response structure
  const messageMatch = text.match(/"response"\s*:\s*{[^}]*"message"\s*:\s*"([^"]+)"/);
  if (messageMatch) {
    extractedMessage = messageMatch[1];
    console.log(`🔧 FALLBACK: Extracted message from nested response: ${extractedMessage.substring(0, 100)}`);
  } else {
    // Fallback: try simple message extraction
    const simpleMessageMatch = text.match(/"message"\s*:\s*"([^"]+)"/);
    if (simpleMessageMatch) {
      extractedMessage = simpleMessageMatch[1];
      console.log(`🔧 FALLBACK: Extracted message from simple format: ${extractedMessage.substring(0, 100)}`);
    }
  }
  
  if (productIdMatch && affiliateLinks && affiliateLinks.length > 0) {
    const selectedId = productIdMatch[1];
    console.log(`🔧 FALLBACK: Extracted product ID from malformed response: ${selectedId}`);
    
    // Find the specific product by ID
    const selectedProduct = affiliateLinks.find(link => link.id === selectedId);
    if (selectedProduct) {
      console.log(`✅ FALLBACK: Found product with ID ${selectedId}: ${selectedProduct.title}`);
      return {
        type: 'links',
        message: extractedMessage,
        links: [{
          name: selectedProduct.title,
          description: selectedProduct.description || 'Click to learn more',
          url: selectedProduct.url,
          button_text: selectedProduct.button_text || 'View Product',
          image_url: ''
        }]
      };
    }
  }
  
  // Old behavior as last resort (but likely wrong)
  const shouldShowLinks = lowerText.includes('product') || 
                         lowerText.includes('recommend') || 
                         lowerText.includes('anbefal');
  
  if (shouldShowLinks && affiliateLinks && affiliateLinks.length > 0) {
    console.warn('⚠️ FALLBACK: Using first product as last resort - may be wrong!');
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