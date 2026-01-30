import { NextRequest, NextResponse } from 'next/server';
import { exportAllData } from '@/lib/database/data-export-import';

export async function GET(request: NextRequest) {
  try {
    // Add basic authentication check if needed
    const authHeader = request.headers.get('authorization');
    // For now, we'll skip auth but in production you might want to add it
    
    const exportData = await exportAllData();
    
    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('.')[0];
    const filename = `shopping-list-data-export-${timestamp}.json`;
    
    // Return as downloadable JSON file
    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Export-Version': exportData.version,
        'X-Export-Date': exportData.exportedAt,
        'X-Total-Plans': exportData.metadata.totalPlans.toString(),
        'X-Total-Lists': exportData.metadata.totalLists.toString(),
        'X-Total-Items': exportData.metadata.totalItems.toString()
      }
    });
    
  } catch (error) {
    console.error('Error during data export:', error);
    return NextResponse.json(
      { 
        error: 'Failed to export data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // This endpoint provides export metadata without downloading the full file
    const exportData = await exportAllData();
    
    return NextResponse.json({
      success: true,
      metadata: {
        version: exportData.version,
        exportedAt: exportData.exportedAt,
        totalPlans: exportData.metadata.totalPlans,
        totalLists: exportData.metadata.totalLists,
        totalItems: exportData.metadata.totalItems,
        planDateRange: exportData.metadata.planDateRange,
        estimatedFileSize: `${Math.round(JSON.stringify(exportData).length / 1024)} KB`
      }
    });
    
  } catch (error) {
    console.error('Error getting export metadata:', error);
    return NextResponse.json(
      { 
        error: 'Failed to get export metadata',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}