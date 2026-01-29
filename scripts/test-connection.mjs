import { Pool } from 'pg';

// Test different connection configurations
async function testConnection() {
  console.log('🔍 Testing database connection...\n');
  
  // Get the connection string
  const connectionString = process.env.POSTGRES_URL;
  console.log('📋 Connection string format check:');
  console.log('Length:', connectionString?.length);
  console.log('Starts with postgresql:', connectionString?.startsWith('postgresql://'));
  console.log('Contains @:', connectionString?.includes('@'));
  console.log('Last 50 chars:', connectionString?.slice(-50));
  
  // Test 1: Basic connection with minimal config
  console.log('\n🧪 Test 1: Basic connection');
  try {
    const pool1 = new Pool({
      connectionString,
      connectionTimeoutMillis: 10000,
    });
    
    const client = await pool1.connect();
    const result = await client.query('SELECT NOW() as time, version() as version');
    console.log('✅ Basic connection successful!');
    console.log('📅 Server time:', result.rows[0].time);
    console.log('🏷️ Version:', result.rows[0].version.split(' ')[0]);
    client.release();
    await pool1.end();
  } catch (error) {
    console.log('❌ Basic connection failed:', error.message);
    if (error.code) console.log('🔑 Error code:', error.code);
  }

  // Test 2: Connection with SSL
  console.log('\n🧪 Test 2: Connection with SSL');
  try {
    const pool2 = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
    });
    
    const client = await pool2.connect();
    const result = await client.query('SELECT NOW() as time');
    console.log('✅ SSL connection successful!');
    console.log('📅 Server time:', result.rows[0].time);
    client.release();
    await pool2.end();
  } catch (error) {
    console.log('❌ SSL connection failed:', error.message);
  }

  // Test 3: Manual URL parsing
  console.log('\n🧪 Test 3: Manual URL parsing');
  try {
    const url = new URL(connectionString);
    console.log('🏠 Host:', url.hostname);
    console.log('🚪 Port:', url.port);
    console.log('🗃️ Database:', url.pathname.slice(1));
    console.log('👤 Username:', url.username);
    console.log('🔐 Password length:', url.password?.length);
  } catch (error) {
    console.log('❌ URL parsing failed:', error.message);
  }
}

testConnection();