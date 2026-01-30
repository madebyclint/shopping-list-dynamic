import { NextRequest, NextResponse } from 'next/server';
import { 
  initializeDatabase, 
  updateGroceryItem, 
  deleteItemFromList,
  updateItemPurchaseStatus,
  updateItemSkipStatus 
} from '@/lib/database';

interface RouteParams {
  params: {
    id: string;
  };
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    await initializeDatabase();
    
    const { id } = await params;
    const itemId = parseInt(id);
    if (isNaN(itemId)) {
      return NextResponse.json(
        { error: 'Invalid item ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    
    // Extract the item ID from the body if it exists and remove it
    const { id: bodyId, ...updates } = body;

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

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    await initializeDatabase();
    
    const { id } = await params;
    const itemId = parseInt(id);
    if (isNaN(itemId)) {
      return NextResponse.json(
        { error: 'Invalid item ID' },
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

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    await initializeDatabase();
    
    const { id } = await params;
    const itemId = parseInt(id);
    if (isNaN(itemId)) {
      return NextResponse.json(
        { error: 'Invalid item ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { isPurchased, isSkipped } = body;

    // Handle purchase status update
    if (typeof isPurchased === 'boolean') {
      await updateItemPurchaseStatus(itemId, isPurchased);
    }

    // Handle skip status update
    if (typeof isSkipped === 'boolean') {
      await updateItemSkipStatus(itemId, isSkipped);
    }

    if (typeof isPurchased !== 'boolean' && typeof isSkipped !== 'boolean') {
      return NextResponse.json(
        { error: 'Either isPurchased (boolean) or isSkipped (boolean) is required' },
        { status: 400 }
      );
    }
    
    return NextResponse.json({ message: 'Item updated successfully' });
  } catch (error) {
    console.error('Error updating item:', error);
    return NextResponse.json(
      { error: 'Failed to update item' },
      { status: 500 }
    );
  }
}