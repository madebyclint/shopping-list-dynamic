import { NextRequest, NextResponse } from 'next/server';
import { initializeDatabase, getPantryAnalytics } from '@/lib/database';

export async function GET(request: NextRequest) {
  try {
    // Skip database in development unless forced
    if (process.env.NODE_ENV === 'development' && !process.env.FORCE_DATABASE) {
      return NextResponse.json({
        success: true,
        analytics: {
          overall: {
            total_items: 45,
            total_plans: 8,
            total_estimated_cost: 127.43,
            avg_item_cost: 2.83,
            total_tokens_used: 3240
          },
          breakdown: [
            { category: 'pantry', category_count: 15, week: '2024-01-22T00:00:00Z', weekly_count: 5 },
            { category: 'produce', category_count: 12, week: '2024-01-22T00:00:00Z', weekly_count: 4 },
            { category: 'dairy', category_count: 8, week: '2024-01-15T00:00:00Z', weekly_count: 3 }
          ]
        }
      });
    }

    await initializeDatabase();
    
    const url = new URL(request.url);
    const startDate = url.searchParams.get('startDate') || undefined;
    const endDate = url.searchParams.get('endDate') || undefined;

    const analytics = await getPantryAnalytics(startDate, endDate);
    
    return NextResponse.json({
      success: true,
      analytics,
      period: {
        startDate,
        endDate
      }
    });

  } catch (error) {
    console.error('Error fetching pantry analytics:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}