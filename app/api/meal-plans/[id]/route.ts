import { NextRequest, NextResponse } from 'next/server';
import { 
  getWeeklyMealPlan,
  updateWeeklyMealPlan,
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
    // Return mock data in development when database fails
    if (process.env.NODE_ENV === 'development') {
      console.log('Returning mock meal plan data due to database error in development');
      return NextResponse.json({ 
        plan: { id: planId, name: 'Mock Plan', week_start_date: '2026-01-26' }, 
        meals: [] 
      });
    }
    return NextResponse.json({ error: 'Failed to fetch meal plan' }, { status: 500 });
  }
}

export async function PATCH(
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
    const updates = await request.json();

    await updateWeeklyMealPlan(planId, updates);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating meal plan:', error);
    return NextResponse.json({ error: 'Failed to update meal plan' }, { status: 500 });
  }
}