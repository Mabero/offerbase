import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { Webhook } from 'svix'
import { createClient } from '@supabase/supabase-js'

// Types for Clerk webhook events
interface ClerkUser {
  id: string
  email_addresses?: Array<{ email_address: string }>
  first_name?: string
  last_name?: string
  image_url?: string
}

interface ClerkEvent {
  type: string
  data: ClerkUser
}

// Helper function to create Supabase admin client
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase configuration is missing')
  }
  
  return createClient(supabaseUrl, supabaseServiceKey)
}

export async function POST(request: NextRequest) {
  
  // Get the headers
  const headerPayload = await headers()
  const svix_id = headerPayload.get('svix-id')
  const svix_timestamp = headerPayload.get('svix-timestamp')
  const svix_signature = headerPayload.get('svix-signature')


  // If there are no headers, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    console.error('❌ Missing required svix headers')
    return NextResponse.json(
      { error: 'Missing svix headers' },
      { status: 400 }
    )
  }

  // Get the body
  const payload = await request.text()

  // Check webhook secret
  if (!process.env.CLERK_WEBHOOK_SECRET) {
    console.error('❌ CLERK_WEBHOOK_SECRET is not configured')
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 }
    )
  }

  // Create a new Svix instance with your secret
  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET)

  let evt: ClerkEvent

  // Verify the payload with the headers
  try {
    evt = wh.verify(payload, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as ClerkEvent
  } catch (err) {
    console.error('❌ Error verifying webhook signature:', err)
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400 }
    )
  }

  // Handle the webhook
  const eventType = evt.type
  const user = evt.data


  try {
    switch (eventType) {
      case 'user.created':
        await handleUserCreated(user)
        break
      case 'user.updated':
        await handleUserUpdated(user)
        break
      case 'user.deleted':
        await handleUserDeleted(user)
        break
      default:
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('❌ Error processing webhook:', error)
    // Log more details about the error
    if (error instanceof Error) {
      console.error('Error message:', error.message)
      console.error('Error stack:', error.stack)
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

async function handleUserCreated(user: ClerkUser) {
  
  try {
    // Check environment variables
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase configuration missing')
    }
    
    const supabaseAdmin = getSupabaseAdmin()
    
    const userData = {
      id: user.id,
      email: user.email_addresses?.[0]?.email_address || '',
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      avatar_url: user.image_url || '',
    }
    
    
    const { error } = await supabaseAdmin
      .from('users')
      .insert(userData)

    if (error) {
      console.error('❌ Supabase insert error:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      })
      throw error
    }
    

    // Create a default site for the new user
    const { error: siteError } = await supabaseAdmin
      .from('sites')
      .insert({
        name: 'My First Site',
        user_id: user.id,
      })

    if (siteError) {
      console.error('⚠️ Error creating default site:', {
        message: siteError.message,
        code: siteError.code,
        details: siteError.details
      })
      // Don't throw here - user creation is more important than site creation
    }

  } catch (error) {
    console.error('❌ Failed to create user:', error)
    throw error
  }
}

async function handleUserUpdated(user: ClerkUser) {
  
  const supabaseAdmin = getSupabaseAdmin()
  
  const { error } = await supabaseAdmin
    .from('users')
    .update({
      email: user.email_addresses?.[0]?.email_address || '',
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      avatar_url: user.image_url || '',
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  if (error) {
    console.error('Error updating user in Supabase:', error)
    throw error
  }

}

async function handleUserDeleted(user: ClerkUser) {
  
  const supabaseAdmin = getSupabaseAdmin()
  
  const { error } = await supabaseAdmin
    .from('users')
    .delete()
    .eq('id', user.id)

  if (error) {
    console.error('Error deleting user from Supabase:', error)
    throw error
  }

}

export async function GET() {
  return NextResponse.json({ message: 'Clerk webhook endpoint' })
}