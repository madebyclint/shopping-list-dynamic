import { NextRequest, NextResponse } from 'next/server';
import { 
  createWeeklyMealPlan,
  getAllWeeklyMealPlans,
  initializeDatabase 
} from '../../../lib/database';

export async function GET() {
  try {
    // Skip database in development for faster response
    if (process.env.NODE_ENV === 'development' && !process.env.FORCE_DATABASE) {
      return NextResponse.json([]);
    }
    
    await initializeDatabase();
    const plans = await getAllWeeklyMealPlans();
    return NextResponse.json(plans);
  } catch (error) {
    console.error('Error fetching meal plans:', error);
    // Return empty array for development when DB is not available
    if (process.env.NODE_ENV === 'development') {
      return NextResponse.json([]);
    }
    return NextResponse.json({ error: 'Failed to fetch meal plans' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Skip database in development for faster response
    if (process.env.NODE_ENV === 'development' && !process.env.FORCE_DATABASE) {
      const { name, weekStartDate } = await request.json();
      console.log('Creating mock meal plan:', { name, weekStartDate });
      return NextResponse.json({ id: Date.now() }, { status: 201 });
    }

    await initializeDatabase();
    const { name, weekStartDate } = await request.json();

    if (!name || !weekStartDate) {
      return NextResponse.json({ error: 'Name and week start date are required' }, { status: 400 });
    }

    const planId = await createWeeklyMealPlan(name, weekStartDate);
    return NextResponse.json({ id: planId }, { status: 201 });
  } catch (error) {
    console.error('Error creating meal plan:', error);
    // Return mock success for development when DB is not available
    if (process.env.NODE_ENV === 'development') {
      return NextResponse.json({ id: Date.now() }, { status: 201 });
    }
    return NextResponse.json({ error: 'Failed to create meal plan' }, { status: 500 });
  }
}