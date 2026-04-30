import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/database';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idParam } = await params;
    const id = parseInt(idParam);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid list ID' }, { status: 400 });
    }

    // Get grocery list with items
    const listQuery = `
      SELECT gl.*, 
             json_agg(
               json_build_object(
                 'id', gi.id,
                 'name', gi.name,
                 'quantity', gi.qty,
                 'unit', '',
                 'category', gi.category,
                 'estimated_price', gi.price,
                 'completed', gi.is_purchased,
                 'created_at', gi.created_at
               ) ORDER BY gi.id
             ) FILTER (WHERE gi.id IS NOT NULL) as items
      FROM grocery_lists gl
      LEFT JOIN grocery_items gi ON gl.id = gi.list_id
      WHERE gl.id = $1
      GROUP BY gl.id
    `;

    const result = await pool.query(listQuery, [id]);
    
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Grocery list not found' }, { status: 404 });
    }

    const groceryList = result.rows[0];
    
    // Format the response
    const formattedList = {
      id: groceryList.id,
      name: groceryList.name,
      created_at: groceryList.created_at,
      updated_at: groceryList.updated_at,
      total_items: groceryList.items ? groceryList.items.length : 0,
      completed_items: groceryList.items ? groceryList.items.filter((item: any) => item.completed).length : 0,
      items: groceryList.items || []
    };

    return NextResponse.json(formattedList);
  } catch (error) {
    console.error('Error fetching grocery list:', error);
    return NextResponse.json(
      { error: 'Failed to fetch grocery list' },
      { status: 500 }
    );
  }
}