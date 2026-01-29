import { initializeDatabase } from './lib/database/index.js';

async function migrate() {
  console.log('Running database migration to add is_skipped column...');
  try {
    await initializeDatabase();
    console.log('Database migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
  }
  process.exit(0);
}

migrate();