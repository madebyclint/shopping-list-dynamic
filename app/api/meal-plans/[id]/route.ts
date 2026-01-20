import { NextRequest, NextResponse } from 'next/server';
import { 
  getWeeklyMealPlan,
  initializeDatabase 
} from '../../../../lib/database';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await initializeDatabase();
    const planId = parseInt(params.id);
    
    if (isNaN(planId)) {
      return NextResponse.json({ error: 'Invalid plan ID' }, { status: 400 });
    }

    const planData = await getWeeklyMealPlan(planId);
    
    if (!planData) {
      return NextResponse.json({ error: 'Meal plan not found' }, { status: 404 });
    }

    return NextResponse.json(planData);
  } catch (error) {
    console.error('Error fetching meal plan:', error);
    return NextResponse.json({ error: 'Failed to fetch meal plan' }, { status: 500 });
  }
}