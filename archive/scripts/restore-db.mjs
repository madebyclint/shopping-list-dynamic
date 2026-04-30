#!/usr/bin/env node

import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import readline from 'readline';

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

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = promisify(rl.question).bind(rl);

async function listBackups() {
  const backupDir = './backups';
  
  if (!fs.existsSync(backupDir)) {
    console.log('❌ No backups directory found. Run backup-db.mjs first to create backups.');
    return [];
  }
  
  const files = fs.readdirSync(backupDir)
    .filter(file => file.endsWith('.sql'))
    .map(file => {
      const filePath = path.join(backupDir, file);
      const stats = fs.statSync(filePath);
      return {
        name: file,
        path: filePath,
        size: (stats.size / 1024).toFixed(1) + ' KB',
        created: stats.mtime.toLocaleDateString() + ' ' + stats.mtime.toLocaleTimeString()
      };
    })
    .sort((a, b) => fs.statSync(b.path).mtime - fs.statSync(a.path).mtime); // newest first
  
  return files;
}

async function restoreDatabase(backupFile, dropFirst = false) {
  const dbUrl = process.env.POSTGRES_URL;
  if (!dbUrl) {
    console.error('❌ POSTGRES_URL environment variable not found!');
    process.exit(1);
  }

  try {
    if (dropFirst) {
      console.log('🔄 Dropping existing tables...');
      
      // Get list of tables to drop (excluding system tables)
      const listTablesCommand = `psql "${dbUrl}" -t -c "SELECT string_agg(tablename, ', ') FROM pg_tables WHERE schemaname = 'public';"`;
      const { stdout } = await execAsync(listTablesCommand);
      const tables = stdout.trim();
      
      if (tables) {
        const dropCommand = `psql "${dbUrl}" -c "DROP TABLE IF EXISTS ${tables} CASCADE;"`;
        await execAsync(dropCommand);
        console.log('✅ Existing tables dropped');
      }
    }
    
    console.log(`🔄 Restoring database from ${path.basename(backupFile)}...`);
    
    // Restore from backup file
    const restoreCommand = `psql "${dbUrl}" < "${backupFile}"`;
    await execAsync(restoreCommand);
    
    console.log('✅ Database restored successfully!');
    
  } catch (error) {
    console.error('❌ Restore failed:', error.message);
    
    if (error.message.includes('psql: command not found')) {
      console.log('\n💡 Install PostgreSQL client tools:');
      console.log('   macOS: brew install postgresql');
      console.log('   Ubuntu: apt-get install postgresql-client');
      console.log('   Windows: Download from https://www.postgresql.org/download/');
    }
    
    process.exit(1);
  }
}

async function main() {
  console.log('🗃️  Database Restore Tool\n');
  
  const backups = await listBackups();
  
  if (backups.length === 0) {
    console.log('No backup files found. Create a backup first with: npm run backup:db');
    process.exit(0);
  }
  
  console.log('📋 Available backups:\n');
  backups.forEach((backup, index) => {
    const type = backup.name.includes('data-only') ? '[DATA ONLY]' : '[FULL]';
    console.log(`${index + 1}. ${backup.name} ${type}`);
    console.log(`   Created: ${backup.created} (${backup.size})`);
    console.log('');
  });
  
  const choice = await question('Enter backup number to restore (or 0 to cancel): ');
  const backupIndex = parseInt(choice) - 1;
  
  if (choice === '0' || isNaN(backupIndex) || backupIndex < 0 || backupIndex >= backups.length) {
    console.log('Cancelled.');
    rl.close();
    return;
  }
  
  const selectedBackup = backups[backupIndex];
  
  console.log(`\n⚠️  You are about to restore: ${selectedBackup.name}`);
  console.log('This will replace all current data in your database!');
  
  const confirm = await question('\nType "yes" to confirm restore: ');
  
  if (confirm.toLowerCase() !== 'yes') {
    console.log('Cancelled.');
    rl.close();
    return;
  }
  
  // Ask about dropping existing tables for full backups
  let dropFirst = false;
  if (!selectedBackup.name.includes('data-only')) {
    const dropChoice = await question('\nDrop existing tables first? (recommended for full backups) [y/N]: ');
    dropFirst = dropChoice.toLowerCase() === 'y' || dropChoice.toLowerCase() === 'yes';
  }
  
  rl.close();
  
  await restoreDatabase(selectedBackup.path, dropFirst);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { restoreDatabase, listBackups };