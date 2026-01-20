import { NextRequest, NextResponse } from 'next/server';
import { 
  createWeeklyMealPlan,
  getAllWeeklyMealPlans,
  initializeDatabase 
} from '../../../lib/database';

export async function GET() {
  try {
    await initializeDatabase();
    const plans = await getAllWeeklyMealPlans();
    return NextResponse.json(plans);
  } catch (error) {
    console.error('Error fetching meal plans:', error);
    return NextResponse.json({ error: 'Failed to fetch meal plans' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await initializeDatabase();
    const { name, weekStartDate } = await request.json();

    if (!name || !weekStartDate) {
      return NextResponse.json({ error: 'Name and week start date are required' }, { status: 400 });
    }

    const planId = await createWeeklyMealPlan(name, weekStartDate);
    return NextResponse.json({ id: planId }, { status: 201 });
  } catch (error) {
    console.error('Error creating meal plan:', error);
    return NextResponse.json({ error: 'Failed to create meal plan' }, { status: 500 });
  }
}