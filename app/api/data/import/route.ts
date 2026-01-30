import { NextRequest, NextResponse } from 'next/server';
import { importData, getImportPreview, DataExportFormat, ImportOptions } from '@/lib/database/data-export-import';

// GET endpoint for import preview
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dataParam = searchParams.get('data');
    
    if (!dataParam) {
      return NextResponse.json(
        { error: 'No data provided for preview' },
        { status: 400 }
      );
    }
    
    let exportData: DataExportFormat;
    try {
      exportData = JSON.parse(decodeURIComponent(dataParam));
    } catch (parseError) {
      return NextResponse.json(
        { error: 'Invalid JSON data provided' },
        { status: 400 }
      );
    }
    
    const preview = await getImportPreview(exportData);
    
    return NextResponse.json({
      success: true,
      preview
    });
    
  } catch (error) {
    console.error('Error during import preview:', error);
    return NextResponse.json(
      { 
        error: 'Failed to preview import data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// POST endpoint for actual import
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { data, options } = body;
    
    if (!data) {
      return NextResponse.json(
        { error: 'No data provided for import' },
        { status: 400 }
      );
    }
    
    // Validate data structure
    if (!data.version || !data.data) {
      return NextResponse.json(
        { error: 'Invalid data format: missing version or data fields' },
        { status: 400 }
      );
    }
    
    // Set default options
    const importOptions: ImportOptions = {
      supplementMode: options?.supplementMode ?? true,
      skipDuplicates: options?.skipDuplicates ?? true,
      preserveIds: options?.preserveIds ?? false
    };
    
    // Perform the import
    const result = await importData(data, importOptions);
    
    return NextResponse.json({
      success: result.success,
      result
    }, {
      status: result.success ? 200 : 422
    });
    
  } catch (error) {
    console.error('Error during data import:', error);
    return NextResponse.json(
      { 
        error: 'Failed to import data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}