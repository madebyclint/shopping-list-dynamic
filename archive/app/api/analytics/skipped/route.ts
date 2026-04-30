import { NextRequest, NextResponse } from 'next/server';
import { 
  recordSkippedItem,
  getSkippedItemsReport,
  getPantrySuggestions,
  updatePantrySuggestions,
  markSuggestionAsAdded
} from '@/lib/database/analytics';

// GET /api/analytics/skipped - Get skipped items reports and pantry suggestions
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const reportType = searchParams.get('type');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const minScore = searchParams.get('minScore');
    const limit = searchParams.get('limit');

    switch (reportType) {
      case 'report':
        const skippedData = await getSkippedItemsReport(startDate, endDate);
        return NextResponse.json({ success: true, data: skippedData });

      case 'pantry-suggestions':
        const suggestions = await getPantrySuggestions(
          minScore ? parseInt(minScore) : 50,
          limit ? parseInt(limit) : 20
        );
        return NextResponse.json({ success: true, data: suggestions });

      default:
        return NextResponse.json({ 
          error: 'Invalid report type. Use: report or pantry-suggestions' 
        }, { status: 400 });
    }
  } catch (error) {
    console.error('Skipped items analytics API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/analytics/skipped - Record skipped item or update suggestions
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (body.action === 'record-skip') {
      const {
        grocery_list_id,
        grocery_item_id,
        item_name,
        planned_quantity,
        estimated_price,
        category,
        meal,
        skip_reason
      } = body;

      const skippedId = await recordSkippedItem({
        grocery_list_id,
        grocery_item_id,
        item_name,
        planned_quantity,
        estimated_price,
        category,
        meal,
        skip_reason,
        skip_frequency: 1, // Will be handled by the function
        planned_date: new Date().toISOString().split('T')[0]
      });

      return NextResponse.json({ success: true, id: skippedId });
      
    } else if (body.action === 'update-suggestions') {
      await updatePantrySuggestions();
      return NextResponse.json({ success: true, message: 'Pantry suggestions updated' });
      
    } else if (body.action === 'mark-added') {
      const { suggestionId } = body;
      await markSuggestionAsAdded(suggestionId);
      return NextResponse.json({ success: true, message: 'Suggestion marked as added' });
      
    } else {
      return NextResponse.json({ 
        error: 'Invalid action. Use: record-skip, update-suggestions, or mark-added' 
      }, { status: 400 });
    }
  } catch (error) {
    console.error('Skipped items API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}