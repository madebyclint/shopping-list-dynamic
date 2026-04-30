import { NextRequest, NextResponse } from 'next/server';
import { 
  getAllPantryItems, 
  addPantryItem, 
  updatePantryItem,
  deletePantryItem 
} from '@/lib/database/pantry-items';

// GET /api/pantry - Get all pantry items
export async function GET(request: NextRequest) {
  try {
    const items = await getAllPantryItems();
    return NextResponse.json({ success: true, items });
  } catch (error) {
    console.error('Get pantry items API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/pantry - Add new pantry item
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      category,
      current_stock,
      low_stock_threshold,
      notes
    } = body;

    if (!name || !category) {
      return NextResponse.json({ 
        error: 'Name and category are required' 
      }, { status: 400 });
    }

    const itemId = await addPantryItem({
      name,
      category,
      current_stock: current_stock || '0',
      low_stock_threshold: low_stock_threshold || '1',
      notes: notes || ''
    });

    return NextResponse.json({ success: true, id: itemId });
  } catch (error) {
    console.error('Add pantry item API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/pantry - Update pantry item
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ 
        error: 'Item ID is required' 
      }, { status: 400 });
    }

    await updatePantryItem(id, updates);
    return NextResponse.json({ success: true, message: 'Item updated' });
  } catch (error) {
    console.error('Update pantry item API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/pantry - Delete pantry item
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ 
        error: 'Item ID is required' 
      }, { status: 400 });
    }

    await deletePantryItem(parseInt(id));
    return NextResponse.json({ success: true, message: 'Item deleted' });
  } catch (error) {
    console.error('Delete pantry item API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}