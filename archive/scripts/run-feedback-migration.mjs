import { Client } from 'pg';
import fs from 'fs';

// Read the POSTGRES_URL from .env.local
const envFile = fs.readFileSync('.env.local', 'utf8');
const postgresUrl = envFile.split('\n')
  .find(line => line.startsWith('POSTGRES_URL='))
  ?.split('=')[1];

if (!postgresUrl) {
  console.error('❌ POSTGRES_URL not found in .env.local');
  process.exit(1);
}

async function runMigration() {
  const client = new Client({
    connectionString: postgresUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to database');

    const migrationSQL = fs.readFileSync('./scripts/add-feedback-tables-existing-schema.sql', 'utf8');
    await client.query(migrationSQL);
    
    console.log('✅ Feedback tables migration completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();