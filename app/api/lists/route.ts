import { NextRequest, NextResponse } from 'next/server';
import { initializeDatabase, createGroceryList, getAllGroceryLists } from '@/lib/database';
import { parseGroceryListText } from '@/lib/utils';

export async function GET() {
  try {
    await initializeDatabase();
    const lists = await getAllGroceryLists();
    return NextResponse.json(lists);
  } catch (error) {
    console.error('Error fetching grocery lists:', error);
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
    return NextResponse.json(
      { error: 'Failed to create grocery list' },
      { status: 500 }
    );
  }
}