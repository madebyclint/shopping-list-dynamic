#!/usr/bin/env node

import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Load environment variables from .env.local
function loadEnvFile() {
  const envFile = './.env.local';
  if (fs.existsSync(envFile)) {
    const envContent = fs.readFileSync(envFile, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^#][^=]*?)=(.*)$/);
      if (match) {
        const [, key, value] = match;
        process.env[key.trim()] = value.trim();
      }
    });
  }
}

// Load environment variables
loadEnvFile();

// Create backups directory if it doesn't exist
const backupDir = './backups';
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

async function createBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `shopping-list-backup-${timestamp}.sql`);
  
  // Get database URL from environment
  const dbUrl = process.env.POSTGRES_URL;
  if (!dbUrl) {
    console.error('❌ POSTGRES_URL environment variable not found!');
    console.log('Please ensure your .env.local file contains POSTGRES_URL');
    process.exit(1);
  }

  try {
    console.log('🔄 Creating database backup...');
    
    // Use pg_dump to create a complete backup (schema + data)
    const pgDumpCommand = `pg_dump "${dbUrl}" > "${backupFile}"`;
    
    await execAsync(pgDumpCommand);
    
    console.log(`✅ Backup created successfully: ${backupFile}`);
    console.log(`📁 Backup size: ${(fs.statSync(backupFile).size / 1024).toFixed(1)} KB`);
    
    // Also create a data-only backup for quick testing restores
    const dataOnlyFile = path.join(backupDir, `shopping-list-data-only-${timestamp}.sql`);
    const dataOnlyCommand = `pg_dump "${dbUrl}" --data-only --inserts > "${dataOnlyFile}"`;
    
    await execAsync(dataOnlyCommand);
    console.log(`✅ Data-only backup created: ${dataOnlyFile}`);
    
    return { fullBackup: backupFile, dataOnly: dataOnlyFile };
    
  } catch (error) {
    console.error('❌ Backup failed:', error.message);
    
    if (error.message.includes('pg_dump: command not found')) {
      console.log('\n💡 Install PostgreSQL client tools:');
      console.log('   macOS: brew install postgresql');
      console.log('   Ubuntu: apt-get install postgresql-client');
      console.log('   Windows: Download from https://www.postgresql.org/download/');
    }
    
    process.exit(1);
  }
}

// Run backup if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createBackup();
}

export { createBackup };