import { NextRequest, NextResponse } from 'next/server';
import { initializeDatabase, getGroceryList } from '@/lib/database';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await initializeDatabase();
    
    const listId = parseInt(params.id);
    if (isNaN(listId)) {
      return NextResponse.json(
        { error: 'Invalid list ID' },
        { status: 400 }
      );
    }

    const result = await getGroceryList(listId);
    
    if (!result) {
      return NextResponse.json(
        { error: 'Grocery list not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching grocery list:', error);
    return NextResponse.json(
      { error: 'Failed to fetch grocery list' },
      { status: 500 }
    );
  }
}