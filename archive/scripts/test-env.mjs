import { config } from 'dotenv';
import { Pool } from 'pg';

// Load environment variables like Next.js does
config({ path: '.env.local' });

async function testWithEnvFile() {
  console.log('🔍 Testing database connection with .env.local...\n');
  
  const connectionString = process.env.POSTGRES_URL;
  console.log('📋 Environment variable check:');
  console.log('POSTGRES_URL loaded:', !!connectionString);
  console.log('Length:', connectionString?.length);
  
  if (!connectionString) {
    console.log('❌ POSTGRES_URL not found in environment variables');
    console.log('📝 Available env vars:', Object.keys(process.env).filter(key => key.includes('POSTGRES')));
    return;
  }

  try {
    const pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
    });
    
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as time, version() as version');
    console.log('✅ Connection successful!');
    console.log('📅 Server time:', result.rows[0].time);
    console.log('🏷️ Version:', result.rows[0].version.split(' ')[0]);
    client.release();
    await pool.end();
  } catch (error) {
    console.log('❌ Connection failed:', error.message);
    if (error.code) console.log('🔑 Error code:', error.code);
  }
}

testWithEnvFile();