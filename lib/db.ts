import { Pool, PoolClient } from 'pg';
import fs from 'fs';
import path from 'path';

// Lazy initialization: Don't create pool or validate DATABASE_URL at module load time
// This allows the module to be imported during build without throwing errors
let pool: Pool | null = null;

/**
 * Get the database connection string from environment or config file
 * This function is safe to call during build time (returns null instead of throwing)
 */
function getDatabaseUrl(): string | null {
  // 1. Try to get the URL from the system environment variables (Standard for Production)
  let databaseUrl = process.env.DATABASE_URL;

  // Debug: Log DATABASE_URL info (mask password for security)
  if (databaseUrl) {
    const maskedUrl = databaseUrl.replace(/:([^:@]+)@/, ':****@');
    console.log('📊 DATABASE_URL Debug Info:');
    console.log(`  - Source: process.env.DATABASE_URL`);
    console.log(`  - Length: ${databaseUrl.length} characters`);
    console.log(`  - Masked URL: ${maskedUrl}`);
    console.log(`  - Has sslmode: ${databaseUrl.includes('sslmode')}`);
    console.log(`  - Has channel_binding: ${databaseUrl.includes('channel_binding')}`);
    
    // Parse and log connection details (without password)
    try {
      const url = new URL(databaseUrl);
      console.log(`  - Protocol: ${url.protocol}`);
      console.log(`  - Host: ${url.hostname}`);
      console.log(`  - Port: ${url.port || '5432 (default)'}`);
      console.log(`  - Database: ${url.pathname.slice(1)}`);
      console.log(`  - Username: ${url.username}`);
      console.log(`  - Query params: ${url.search}`);
    } catch (e) {
      console.warn('  ⚠️ Could not parse DATABASE_URL as URL');
    }
  } else {
    console.warn('⚠️ DATABASE_URL is not set in process.env');
  }

  // 2. Fallback: Try to read from config.production.json (Optional: for local dev only)
  if (!databaseUrl) {
    try {
      const configPath = path.resolve(process.cwd(), 'config.production.json');
      if (fs.existsSync(configPath)) {
        const configFile = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(configFile);
        databaseUrl = config.DATABASE_URL;
        console.log('✅ Loaded DATABASE_URL from local config file');
      }
    } catch (error) {
      console.warn('⚠️ Could not read config file, relying strictly on process.env');
    }
  }

  return databaseUrl || null;
}

/**
 * Initialize the database pool lazily
 * This is called the first time the pool is accessed
 */
function initializePool(): Pool {
  if (pool) {
    return pool;
  }

  const databaseUrl = getDatabaseUrl();
  
  // 3. Security Check - Only throw when actually trying to use the database
  if (!databaseUrl) {
    console.error('❌ Critical Error: DATABASE_URL is missing.');
    throw new Error('DATABASE_URL is not defined in Environment Variables.');
  }

  // 4. Create the Pool
  // Neon requires SSL connections. For localhost, SSL is optional.
  console.log('🔌 Creating PostgreSQL connection pool...');
  
  // Parse URL to check if it's localhost
  let useSSL = true;
  try {
    const url = new URL(databaseUrl);
    const hostname = url.hostname.toLowerCase();
    // Skip SSL for localhost, 127.0.0.1, or local development
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      useSSL = false;
      console.log('📍 Local database detected, SSL disabled');
    }
  } catch (e) {
    // If URL parsing fails, default to SSL (safer for production)
    console.warn('⚠️ Could not parse DATABASE_URL, defaulting to SSL');
  }
  
  const poolConfig: any = {
    connectionString: databaseUrl,
  };
  
  if (useSSL) {
    poolConfig.ssl = {
      rejectUnauthorized: false, // Required for many cloud Postgres providers including Neon
    };
  }
  
  pool = new Pool(poolConfig);

  return pool;
}

/**
 * Get the database pool (lazy initialization)
 * Note: This will throw if DATABASE_URL is not set when accessed
 */
export function getDbPool(): Pool {
  return initializePool();
}

/**
 * Execute a query and return all rows
 */
export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<T[]> {
  const db = initializePool();
  const result = await db.query(text, params);
  return result.rows;
}

/**
 * Execute a query and return the first row, or null if no rows
 */
export async function queryOne<T = any>(
  text: string,
  params?: any[]
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Execute multiple queries in a transaction
 */
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const db = initializePool();
  const client = await db.connect();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}