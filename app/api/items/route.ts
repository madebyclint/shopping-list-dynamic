import { NextRequest, NextResponse } from 'next/server';
import { 
  initializeDatabase, 
  updateItemPurchaseStatus, 
  updateGroceryItem, 
  addItemToList, 
  deleteItemFromList,
  searchIngredients 
} from '@/lib/database';

export async function GET(request: NextRequest) {
  try {
    await initializeDatabase();
    
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    
    if (action === 'search') {
      const query = searchParams.get('q') || '';
      const limit = parseInt(searchParams.get('limit') || '20');
      
      const results = await searchIngredients(query, limit);
      return NextResponse.json(results);
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error in GET /api/items:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await initializeDatabase();
    
    const body = await request.json();
    const { listId, name, qty, price, category, meal } = body;

    if (!listId || !name) {
      return NextResponse.json(
        { error: 'listId and name are required' },
        { status: 400 }
      );
    }

    const itemId = await addItemToList(listId, {
      name,
      qty: qty || '1',
      price: price || '2.99',
      category: category || 'Other',
      meal: meal || ''
    });
    
    return NextResponse.json({ id: itemId, message: 'Item added successfully' });
  } catch (error) {
    console.error('Error adding item:', error);
    return NextResponse.json(
      { error: 'Failed to add item' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    await initializeDatabase();
    
    const body = await request.json();
    const { itemId, ...updates } = body;

    if (typeof itemId !== 'number') {
      return NextResponse.json(
        { error: 'itemId (number) is required' },
        { status: 400 }
      );
    }

    await updateGroceryItem(itemId, updates);
    
    return NextResponse.json({ message: 'Item updated successfully' });
  } catch (error) {
    console.error('Error updating item:', error);
    return NextResponse.json(
      { error: 'Failed to update item' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await initializeDatabase();
    
    const body = await request.json();
    const { itemId } = body;

    if (typeof itemId !== 'number') {
      return NextResponse.json(
        { error: 'itemId (number) is required' },
        { status: 400 }
      );
    }

    await deleteItemFromList(itemId);
    
    return NextResponse.json({ message: 'Item deleted successfully' });
  } catch (error) {
    console.error('Error deleting item:', error);
    return NextResponse.json(
      { error: 'Failed to delete item' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await initializeDatabase();
    
    const body = await request.json();
    const { itemId, isPurchased } = body;

    if (typeof itemId !== 'number' || typeof isPurchased !== 'boolean') {
      return NextResponse.json(
        { error: 'itemId (number) and isPurchased (boolean) are required' },
        { status: 400 }
      );
    }

    await updateItemPurchaseStatus(itemId, isPurchased);
    
    return NextResponse.json({ message: 'Item updated successfully' });
  } catch (error) {
    console.error('Error updating item:', error);
    return NextResponse.json(
      { error: 'Failed to update item' },
      { status: 500 }
    );
  }
}