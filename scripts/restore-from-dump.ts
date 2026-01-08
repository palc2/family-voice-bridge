import { config } from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

// Load environment variables
const envPath = join(process.cwd(), '.env');
if (existsSync(envPath)) {
  config({ path: envPath });
}

async function restoreFromDump() {
  console.log('🔄 Restoring data from PostgreSQL dump file to Neon Cloud DB...\n');

  const targetDbUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
  
  if (!targetDbUrl) {
    console.error('❌ Error: DATABASE_URL environment variable is not set');
    console.error('   Please set it to your Neon Cloud database URL');
    process.exit(1);
  }

  const dumpFile = join(process.cwd(), 'archive', 'postgres_localDB_backup.sql');

  if (!existsSync(dumpFile)) {
    console.error(`❌ Error: Dump file not found at ${dumpFile}`);
    process.exit(1);
  }

  console.log('📋 Configuration:');
  console.log(`   Dump File: ${dumpFile}`);
  console.log(`   Target DB: ${targetDbUrl.replace(/:([^:@]+)@/, ':****@')}\n`);

  // Check if pg_restore is available
  try {
    execSync('pg_restore --version', { stdio: 'ignore' });
    console.log('✅ pg_restore found\n');
  } catch (error) {
    console.error('❌ pg_restore not found!');
    console.error('\n💡 Please install PostgreSQL client tools:');
    console.error('   Windows: Download from https://www.postgresql.org/download/windows/');
    console.error('   Mac: brew install postgresql');
    console.error('   Linux: sudo apt-get install postgresql-client\n');
    console.error('Or use the manual method below:\n');
    showManualInstructions(targetDbUrl, dumpFile);
    process.exit(1);
  }

  try {
    console.log('📦 Converting dump to SQL format (data only)...');
    
    // Use pg_restore to convert custom format to SQL (data only, no schema)
    const sqlOutput = execSync(
      `pg_restore --data-only --no-owner --no-acl --no-privileges "${dumpFile}"`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    );

    if (!sqlOutput || sqlOutput.trim().length === 0) {
      console.log('⚠️  No data found in dump file (or dump is schema-only)');
      return;
    }

    console.log(`✅ Converted dump to SQL (${sqlOutput.length} characters)\n`);
    console.log('📤 Importing data to Neon Cloud DB...\n');

    // Import using psql
    const importProcess = execSync(
      `psql "${targetDbUrl}" -c "${sqlOutput.replace(/"/g, '\\"')}"`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    );

    console.log('✅ Data restoration completed successfully!');
    console.log('\n📊 Summary:');
    console.log(importProcess);

  } catch (error: any) {
    console.error('\n❌ Restoration failed:', error.message);
    console.error('\n💡 Try the manual method:\n');
    showManualInstructions(targetDbUrl, dumpFile);
    process.exit(1);
  }
}

function showManualInstructions(targetDbUrl: string, dumpFile: string) {
  console.log('📝 Manual Restoration Instructions:');
  console.log('\nOption 1: Using pg_restore (recommended):');
  console.log(`   pg_restore --data-only --no-owner --no-acl -d "${targetDbUrl}" "${dumpFile}"`);
  console.log('\nOption 2: Convert to SQL first, then import:');
  console.log(`   pg_restore --data-only "${dumpFile}" > data.sql`);
  console.log(`   psql "${targetDbUrl}" < data.sql`);
  console.log('\nOption 3: Use pgAdmin:');
  console.log('   1. Open pgAdmin');
  console.log('   2. Connect to your Neon database');
  console.log(`   3. Right-click database → Restore`);
  console.log(`   4. Select file: ${dumpFile}`);
  console.log('   5. Select "Data only" option');
  console.log('   6. Click Restore');
}

restoreFromDump();

