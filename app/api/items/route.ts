import { NextRequest, NextResponse } from 'next/server';
import { initializeDatabase, updateItemPurchaseStatus } from '@/lib/database';

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