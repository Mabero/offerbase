import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import OpenAI from 'openai';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { buildSystemPrompt } from '@/lib/instructions';
import { StructuredAIResponse, AIResponseParseResult } from '@/types/training';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    const body = await request.json();
    
    const { message, siteId, conversationHistory = [], sessionId } = body;
    
    // Validate required fields
    if (!message || !siteId) {
      return NextResponse.json(
        { error: 'Message and siteId are required' },
        { 
          status: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          }
        }
      );
    }
    
    // Get headers
    const xUserId = request.headers.get('x-user-id');
    
    console.log('Chat API called:', {
      message,
      siteId,
      userId: userId || xUserId,
      sessionId,
      conversationHistory: conversationHistory.length
    });
    
    // Generate AI response using OpenAI
    const response = await generateChatResponse(message, conversationHistory, siteId);
    
    return NextResponse.json(response, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    });
    
  } catch (error) {
    console.error('Chat API error:', error);
    
    // Provide more specific error messages
    let errorMessage = 'Internal server error';
    
    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        errorMessage = 'OpenAI API key not configured. Please check your environment variables.';
      } else if (error.message.includes('rate limit')) {
        errorMessage = 'Rate limit exceeded. Please try again in a moment.';
      } else if (error.message.includes('network')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      }
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
      }
    );
  }
}

async function generateChatResponse(message: string, conversationHistory: { role: string; content: string }[], siteId: string) {
  try {
    // Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
      console.warn('OpenAI API key not configured, using fallback response');
      return getFallbackResponse(message);
    }

    // Initialize OpenAI client inside the function to avoid build-time errors
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const supabase = createSupabaseAdminClient();
    
    // Fetch training materials for this site
    const { data: trainingMaterials } = await supabase
      .from('training_materials')
      .select('title, content, metadata')
      .eq('site_id', siteId)
      .eq('scrape_status', 'success')
      .not('content', 'is', null);
    
    // Fetch affiliate links for this site
    const { data: affiliateLinks } = await supabase
      .from('affiliate_links')
      .select('url, title, description')
      .eq('site_id', siteId);
    
    // Fetch chat settings for custom instructions
    const { data: chatSettings } = await supabase
      .from('chat_settings')
      .select('instructions')
      .eq('site_id', siteId)
      .single();
    
    // Build training context
    let trainingContext = '';
    if (trainingMaterials && trainingMaterials.length > 0) {
      trainingContext = '\n\nTraining Materials Context:\n';
      trainingMaterials.forEach((material, index) => {
        if (material.content) {
          // Limit content length to avoid token limits
          const truncatedContent = material.content.substring(0, 2000);
          trainingContext += `\n${index + 1}. ${material.title}:\n${truncatedContent}${material.content.length > 2000 ? '...' : ''}\n`;
        }
      });
    }
    
    // Build affiliate links context
    let affiliateContext = '';
    if (affiliateLinks && affiliateLinks.length > 0) {
      affiliateContext = '\n\nAvailable Product Links:\n';
      affiliateLinks.forEach((link, index) => {
        affiliateContext += `${index + 1}. ${link.title} - ${link.description || 'No description'}\n`;
      });
    }
    
    // Build system prompt
    const systemPrompt = buildSystemPrompt(chatSettings?.instructions || '');

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
        content: message
      }
    ];

    // Call OpenAI API with response_format for structured JSON
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo-1106',
      messages: messages,
      max_tokens: 500,
      temperature: 0.7,
      stream: false,
      response_format: { type: "json_object" }
    });

    const rawResponse = completion.choices[0]?.message?.content;
    
    if (!rawResponse) {
      throw new Error('No response from OpenAI');
    }

    // Parse the structured JSON response from AI
    const parseResult = parseAIResponse(rawResponse);
    
    if (!parseResult.success) {
      console.warn('Failed to parse structured response, using fallback:', parseResult.error);
      return getFallbackResponseFromText(rawResponse, affiliateLinks || []);
    }

    const structuredResponse = parseResult.structured!;
    console.log('Parsed structured response:', {
      show_products: structuredResponse.show_products,
      show_simple_link: structuredResponse.show_simple_link,
      link_text: structuredResponse.link_text,
      specific_products: structuredResponse.specific_products,
      message_preview: structuredResponse.message.substring(0, 100) + '...'
    });
    
    // If AI decided to show products, return with links
    if (structuredResponse.show_products && affiliateLinks && affiliateLinks.length > 0) {
      let linksToShow = [...affiliateLinks];
      
      // If AI specified specific products, try to match them
      if (structuredResponse.specific_products && structuredResponse.specific_products.length > 0) {
        const matchedLinks = [];
        const unmatchedLinks = [];
        
        for (const link of affiliateLinks) {
          const isMatched = structuredResponse.specific_products.some(productName => 
            link.title.toLowerCase().includes(productName.toLowerCase()) ||
            productName.toLowerCase().includes(link.title.toLowerCase())
          );
          
          if (isMatched) {
            matchedLinks.push(link);
          } else {
            unmatchedLinks.push(link);
          }
        }
        
        // Prioritize matched products, then add unmatched if needed
        linksToShow = [...matchedLinks, ...unmatchedLinks];
      }
      
      // Limit to max_products or default to 1
      const maxProducts = structuredResponse.max_products || 1;
      const links = linksToShow.slice(0, maxProducts).map(link => {
        // Try to extract image from training materials - only use if available
        let imageUrl = '';
        if (trainingMaterials) {
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
          button_text: 'View Product',
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
      console.log('Processing simple link - link_text:', structuredResponse.link_text);
      let linkUrl = structuredResponse.link_url;
      
      // If link_url is a placeholder or example URL, try to find actual product URL
      if ((!linkUrl || 
           linkUrl.includes('[product_url_from_training_materials]') || 
           linkUrl.includes('example.com') ||
           linkUrl.length === 0) && 
          affiliateLinks && affiliateLinks.length > 0) {
        
        // Try to find the most relevant affiliate link
        // Look for product mentioned in the conversation or use first available
        linkUrl = affiliateLinks[0].url;
        
        // If AI mentioned specific products, try to match them
        if (structuredResponse.specific_products && structuredResponse.specific_products.length > 0) {
          for (const link of affiliateLinks) {
            const isMatched = structuredResponse.specific_products.some(productName => 
              link.title.toLowerCase().includes(productName.toLowerCase()) ||
              productName.toLowerCase().includes(link.title.toLowerCase())
            );
            if (isMatched) {
              linkUrl = link.url;
              break;
            }
          }
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
    console.log('Raw AI response:', rawResponse);
    const parsed = JSON.parse(rawResponse);
    
    // Validate required fields
    if (!parsed.message || (typeof parsed.show_products !== 'boolean' && typeof parsed.show_simple_link !== 'boolean')) {
      console.error('Invalid response structure:', parsed);
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
      button_text: 'View Product',
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