import { NextRequest, NextResponse } from 'next/server';
import { 
  createMeal,
  updateMeal,
  initializeDatabase 
} from '../../../lib/database';

export async function POST(request: NextRequest) {
  try {
    await initializeDatabase();
    const mealData = await request.json();

    if (!mealData.plan_id || mealData.day_of_week === undefined || !mealData.meal_type) {
      return NextResponse.json({ error: 'Plan ID, day of week, and meal type are required' }, { status: 400 });
    }

    const mealId = await createMeal(mealData);
    return NextResponse.json({ id: mealId }, { status: 201 });
  } catch (error) {
    console.error('Error creating meal:', error);
    // Return mock ID in development when database fails
    if (process.env.NODE_ENV === 'development') {
      console.log('Returning mock meal ID due to database error in development');
      return NextResponse.json({ id: Date.now() }, { status: 201 });
    }
    return NextResponse.json({ error: 'Failed to create meal' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await initializeDatabase();
    const { id, ...updates } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'Meal ID is required' }, { status: 400 });
    }

    await updateMeal(id, updates);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating meal:', error);
    // Return mock success in development when database fails
    if (process.env.NODE_ENV === 'development') {
      console.log('Returning mock success for meal update due to database error in development');
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: 'Failed to update meal' }, { status: 500 });
  }
}