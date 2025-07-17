# Clerk + Supabase Integration Setup Instructions

## Overview
This guide will help you set up the complete Clerk + Supabase integration for your multi-tenant SaaS application.

## Prerequisites
- Clerk account with a configured application
- Supabase project
- Node.js and npm installed

## Step 1: Database Setup

### 1.1 Run the Database Schema
1. Open your Supabase project dashboard
2. Go to the SQL Editor
3. Copy the contents of `database/schema.sql` and run it
4. This will create all tables, relationships, and Row Level Security policies

### 1.2 Configure JWT Template in Clerk
1. Go to your Clerk Dashboard
2. Navigate to "JWT Templates"
3. Create a new template called "supabase"
4. Set the signing algorithm to "HS256"
5. Add these claims:
   ```json
   {
     "aud": "authenticated",
     "exp": {{exp}},
     "iat": {{iat}},
     "iss": "https://your-clerk-domain.clerk.accounts.dev",
     "sub": "{{user.id}}",
     "role": "authenticated"
   }
   ```
6. Save the template

### 1.3 Configure Supabase JWT Settings
1. In your Supabase project dashboard, go to "Settings" → "API"
2. Copy the JWT Secret
3. In Clerk, go to "JWT Templates" → "supabase" → "Signing key"
4. Replace the signing key with your Supabase JWT Secret

## Step 2: Environment Variables

### 2.1 Required Environment Variables
Add these to your `.env.local` file:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key  
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_publishable_key
CLERK_SECRET_KEY=your_secret_key
CLERK_WEBHOOK_SECRET=your_webhook_secret

# API
NEXT_PUBLIC_API_URL=http://localhost:3000
```

### 2.2 Get Your Keys
- **Supabase Keys**: Found in your Supabase project settings → API
- **Clerk Keys**: Found in your Clerk dashboard → API Keys
- **Webhook Secret**: Will be generated when you create the webhook (next step)

## Step 3: Webhook Setup

### 3.1 Create Clerk Webhook
1. In your Clerk dashboard, go to "Webhooks"
2. Click "Add Endpoint"
3. Set the endpoint URL to: `https://your-domain.com/api/webhooks/clerk`
4. Select these events:
   - `user.created`
   - `user.updated`
   - `user.deleted`
5. Copy the webhook secret and add it to your environment variables

### 3.2 Install Required Package
```bash
npm install svix
```

## Step 4: Test the Integration

### 4.1 Test User Creation
1. Start your development server: `npm run dev`
2. Sign up a new user through your app
3. Check your Supabase `users` table - the user should appear
4. A default site should also be created for the user

### 4.2 Test Tasks Feature
1. Navigate to `/tasks` in your app
2. Add a new task
3. Check your Supabase `tasks` table - the task should appear with the correct `user_id`

### 4.3 Test Row Level Security
1. Sign in as different users
2. Verify that each user only sees their own data
3. Try to access another user's data directly - it should be blocked

## Step 5: Dashboard Integration (Optional)

To fully integrate the dashboard with the database:

1. Update the Dashboard component to use the database service functions
2. Replace mock data with real Supabase queries
3. Test all CRUD operations for sites, links, training materials, and chat settings

## Database Schema Overview

The database follows this hierarchy:
```
Users (from Clerk)
  └── Sites (multiple per user)
       ├── Training Materials (per site)
       ├── Chat Settings (per site)
       └── Affiliate Links (per site)
```

## Key Features

✅ **User Sync**: Automatic user creation/updates via Clerk webhooks
✅ **Row Level Security**: Users can only access their own data
✅ **Multi-tenant**: Each user can have multiple sites
✅ **Type Safety**: Full TypeScript support with proper interfaces
✅ **Error Handling**: Comprehensive error handling throughout

## Troubleshooting

### Common Issues

1. **JWT Token Issues**: Make sure your JWT template in Clerk matches your Supabase settings
2. **Webhook Failures**: Check that your webhook secret is correct and the endpoint is accessible
3. **RLS Policies**: Ensure you've run the complete schema.sql file including RLS policies
4. **Environment Variables**: Double-check all environment variables are set correctly

### Debug Steps

1. Check browser console for client-side errors
2. Check server logs for API errors
3. Check Supabase logs for database errors
4. Test webhook endpoint directly using tools like Postman

## Next Steps

Once the integration is working:
1. Implement the full dashboard functionality
2. Add more features like user profiles, billing, etc.
3. Set up production environment variables
4. Configure proper error monitoring

## Support

If you encounter issues:
1. Check the console/server logs for specific error messages
2. Verify all environment variables are set correctly
3. Test the webhook endpoint independently
4. Check Supabase RLS policies are working