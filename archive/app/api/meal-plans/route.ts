import { NextRequest, NextResponse } from 'next/server';
import { 
  createWeeklyMealPlan,
  getAllWeeklyMealPlans,
  deleteWeeklyMealPlan,
  initializeDatabase 
} from '../../../lib/database';

export async function GET() {
  try {
    await initializeDatabase();
    const plans = await getAllWeeklyMealPlans();
    return NextResponse.json(plans);
  } catch (error) {
    console.error('Error fetching meal plans:', error);
    // Return empty array in development when database fails
    if (process.env.NODE_ENV === 'development') {
      console.log('Returning empty array due to database error in development');
      return NextResponse.json([]);
    }
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
    // Return mock ID in development when database fails
    if (process.env.NODE_ENV === 'development') {
      console.log('Returning mock meal plan ID due to database error in development');
      return NextResponse.json({ id: Date.now() }, { status: 201 });
    }
    return NextResponse.json({ error: 'Failed to create meal plan' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await initializeDatabase();
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'Plan ID is required' }, { status: 400 });
    }

    await deleteWeeklyMealPlan(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting meal plan:', error);
    return NextResponse.json({ error: 'Failed to delete meal plan' }, { status: 500 });
  }
}