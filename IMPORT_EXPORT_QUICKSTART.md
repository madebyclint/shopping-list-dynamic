# Quick Start: Data Import/Export

## 🚀 How to Transfer Your Data from Local to Railway

### Step 1: Export Your Local Data
1. Start your local development server: `npm run dev`
2. Go to **Utilities** section in the app (or visit `http://localhost:3000/data-management`)
3. Click **"Preview Export"** to see what will be exported
4. Click **"Download Export"** and confirm
5. Save the JSON file (e.g., `shopping-list-data-export-2026-01-29T21-15-55-863Z.json`)

### Step 2: Import to Railway
1. Deploy your app to Railway
2. Visit your Railway app URL and go to the **Utilities** section
3. Click **"Select Export File"** and choose the JSON file you downloaded
4. Review the import preview showing your data summary
5. Make sure these settings are checked:
   - ✅ **Supplement Mode** (adds to existing data)
   - ✅ **Skip Duplicates** (avoids conflicts)
6. Click **"Import Data"** and confirm
7. Review the results to see what was imported

### What Gets Transferred
- ✅ Weekly meal plans and menus
- ✅ Shopping lists and grocery items  
- ✅ Pantry items and extras
- ✅ Banked meals and alternatives
- ✅ All ingredients and categories
- ✅ Purchase/skip status and metadata

### Security & Safety
- 🔒 All data is sanitized to prevent security issues
- 🔄 Imports use database transactions (all-or-nothing)
- 🔍 Preview mode shows exactly what will be imported
- ⚠️ Confirmation dialogs prevent accidental operations
- 📝 Detailed results show what was imported/skipped

### File Format
- 📁 Standard JSON format with version `1.0.0`
- 📊 Includes metadata and export timestamp
- 💾 Typically 100-200KB for moderate data sets
- 🔗 Maintains all relationships between meals, lists, and items

### Troubleshooting
- ❌ **"Version mismatch"**: Warning only, import should still work
- ❌ **"File too large"**: Your browser may have upload limits
- ❌ **"Invalid JSON"**: Make sure you're uploading the correct export file
- ❌ **"Database errors"**: Check server logs for details

### Pro Tips
- 💡 Export regularly as backup before making major changes
- 💡 Use "Skip Duplicates" to safely re-import without creating duplicates
- 💡 The same export file can be imported multiple times safely
- 💡 Export includes everything needed to fully recreate your data elsewhere

---

**Need help?** Check the full documentation in `docs/DATA_IMPORT_EXPORT.md` or test the system with `node scripts/test-export-import.mjs`.