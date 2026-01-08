import { config } from 'dotenv';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getDbPool } from '../lib/db';

// Load environment variables from .env file
const envPath = join(process.cwd(), '.env');
if (existsSync(envPath)) {
  config({ path: envPath });
  console.log('✅ Loaded environment variables from .env');
} else {
  console.warn('⚠️  No .env file found. Using system environment variables.');
  config(); // Still try to load from process.env
}

async function setupTestData() {
  console.log('Setting up test data...');
  
  // Check if DATABASE_URL is set before proceeding
  if (!process.env.DATABASE_URL) {
    console.error('❌ Error: DATABASE_URL environment variable is not set');
    console.error('   Please set it as an environment variable:');
    console.error('   Windows: $env:DATABASE_URL="postgresql://..."');
    console.error('   Linux/Mac: export DATABASE_URL="postgresql://..."');
    process.exit(1);
  }
  
  const db = getDbPool();
  
  try {
    // Read the setup SQL file
    const sqlPath = join(process.cwd(), 'scripts', 'setup-test-data.sql');
    const sql = readFileSync(sqlPath, 'utf-8');
    
    // Execute the SQL statements
    // Split by semicolon, but keep SELECT statements separate
    const lines = sql.split('\n');
    let currentStatement = '';
    
    for (const line of lines) {
      const trimmed = line.trim();
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('--')) {
        continue;
      }
      
      currentStatement += ' ' + trimmed;
      
      // If line ends with semicolon, execute the statement
      if (trimmed.endsWith(';')) {
        const statement = currentStatement.trim();
        if (statement) {
          if (statement.toUpperCase().startsWith('INSERT')) {
            await db.query(statement);
            console.log('✅ Executed INSERT statement');
          } else if (statement.toUpperCase().startsWith('SELECT')) {
            const result = await db.query(statement);
            if (result.rows.length > 0) {
              console.log('📊 Query result:', JSON.stringify(result.rows, null, 2));
            } else {
              console.log('ℹ️  Query returned no results');
            }
          }
        }
        currentStatement = '';
      }
    }
    
    // Verify data was created
    console.log('\n🔍 Verifying test data...');
    const households = await db.query(
      "SELECT id, name, timezone FROM households WHERE id = '00000000-0000-0000-0000-000000000000'"
    );
    const users = await db.query(
      "SELECT id, display_name, family_role, primary_lang FROM users WHERE household_id = '00000000-0000-0000-0000-000000000000'"
    );
    
    if (households.rows.length > 0) {
      console.log('✅ Household created:', households.rows[0]);
    } else {
      console.log('⚠️  Household not found');
    }
    
    if (users.rows.length > 0) {
      console.log(`✅ Users created: ${users.rows.length} user(s)`);
      users.rows.forEach((user: any) => {
        console.log(`   - ${user.display_name} (${user.family_role}, ${user.primary_lang})`);
      });
    } else {
      console.log('⚠️  Users not found');
    }
    
    console.log('✅ Test data setup completed successfully!');
  } catch (error) {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  } finally {
    await db.end();
  }
}

setupTestData();

