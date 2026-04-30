# Data Import/Export System

## Overview

A comprehensive JSON-based data import/export system that allows users to backup, transfer, and seed their shopping list application data between different instances.

## Features

### ✅ Export Functionality
- **Complete Data Export**: Exports all weekly meal plans, meals, shopping lists, grocery items, pantry items, banked meals, AI cache, and meal alternatives
- **Metadata Information**: Provides summary statistics including item counts, date ranges, and file size estimates
- **Versioned Format**: Uses semantic versioning for import/export schema compatibility
- **Security Headers**: Includes export metadata in response headers

### ✅ Import Functionality
- **Supplement Mode**: Adds imported data alongside existing data (default)
- **Duplicate Prevention**: Skip duplicate entries based on key fields
- **Preview Mode**: Shows what will be imported before committing changes
- **Smart ID Mapping**: Handles ID conflicts and maintains referential integrity
- **Transaction Safety**: All-or-nothing import with rollback on errors

### ✅ Security Features
- **XSS Prevention**: Uses DOMPurify to sanitize all input data
- **SQL Injection Protection**: Proper parameter binding and input sanitization
- **Data Validation**: Comprehensive validation of import data structure
- **Error Handling**: Graceful error handling with detailed error reporting

### ✅ User Interface
- **Confirmation Dialogs**: User confirmation required for both export and import
- **Progress Feedback**: Loading states and progress indicators
- **Detailed Results**: Shows imported/skipped counts and any errors/warnings
- **File Management**: Proper file download handling with timestamped filenames

## API Endpoints

### Export Endpoints

#### `POST /api/data/export`
Returns export metadata without downloading the file.

**Response:**
```json
{
  "success": true,
  "metadata": {
    "version": "1.0.0",
    "exportedAt": "2026-01-29T21:15:36.205Z",
    "totalPlans": 1,
    "totalLists": 11,
    "totalItems": 467,
    "planDateRange": {
      "earliest": "2026-02-01",
      "latest": "2026-02-01"
    },
    "estimatedFileSize": "115 KB"
  }
}
```

#### `GET /api/data/export`
Downloads the complete data export as a JSON file.

**Response Headers:**
- `Content-Type`: `application/json`
- `Content-Disposition`: `attachment; filename="shopping-list-data-export-{timestamp}.json"`
- `X-Export-Version`: Export schema version
- `X-Export-Date`: Export timestamp
- `X-Total-Plans`: Number of meal plans
- `X-Total-Lists`: Number of shopping lists  
- `X-Total-Items`: Total number of items

### Import Endpoints

#### `GET /api/data/import?data={encodedJson}`
Previews import data without making changes.

**Response:**
```json
{
  "success": true,
  "preview": {
    "version": "1.0.0",
    "compatible": true,
    "summary": {
      "weeklyMealPlans": 1,
      "meals": 5,
      "groceryLists": 2,
      "groceryItems": 15,
      "pantryItems": 3,
      "bankedMeals": 1,
      "aiMenuCache": 0,
      "mealAlternativesHistory": 0
    },
    "dateRange": {
      "earliest": "2026-02-01",
      "latest": "2026-02-07"
    },
    "warnings": []
  }
}
```

#### `POST /api/data/import`
Imports data with specified options.

**Request Body:**
```json
{
  "data": {/* export data object */},
  "options": {
    "supplementMode": true,
    "skipDuplicates": true,
    "preserveIds": false
  }
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "success": true,
    "imported": {
      "weeklyMealPlans": 1,
      "meals": 5,
      "groceryLists": 2,
      "groceryItems": 15,
      "pantryItems": 3,
      "bankedMeals": 1,
      "aiMenuCache": 0,
      "mealAlternativesHistory": 0
    },
    "skipped": {
      "weeklyMealPlans": 0,
      "meals": 0,
      "groceryLists": 1,
      "groceryItems": 2,
      "pantryItems": 0,
      "bankedMeals": 0,
      "aiMenuCache": 0,
      "mealAlternativesHistory": 0
    },
    "errors": [],
    "warnings": ["Some items were skipped due to duplicates"]
  }
}
```

## Data Format

### Export Schema v1.0.0

```typescript
interface DataExportFormat {
  version: string;           // "1.0.0"
  exportedAt: string;        // ISO timestamp
  data: {
    weeklyMealPlans: WeeklyMealPlan[];
    meals: Meal[];
    groceryLists: GroceryList[];
    groceryItems: GroceryItem[];
    pantryItems: PantryItem[];
    bankedMeals: BankedMeal[];
    aiMenuCache: AIMenuCache[];
    mealAlternativesHistory: MealAlternativeHistory[];
  };
  metadata: {
    totalPlans: number;
    totalLists: number;
    totalItems: number;
    planDateRange?: {
      earliest: string;
      latest: string;
    };
  };
}
```

### Import Options

```typescript
interface ImportOptions {
  supplementMode: boolean;  // true = add to existing, false = replace
  skipDuplicates: boolean;  // Skip items that already exist
  preserveIds: boolean;     // Preserve original database IDs
}
```

## Usage Instructions

### Exporting Data

1. Navigate to the Utilities section or visit `/data-management`
2. Click "Preview Export" to see what will be exported
3. Review the export summary (plans, lists, items, file size)
4. Click "Download Export" and confirm
5. Save the generated JSON file securely

### Importing Data

1. Navigate to the Utilities section or visit `/data-management`
2. Select a JSON export file using the file picker
3. Configure import options:
   - **Supplement Mode** (recommended): Adds data to existing data
   - **Skip Duplicates** (recommended): Avoids duplicate entries
   - **Preserve IDs** (advanced): Keeps original database IDs
4. Review the import preview showing what will be imported
5. Click "Import Data" and confirm
6. Review the import results

## Security Considerations

### Input Sanitization
- All string inputs are sanitized using DOMPurify
- SQL injection prevention through parameterized queries
- Recursive object sanitization for complex data structures

### Data Validation
- Schema version compatibility checking
- Required field validation
- Data type validation
- Referential integrity checks

### Access Control
- Currently no authentication (intended for single-user local deployment)
- Can be extended to add API key authentication for production use

## Testing

A test script is available at `scripts/test-export-import.mjs`:

```bash
node scripts/test-export-import.mjs
```

This tests:
- Export metadata endpoint
- Export download endpoint  
- Import preview endpoint
- Data integrity validation

## Files Modified/Created

### New Files
- `lib/database/data-export-import.ts` - Core export/import logic
- `app/api/data/export/route.ts` - Export API endpoints
- `app/api/data/import/route.ts` - Import API endpoints
- `app/components/DataManagement.tsx` - React UI component
- `app/data-management/page.tsx` - Dedicated page route
- `scripts/test-export-import.mjs` - Testing script

### Modified Files
- `app/components/Utilities.tsx` - Added DataManagement component
- `lib/database/index.ts` - Exported new functions
- `package.json` - Added isomorphic-dompurify dependency

## Version Compatibility

### Current Version: 1.0.0
- Initial implementation with full data export/import
- Basic security features and validation
- Compatible with all current database schema

### Future Versions
The versioning system allows for:
- Schema evolution and migration
- Backward compatibility checking
- Warning generation for version mismatches
- Graceful handling of unsupported features

## Performance Notes

- Export operations are optimized with single transaction
- Large datasets (1000+ items) may take 2-5 seconds to export
- Import operations use batching for efficiency
- File size is typically 100-200KB for moderate data sets

## Error Handling

### Common Error Scenarios
1. **Database Connection Issues**: Transaction rollback with error reporting
2. **Invalid JSON**: Clear error messages for malformed import files
3. **Version Mismatches**: Warnings with compatibility information
4. **Referential Integrity**: Orphaned records are skipped with warnings
5. **Duplicate Data**: Handled gracefully based on skipDuplicates option

### Recovery Procedures
- All import operations are transactional (all-or-nothing)
- Failed imports leave database unchanged
- Detailed error logs help identify and fix issues
- Re-export can be used to create fresh backup files

## Deployment Notes

### Local Development
- Works with current PostgreSQL setup
- No additional configuration required
- Uses existing environment variables

### Railway Deployment
- Perfect for seeding production database with local development data
- Export locally, then import on Railway instance
- Maintains data consistency across environments
- Useful for deployment migration and backup strategies