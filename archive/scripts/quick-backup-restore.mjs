#!/usr/bin/env node

import fs from 'fs';

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

import { createBackup } from './backup-db.mjs';
import { restoreDatabase, listBackups } from './restore-db.mjs';

async function quickBackup() {
  console.log('🚀 Quick Backup - Creating backup before testing...\n');
  
  try {
    const result = await createBackup();
    console.log('\n✅ Quick backup completed!');
    console.log('💡 You can now safely test your changes.');
    console.log('💡 Run "npm run restore:quick" to restore if needed.');
    
    // Store the backup info for quick restore
    const quickBackupInfo = {
      fullBackup: result.fullBackup,
      dataOnly: result.dataOnly,
      timestamp: new Date().toISOString()
    };
    
    // Write to a temp file for quick restore reference
    const fs = await import('fs');
    fs.writeFileSync('./backups/.last-quick-backup.json', JSON.stringify(quickBackupInfo, null, 2));
    
  } catch (error) {
    console.error('❌ Quick backup failed:', error.message);
    process.exit(1);
  }
}

async function quickRestore() {
  console.log('🔄 Quick Restore - Restoring from last quick backup...\n');
  
  try {
    const fs = await import('fs');
    
    // Check for last quick backup
    const quickBackupFile = './backups/.last-quick-backup.json';
    if (!fs.existsSync(quickBackupFile)) {
      console.log('❌ No quick backup found. Run "npm run backup:quick" first.');
      process.exit(1);
    }
    
    const quickBackupInfo = JSON.parse(fs.readFileSync(quickBackupFile, 'utf8'));
    
    console.log(`📁 Restoring from backup created: ${new Date(quickBackupInfo.timestamp).toLocaleString()}`);
    
    // Use the full backup for complete restore
    await restoreDatabase(quickBackupInfo.fullBackup, true);
    
    console.log('\n✅ Quick restore completed!');
    console.log('💡 Your database has been restored to the state before testing.');
    
  } catch (error) {
    console.error('❌ Quick restore failed:', error.message);
    console.log('\n💡 You can also manually restore using: npm run restore:db');
    process.exit(1);
  }
}

// Handle command line arguments
const command = process.argv[2];

switch (command) {
  case 'backup':
    quickBackup();
    break;
  case 'restore':
    quickRestore();
    break;
  default:
    console.log('🗃️  Database Quick Backup/Restore Tool\n');
    console.log('Usage:');
    console.log('  node scripts/quick-backup-restore.mjs backup   - Create a quick backup');
    console.log('  node scripts/quick-backup-restore.mjs restore  - Restore from last quick backup');
    console.log('');
    console.log('Or use npm scripts:');
    console.log('  npm run backup:quick   - Create a quick backup');
    console.log('  npm run restore:quick  - Restore from last quick backup');
    break;
}