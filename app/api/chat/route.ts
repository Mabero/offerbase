import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import OpenAI from 'openai';

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

    // Build the conversation messages for OpenAI
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `You are a helpful AI assistant for an e-commerce website. Your role is to help customers find products, answer questions, and provide excellent customer service. 
        
        Key guidelines:
        - Be friendly, helpful, and professional
        - Focus on helping customers find what they need
        - If asked about specific products, provide helpful information
        - If you don't know something specific about the site, acknowledge it and offer to help in other ways
        - Keep responses concise but informative
        - Encourage users to ask questions about products or services
        
        Site ID: ${siteId}`
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

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: messages,
      max_tokens: 500,
      temperature: 0.7,
      stream: false,
    });

    const aiResponse = completion.choices[0]?.message?.content;
    
    if (!aiResponse) {
      throw new Error('No response from OpenAI');
    }

    // Check if the response suggests products (simple keyword detection)
    const lowerResponse = aiResponse.toLowerCase();
    if (lowerResponse.includes('product') || lowerResponse.includes('recommend') || lowerResponse.includes('item')) {
      // For product recommendations, return both the AI response and sample products
      return {
        type: 'links',
        message: aiResponse,
        links: [
          {
            name: 'Featured Product 1',
            description: 'This is a highly recommended product based on your inquiry.',
            url: 'https://example.com/product1',
            button_text: 'View Product',
            image_url: 'https://via.placeholder.com/80x80?text=Product+1'
          },
          {
            name: 'Featured Product 2',
            description: 'Another great option that might interest you.',
            url: 'https://example.com/product2',
            button_text: 'Learn More',
            image_url: 'https://via.placeholder.com/80x80?text=Product+2'
          }
        ]
      };
    }

    // Return regular message response
    return {
      type: 'message',
      message: aiResponse
    };
    
  } catch (error) {
    console.error('OpenAI API error:', error);
    
    // Fallback to simple responses if OpenAI fails
    return getFallbackResponse(message);
  }
}

function getFallbackResponse(message: string) {
  const lowerMessage = message.toLowerCase();
  
  // Check if user is asking about products or recommendations
  if (lowerMessage.includes('product') || lowerMessage.includes('recommend') || lowerMessage.includes('buy')) {
    return {
      type: 'links',
      message: 'Here are some great products I can recommend:',
      links: [
        {
          name: 'Sample Product 1',
          description: 'This is a great product that might interest you.',
          url: 'https://example.com/product1',
          button_text: 'View Product',
          image_url: 'https://via.placeholder.com/80x80?text=Product+1'
        },
        {
          name: 'Sample Product 2',
          description: 'Another excellent option to consider.',
          url: 'https://example.com/product2',
          button_text: 'Learn More',
          image_url: 'https://via.placeholder.com/80x80?text=Product+2'
        }
      ]
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