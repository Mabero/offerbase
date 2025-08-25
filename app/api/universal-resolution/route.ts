/**
 * Universal Resolution Test Endpoint
 * Allows testing the new resolution system alongside the existing chat AI
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { resolveQuery } from '@/lib/universal/resolution-engine';
import { getAIInstructions } from '@/lib/instructions';

// Allow testing with reasonable timeout
export const maxDuration = 10;

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    // Parse request body
    const body = await request.json();
    const { 
      query,
      siteId, 
      messages = [],
      pageContext 
    } = body;

    // Validate required fields
    if (!query || !siteId) {
      return NextResponse.json(
        { error: 'Missing required fields: query and siteId' },
        { status: 400 }
      );
    }

    // Get base AI instructions
    const baseInstructions = getAIInstructions();

    // Run universal resolution
    const result = await resolveQuery(
      query,
      siteId,
      {
        messages: Array.isArray(messages) ? messages : [],
        pageContext
      },
      baseInstructions
    );

    // Return the result for inspection
    return NextResponse.json({
      success: true,
      resolution: {
        mode: result.mode,
        systemPrompt: result.systemPrompt,
        chunksCount: result.chunks?.length || 0,
        chunks: result.chunks || []
      }
    });

  } catch (error) {
    console.error('Universal resolution test error:', error);
    
    return NextResponse.json(
      { 
        success: false,
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' 
          ? (error instanceof Error ? error.message : String(error))
          : undefined
      },
      { status: 500 }
    );
  }
}

// Handle CORS for testing
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}