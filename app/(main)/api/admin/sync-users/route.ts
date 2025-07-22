import { NextRequest, NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

// This is a manual sync utility for testing - NOT for production use
export async function POST(_request: NextRequest) {
  try {
    // Check if user is authenticated (basic protection)
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ 
        error: 'Supabase configuration missing' 
      }, { status: 500 })
    }

    // Create Supabase admin client
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get all users from Clerk
    const client = await clerkClient()
    const clerkUsers = await client.users.getUserList({ limit: 100 })

    interface ProcessedUser {
      userId: string;
      email: string;
      status: string;
    }

    interface SyncError {
      userId: string;
      email?: string;
      error: string;
    }

    const results = {
      totalClerkUsers: clerkUsers.totalCount,
      processedUsers: [] as ProcessedUser[],
      errors: [] as SyncError[]
    }

    // Sync each user
    for (const clerkUser of clerkUsers.data) {
      try {
        const userData = {
          id: clerkUser.id,
          email: clerkUser.emailAddresses[0]?.emailAddress || '',
          first_name: clerkUser.firstName || '',
          last_name: clerkUser.lastName || '',
          avatar_url: clerkUser.imageUrl || '',
        }

        // Try to insert user (upsert)
        const { error } = await supabase
          .from('users')
          .upsert(userData, { 
            onConflict: 'id',
            ignoreDuplicates: false 
          })

        if (error) {
          results.errors.push({
            userId: clerkUser.id,
            email: userData.email,
            error: error.message
          })
        } else {
          results.processedUsers.push({
            userId: clerkUser.id,
            email: userData.email,
            status: 'synced'
          })

          // Try to create a default site if user doesn't have one
          const { error: siteError } = await supabase
            .from('sites')
            .insert({
              name: 'My First Site',
              user_id: clerkUser.id,
            })

          if (siteError && siteError.code !== '23505') { // Ignore duplicate key errors
            console.log('Site creation error (non-critical):', siteError.message)
          }
        }
      } catch (error) {
        results.errors.push({
          userId: clerkUser.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    return NextResponse.json({
      message: 'User sync completed',
      results,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Manual sync error:', error)
    return NextResponse.json({
      error: 'Failed to sync users',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Manual user sync utility',
    usage: 'POST to this endpoint to sync all Clerk users to Supabase',
    warning: 'This is a development utility - use with caution'
  })
}