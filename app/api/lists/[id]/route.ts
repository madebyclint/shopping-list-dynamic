import { NextRequest, NextResponse } from 'next/server';
import { initializeDatabase, getGroceryList } from '@/lib/database';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await initializeDatabase();
    
    const { id } = await params;
    const listId = parseInt(id);
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
    // Return mock data for development when DB is not available
    if (process.env.NODE_ENV === 'development') {
      return NextResponse.json({ 
        list: { id: parseInt(id), name: 'Mock List', raw_text: '', created_at: new Date() }, 
        items: [] 
      });
    }
    return NextResponse.json(
      { error: 'Failed to fetch grocery list' },
      { status: 500 }
    );
  }
}