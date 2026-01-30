# Database Backup & Restore System

This project includes a comprehensive backup and restore system for your PostgreSQL database, perfect for testing and development safety.

## Quick Start

### Before Testing (Recommended)
```bash
# Create a quick backup before testing
npm run backup:quick
```

### After Testing (If Something Goes Wrong)
```bash
# Restore from your quick backup
npm run restore:quick
```

## Available Commands

### 🚀 Quick Backup/Restore (Recommended for Testing)
- `npm run backup:quick` - Creates a timestamped backup before testing
- `npm run restore:quick` - Restores from the last quick backup

### 🗃️ Full Backup/Restore System
- `npm run backup:db` - Creates a full database backup
- `npm run restore:db` - Interactive restore from any backup

## How It Works

### Backup Types
1. **Full Backup**: Complete database schema + data (recommended)
2. **Data-Only Backup**: Just the data (for quick data resets)

### File Locations
- Backups are stored in `./backups/` directory
- Filename format: `shopping-list-backup-YYYY-MM-DDTHH-mm-ss-sssZ.sql`
- Quick backup info: `./backups/.last-quick-backup.json`

## Typical Testing Workflow

1. **Before making risky changes:**
   ```bash
   npm run backup:quick
   ```

2. **Make your changes and test**

3. **If something breaks:**
   ```bash
   npm run restore:quick
   ```

4. **If everything works, continue normally**

## Advanced Usage

### Manual Backup
```bash
# Create a timestamped backup
npm run backup:db
```

### Manual Restore
```bash
# Choose from available backups interactively
npm run restore:db
```

### Command Line Usage
```bash
# Direct script usage
node scripts/backup-db.mjs
node scripts/restore-db.mjs
node scripts/quick-backup-restore.mjs backup
node scripts/quick-backup-restore.mjs restore
```

## Requirements

### PostgreSQL Client Tools
The backup system requires `pg_dump` and `psql` commands:

**macOS:**
```bash
brew install postgresql
```

**Ubuntu/Debian:**
```bash
apt-get install postgresql-client
```

**Windows:**
Download from [https://www.postgresql.org/download/](https://www.postgresql.org/download/)

### Environment Variables
Ensure your `.env.local` file contains:
```
POSTGRES_URL=postgresql://username:password@host:port/database
```

## Safety Features

- ✅ Confirms destructive operations
- ✅ Shows backup details before restore
- ✅ Creates both full and data-only backups
- ✅ Timestamped backups for easy identification
- ✅ Automatic backup directory creation
- ✅ Quick restore from last backup

## Troubleshooting

### "pg_dump: command not found"
Install PostgreSQL client tools (see Requirements above)

### "POSTGRES_URL not found"
Check your `.env.local` file contains the database connection string

### "Permission denied"
Make scripts executable:
```bash
chmod +x scripts/*.mjs
```

### Large Backup Files
- Backups are excluded from git (`.gitignore`)
- Consider cleaning old backups periodically
- Data-only backups are smaller for frequent testing

## Examples

### Before Testing New Analytics Features
```bash
npm run backup:quick
# Test your analytics changes
# If something breaks:
npm run restore:quick
```

### Weekly Development Checkpoint
```bash
npm run backup:db
# Creates a permanent checkpoint you can restore later
```

### Sharing Database State
```bash
# Create a backup
npm run backup:db
# Send the backup file to team members
# They can restore using:
npm run restore:db
```