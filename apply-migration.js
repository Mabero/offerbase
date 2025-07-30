const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Read environment variables manually
const envContent = fs.readFileSync('.env.local', 'utf8');
envContent.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value) {
    process.env[key.trim()] = value.trim();
  }
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyMigration() {
  console.log('Applying enhanced content intelligence migration...\n');
  
  // Read the migration file
  const migrationSQL = fs.readFileSync('./supabase/migrations/20250131_enhanced_content_intelligence.sql', 'utf8');
  
  // Split by semicolons and execute each statement
  const statements = migrationSQL.split(';').filter(stmt => stmt.trim().length > 0);
  
  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i].trim();
    if (!statement) continue;
    
    console.log(`Executing statement ${i + 1}/${statements.length}...`);
    console.log(`SQL: ${statement.substring(0, 100)}...`);
    
    try {
      const { error } = await supabase.rpc('exec_sql', { sql: statement });
      if (error) {
        console.error(`Error in statement ${i + 1}:`, error);
        // Try direct execution as fallback
        const { error: directError } = await supabase
          .from('training_materials')
          .select('id')
          .limit(1);
        
        if (directError && directError.code === '42703') {
          console.log('Column still doesn\'t exist, trying alternate approach...');
          
          // Execute raw SQL differently
          const { data, error: rawError } = await supabase.rpc('exec_raw_sql', { 
            sql: statement + ';'
          });
          
          if (rawError) {
            console.error('Raw SQL also failed:', rawError);
          } else {
            console.log('✓ Statement executed successfully via raw SQL');
          }
        }
      } else {
        console.log('✓ Statement executed successfully');
      }
    } catch (err) {
      console.error(`Unexpected error in statement ${i + 1}:`, err);
    }
  }
  
  console.log('\nMigration complete! Verifying...');
  
  // Verify the migration worked
  const { data, error } = await supabase
    .from('training_materials')
    .select('id, content_type, structured_data, intent_keywords, primary_products, confidence_score')
    .limit(1);
    
  if (error) {
    console.error('Verification failed:', error);
    console.log('\nTrying manual column addition...');
    
    // Manual approach - add columns one by one
    const alterStatements = [
      'ALTER TABLE training_materials ADD COLUMN IF NOT EXISTS content_type VARCHAR(50) DEFAULT \'general\'',
      'ALTER TABLE training_materials ADD COLUMN IF NOT EXISTS structured_data JSONB DEFAULT \'{}\'::jsonb',
      'ALTER TABLE training_materials ADD COLUMN IF NOT EXISTS intent_keywords TEXT[] DEFAULT \'{}\'',
      'ALTER TABLE training_materials ADD COLUMN IF NOT EXISTS primary_products TEXT[] DEFAULT \'{}\'',
      'ALTER TABLE training_materials ADD COLUMN IF NOT EXISTS confidence_score FLOAT DEFAULT 0.0'
    ];
    
    for (const stmt of alterStatements) {
      console.log(`Executing: ${stmt}`);
      // Since RPC might not work, we'll need to use Supabase dashboard
      console.log('Please run this SQL manually in your Supabase SQL editor:', stmt);
    }
  } else {
    console.log('✓ Migration verified successfully!');
    console.log('Sample data structure:', data[0]);
  }
}

applyMigration().catch(console.error);