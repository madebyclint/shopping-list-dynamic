import { NextRequest, NextResponse } from 'next/server';
import { 
  getWeeklyMealPlan,
  initializeDatabase 
} from '../../../../lib/database';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const planId = parseInt(id);
  
  if (isNaN(planId)) {
    return NextResponse.json({ error: 'Invalid plan ID' }, { status: 400 });
  }

  try {
    await initializeDatabase();

    const planData = await getWeeklyMealPlan(planId);
    
    if (!planData) {
      return NextResponse.json({ error: 'Meal plan not found' }, { status: 404 });
    }

    return NextResponse.json(planData);
  } catch (error) {
    console.error('Error fetching meal plan:', error);
    // Return mock data for development when DB is not available
    if (process.env.NODE_ENV === 'development') {
      return NextResponse.json({ plan: { id: planId, name: 'Mock Plan', week_start_date: '2026-01-26' }, meals: [] });
    }
    return NextResponse.json({ error: 'Failed to fetch meal plan' }, { status: 500 });
  }
}