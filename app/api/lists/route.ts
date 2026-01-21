import { NextRequest, NextResponse } from 'next/server';
import { initializeDatabase, createGroceryList, getAllGroceryLists } from '@/lib/database';
import { parseGroceryListText } from '@/lib/utils';

export async function GET() {
  try {
    // Skip database in development for faster response
    if (process.env.NODE_ENV === 'development' && !process.env.FORCE_DATABASE) {
      return NextResponse.json([]);
    }
    
    await initializeDatabase();
    const lists = await getAllGroceryLists();
    return NextResponse.json(lists);
  } catch (error) {
    console.error('Error fetching grocery lists:', error);
    // Return empty array for development when DB is not available
    if (process.env.NODE_ENV === 'development') {
      return NextResponse.json([]);
    }
    return NextResponse.json(
      { error: 'Failed to fetch grocery lists' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await initializeDatabase();
    
    const body = await request.json();
    const { name, rawText } = body;

    if (!name || !rawText) {
      return NextResponse.json(
        { error: 'Name and rawText are required' },
        { status: 400 }
      );
    }

    // Parse the raw text into items
    const parsedItems = parseGroceryListText(rawText);
    
    // Create the grocery list in the database
    const listId = await createGroceryList(name, rawText, parsedItems);
    
    return NextResponse.json({ id: listId, message: 'Grocery list created successfully' });
  } catch (error) {
    console.error('Error creating grocery list:', error);
    // Return mock success for development when DB is not available
    if (process.env.NODE_ENV === 'development') {
      return NextResponse.json({ id: Date.now(), message: 'Grocery list created successfully (mock)' });
    }
    return NextResponse.json(
      { error: 'Failed to create grocery list' },
      { status: 500 }
    );
  }
}