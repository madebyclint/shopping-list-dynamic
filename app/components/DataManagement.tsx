import React, { useState, useRef } from 'react';

interface ExportMetadata {
  version: string;
  exportedAt: string;
  totalPlans: number;
  totalLists: number;
  totalItems: number;
  planDateRange?: {
    earliest: string;
    latest: string;
  };
  estimatedFileSize: string;
}

interface ImportPreview {
  version: string;
  compatible: boolean;
  summary: {
    weeklyMealPlans: number;
    meals: number;
    groceryLists: number;
    groceryItems: number;
    pantryItems: number;
    bankedMeals: number;
    aiMenuCache: number;
    mealAlternativesHistory: number;
  };
  dateRange?: {
    earliest: string;
    latest: string;
  };
  warnings: string[];
}

interface ImportResult {
  success: boolean;
  imported: {
    weeklyMealPlans: number;
    meals: number;
    groceryLists: number;
    groceryItems: number;
    pantryItems: number;
    bankedMeals: number;
    aiMenuCache: number;
    mealAlternativesHistory: number;
  };
  skipped: {
    weeklyMealPlans: number;
    meals: number;
    groceryLists: number;
    groceryItems: number;
    pantryItems: number;
    bankedMeals: number;
    aiMenuCache: number;
    mealAlternativesHistory: number;
  };
  errors: string[];
  warnings: string[];
}

interface ImportOptions {
  supplementMode: boolean;
  skipDuplicates: boolean;
  preserveIds: boolean;
}

export default function DataManagement() {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [exportMetadata, setExportMetadata] = useState<ExportMetadata | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importData, setImportData] = useState<any>(null);
  const [importOptions, setImportOptions] = useState<ImportOptions>({
    supplementMode: true,
    skipDuplicates: true,
    preserveIds: false
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle export metadata fetch
  const handleGetExportInfo = async () => {
    try {
      setIsExporting(true);
      const response = await fetch('/api/data/export', { method: 'POST' });
      const result = await response.json();

      if (result.success) {
        setExportMetadata(result.metadata);
      } else {
        alert(`Error getting export info: ${result.error}`);
      }
    } catch (error) {
      alert(`Error getting export info: ${error}`);
    } finally {
      setIsExporting(false);
    }
  };

  // Handle actual export download
  const handleExport = async () => {
    try {
      setIsExporting(true);
      const response = await fetch('/api/data/export');

      if (!response.ok) {
        throw new Error(`Export failed: ${response.statusText}`);
      }

      // Get filename from Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'shopping-list-export.json';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }

      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      alert('Data exported successfully!');
      setExportMetadata(null);

    } catch (error) {
      alert(`Export failed: ${error}`);
    } finally {
      setIsExporting(false);
    }
  };

  // Handle file selection for import
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      alert('Please select a JSON file');
      return;
    }

    try {
      setImportFile(file);
      const text = await file.text();
      const data = JSON.parse(text);
      setImportData(data);

      // Get import preview
      const encodedData = encodeURIComponent(JSON.stringify(data));
      const response = await fetch(`/api/data/import?data=${encodedData}`);
      const result = await response.json();

      if (result.success) {
        setImportPreview(result.preview);
      } else {
        alert(`Error previewing import: ${result.error}`);
      }
    } catch (error) {
      alert(`Error reading file: ${error}`);
    }
  };

  // Handle actual import
  const handleImport = async () => {
    if (!importData) return;

    try {
      setIsImporting(true);
      const response = await fetch('/api/data/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: importData,
          options: importOptions
        })
      });

      const result = await response.json();
      setImportResult(result.result);

      if (result.success) {
        alert('Data imported successfully!');
      } else {
        alert(`Import completed with issues. Check the results below.`);
      }

      // Reset form
      setImportFile(null);
      setImportData(null);
      setImportPreview(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

    } catch (error) {
      alert(`Import failed: ${error}`);
    } finally {
      setIsImporting(false);
    }
  };

  const resetImport = () => {
    setImportFile(null);
    setImportData(null);
    setImportPreview(null);
    setImportResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6 p-6 bg-white rounded-lg shadow">
      <h2 className="text-2xl font-bold text-gray-900">Data Management</h2>
      <p className="text-gray-600">
        Export your data to backup or transfer to another instance. Import data to supplement your current data.
      </p>

      {/* Export Section */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-semibold mb-4">Export Data</h3>

        {!exportMetadata ? (
          <button
            onClick={handleGetExportInfo}
            disabled={isExporting}
            className="mb-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
          >
            {isExporting ? 'Checking...' : 'Preview Export'}
          </button>
        ) : (
          <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-semibold mb-2">Export Preview</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <strong>Weekly Meal Plans:</strong> {exportMetadata.totalPlans}
                </div>
                <div>
                  <strong>Shopping Lists:</strong> {exportMetadata.totalLists}
                </div>
                <div>
                  <strong>Total Items:</strong> {exportMetadata.totalItems}
                </div>
                <div>
                  <strong>File Size:</strong> {exportMetadata.estimatedFileSize}
                </div>
                {exportMetadata.planDateRange && (
                  <>
                    <div>
                      <strong>Date Range:</strong> {exportMetadata.planDateRange.earliest} to {exportMetadata.planDateRange.latest}
                    </div>
                  </>
                )}
              </div>
            </div>

            <button
              onClick={() => {
                if (window.confirm('This will download all your data including meal plans, shopping lists, and items. The export file will contain sensitive information, so keep it secure. Continue?')) {
                  handleExport();
                }
              }}
              disabled={isExporting}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 mr-2"
            >
              {isExporting ? 'Exporting...' : 'Download Export'}
            </button>

            <button
              onClick={() => setExportMetadata(null)}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Import Section */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-semibold mb-4">Import Data</h3>

        {!importPreview ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Select Export File (JSON)
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileSelect}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>

            <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
              <h4 className="font-semibold text-yellow-800 mb-2">Import Modes</h4>
              <div className="space-y-2 text-sm text-yellow-700">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={importOptions.supplementMode}
                    onChange={(e) => setImportOptions(prev => ({ ...prev, supplementMode: e.target.checked }))}
                    className="mr-2"
                  />
                  Supplement Mode (add to existing data, recommended)
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={importOptions.skipDuplicates}
                    onChange={(e) => setImportOptions(prev => ({ ...prev, skipDuplicates: e.target.checked }))}
                    className="mr-2"
                  />
                  Skip Duplicates (recommended)
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={importOptions.preserveIds}
                    onChange={(e) => setImportOptions(prev => ({ ...prev, preserveIds: e.target.checked }))}
                    className="mr-2"
                  />
                  Preserve Original IDs (advanced)
                </label>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-semibold mb-2">Import Preview</h4>
              <div className="text-sm space-y-1">
                <div><strong>File:</strong> {importFile?.name}</div>
                <div><strong>Version:</strong> {importPreview.version}</div>
                <div><strong>Compatible:</strong> {importPreview.compatible ? '✅ Yes' : '⚠️ Version mismatch'}</div>
                {importPreview.dateRange && (
                  <div><strong>Date Range:</strong> {importPreview.dateRange.earliest} to {importPreview.dateRange.latest}</div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 mt-4 text-sm">
                <div>Weekly Meal Plans: {importPreview.summary.weeklyMealPlans}</div>
                <div>Meals: {importPreview.summary.meals}</div>
                <div>Shopping Lists: {importPreview.summary.groceryLists}</div>
                <div>Grocery Items: {importPreview.summary.groceryItems}</div>
                <div>Pantry Items: {importPreview.summary.pantryItems}</div>
                <div>Banked Meals: {importPreview.summary.bankedMeals}</div>
              </div>

              {importPreview.warnings.length > 0 && (
                <div className="mt-4 p-3 bg-yellow-100 rounded">
                  <strong>Warnings:</strong>
                  <ul className="list-disc list-inside text-sm">
                    {importPreview.warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <button
              onClick={() => {
                const confirmMessage = `This will import data into your current database. ${importOptions.supplementMode
                  ? 'New data will be added alongside your existing data.'
                  : 'This may overwrite existing data.'}${importOptions.skipDuplicates ? ' Duplicates will be skipped.' : ''} Continue?`;
                if (window.confirm(confirmMessage)) {
                  handleImport();
                }
              }}
              disabled={isImporting}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 mr-2"
            >
              {isImporting ? 'Importing...' : 'Import Data'}
            </button>

            <button
              onClick={resetImport}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Import Result */}
      {importResult && (
        <div className="border-t pt-6">
          <h3 className="text-lg font-semibold mb-4">Import Results</h3>
          <div className={`p-4 rounded-lg ${importResult.success ? 'bg-green-50 border border-green-200' : 'bg-orange-50 border border-orange-200'}`}>
            <h4 className="font-semibold mb-2">
              {importResult.success ? '✅ Import Completed' : '⚠️ Import Completed with Issues'}
            </h4>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <strong>Imported:</strong>
                <ul className="ml-4">
                  <li>Meal Plans: {importResult.imported.weeklyMealPlans}</li>
                  <li>Meals: {importResult.imported.meals}</li>
                  <li>Shopping Lists: {importResult.imported.groceryLists}</li>
                  <li>Grocery Items: {importResult.imported.groceryItems}</li>
                  <li>Pantry Items: {importResult.imported.pantryItems}</li>
                  <li>Banked Meals: {importResult.imported.bankedMeals}</li>
                </ul>
              </div>
              <div>
                <strong>Skipped:</strong>
                <ul className="ml-4">
                  <li>Meal Plans: {importResult.skipped.weeklyMealPlans}</li>
                  <li>Meals: {importResult.skipped.meals}</li>
                  <li>Shopping Lists: {importResult.skipped.groceryLists}</li>
                  <li>Grocery Items: {importResult.skipped.groceryItems}</li>
                  <li>Pantry Items: {importResult.skipped.pantryItems}</li>
                  <li>Banked Meals: {importResult.skipped.bankedMeals}</li>
                </ul>
              </div>
            </div>

            {importResult.errors.length > 0 && (
              <div className="mt-4 p-3 bg-red-100 rounded">
                <strong>Errors:</strong>
                <ul className="list-disc list-inside text-sm">
                  {importResult.errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            )}

            {importResult.warnings.length > 0 && (
              <div className="mt-4 p-3 bg-yellow-100 rounded">
                <strong>Warnings:</strong>
                <ul className="list-disc list-inside text-sm">
                  {importResult.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <button
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            onClick={() => setImportResult(null)}
          >
            Clear Results
          </button>
        </div>
      )}
    </div>
  );
}