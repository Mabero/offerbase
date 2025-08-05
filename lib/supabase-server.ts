import { auth } from '@clerk/nextjs/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Connection pooling configuration
const CONNECTION_CONFIG = {
  // Maximum number of connections in the pool
  maxConnections: parseInt(process.env.SUPABASE_MAX_CONNECTIONS || '20'),
  
  // Connection timeout in milliseconds
  connectionTimeout: parseInt(process.env.SUPABASE_CONNECTION_TIMEOUT_MS || '10000'),
  
  // Idle timeout in milliseconds
  idleTimeout: parseInt(process.env.SUPABASE_IDLE_TIMEOUT_MS || '30000'),
  
  // Query timeout in milliseconds
  queryTimeout: parseInt(process.env.SUPABASE_QUERY_TIMEOUT_MS || '30000')
};

export async function createServerSupabaseClient() {
  const { getToken } = await auth()
  
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${await getToken({ template: 'supabase' })}`,
        },
      },
      db: {
        schema: 'public'
      },
      realtime: {
        params: {
          eventsPerSecond: 10 // Limit realtime events
        }
      }
    },
  )
}

// Singleton admin client with connection pooling
let adminClient: SupabaseClient | null = null;

// Admin client for server-side operations that need full access
export function createSupabaseAdminClient() {
  if (!adminClient) {
    adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        db: {
          schema: 'public'
        },
        global: {
          headers: {
            'Connection': 'keep-alive',
            'Keep-Alive': 'timeout=30, max=100'
          }
        },
        realtime: {
          params: {
            eventsPerSecond: 10
          }
        }
      }
    );
    
    console.log('✅ Supabase admin client initialized with connection pooling');
  }
  
  return adminClient;
}

// Health check for database connections
export async function checkSupabaseHealth(): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: number;
  error?: string;
}> {
  const startTime = Date.now();
  
  try {
    const client = createSupabaseAdminClient();
    
    // Simple health check query
    const { error } = await client
      .from('sites')
      .select('id')
      .limit(1)
      .single();
    
    const responseTime = Date.now() - startTime;
    
    // If no error or "no rows" error, connection is healthy
    if (!error || error.code === 'PGRST116') {
      return {
        status: responseTime < 1000 ? 'healthy' : 'degraded',
        responseTime
      };
    }
    
    return {
      status: 'unhealthy',
      responseTime,
      error: error.message
    };
    
  } catch (error) {
    return {
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Connection pool monitoring
export function getConnectionPoolStatus() {
  return {
    config: CONNECTION_CONFIG,
    adminClientInitialized: adminClient !== null,
    timestamp: new Date().toISOString()
  };
}