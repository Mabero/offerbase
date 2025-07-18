import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(_request: NextRequest) {
  const results = {
    timestamp: new Date().toISOString(),
    environment: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅ Set' : '❌ Missing',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '✅ Set' : '❌ Missing',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Set' : '❌ Missing',
      CLERK_WEBHOOK_SECRET: process.env.CLERK_WEBHOOK_SECRET ? '✅ Set' : '❌ Missing',
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? '✅ Set' : '❌ Missing',
      CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY ? '✅ Set' : '❌ Missing',
    },
    supabaseConnection: {
      status: '⏳ Testing...',
      error: null as string | object | null,
      tables: {} as Record<string, number>
    },
    webhookEndpoint: {
      url: `${process.env.NEXT_PUBLIC_API_URL || 'https://your-app.vercel.app'}/api/webhooks/clerk`,
      method: 'POST',
      requiredHeaders: ['svix-id', 'svix-timestamp', 'svix-signature'],
      supportedEvents: ['user.created', 'user.updated', 'user.deleted']
    }
  }

  // Test Supabase connection if credentials are available
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      )

      // Test connection by counting users
      const { count: userCount, error: userError } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })

      if (userError) {
        results.supabaseConnection.status = '❌ Failed'
        results.supabaseConnection.error = {
          message: userError.message,
          code: userError.code,
          hint: userError.hint
        }
      } else {
        // Test other tables
        const { count: siteCount } = await supabase
          .from('sites')
          .select('*', { count: 'exact', head: true })

        const { count: linkCount } = await supabase
          .from('affiliate_links')
          .select('*', { count: 'exact', head: true })

        results.supabaseConnection.status = '✅ Connected'
        results.supabaseConnection.tables = {
          users: userCount || 0,
          sites: siteCount || 0,
          affiliate_links: linkCount || 0
        }
      }
    } catch (error) {
      results.supabaseConnection.status = '❌ Error'
      results.supabaseConnection.error = error instanceof Error ? error.message : 'Unknown error'
    }
  } else {
    results.supabaseConnection.status = '❌ Missing credentials'
  }

  return NextResponse.json(results, { 
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    }
  })
}

// Test webhook payload processing
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    return NextResponse.json({
      message: 'Test webhook received',
      receivedData: body,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to parse request body',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 400 })
  }
}