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

// Create Supabase client with service role key for admin operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  // Get the headers
  const headerPayload = await headers()
  const svix_id = headerPayload.get('svix-id')
  const svix_timestamp = headerPayload.get('svix-timestamp')
  const svix_signature = headerPayload.get('svix-signature')

  // If there are no headers, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return NextResponse.json(
      { error: 'Missing svix headers' },
      { status: 400 }
    )
  }

  // Get the body
  const payload = await request.text()

  // Create a new Svix instance with your secret
  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET!)

  let evt: ClerkEvent

  // Verify the payload with the headers
  try {
    evt = wh.verify(payload, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as ClerkEvent
  } catch (err) {
    console.error('Error verifying webhook:', err)
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
        console.log(`Unhandled event type: ${eventType}`)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error processing webhook:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

async function handleUserCreated(user: ClerkUser) {
  console.log('Creating user:', user.id)
  
  const { error } = await supabaseAdmin
    .from('users')
    .insert({
      id: user.id,
      email: user.email_addresses?.[0]?.email_address || '',
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      avatar_url: user.image_url || '',
    })

  if (error) {
    console.error('Error creating user in Supabase:', error)
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
    console.error('Error creating default site:', siteError)
    // Don't throw here - user creation is more important than site creation
  }

  console.log('User created successfully:', user.id)
}

async function handleUserUpdated(user: ClerkUser) {
  console.log('Updating user:', user.id)
  
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

  console.log('User updated successfully:', user.id)
}

async function handleUserDeleted(user: ClerkUser) {
  console.log('Deleting user:', user.id)
  
  const { error } = await supabaseAdmin
    .from('users')
    .delete()
    .eq('id', user.id)

  if (error) {
    console.error('Error deleting user from Supabase:', error)
    throw error
  }

  console.log('User deleted successfully:', user.id)
}

export async function GET() {
  return NextResponse.json({ message: 'Clerk webhook endpoint' })
}