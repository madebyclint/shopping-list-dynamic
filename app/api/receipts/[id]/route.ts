import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/database';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Receipt ID is required' },
        { status: 400 }
      );
    }

    // Get receipt details with store info
    const receiptQuery = `
      SELECT 
        r.id,
        r.grocery_list_id,
        r.store_name,
        r.store_address,
        r.image_url,
        r.raw_text,
        r.receipt_date,
        r.receipt_time,
        r.subtotal,
        r.tax,
        r.total,
        r.processed,
        r.created_at,
        gl.name as list_name
      FROM receipts r
      LEFT JOIN grocery_lists gl ON r.grocery_list_id = gl.id
      WHERE r.id = $1
    `;

    const receiptResult = await pool.query(receiptQuery, [id]);
    
    if (receiptResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Receipt not found' },
        { status: 404 }
      );
    }

    const receipt = receiptResult.rows[0];

    return NextResponse.json({
      success: true,
      receipt: {
        ...receipt,
        processing_status: receipt.processed ? 'completed' : 'pending'
      }
    });

  } catch (error) {
    console.error('Error fetching receipt:', error);
    return NextResponse.json(
      { error: 'Failed to fetch receipt details' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const updates = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: 'Receipt ID is required' },
        { status: 400 }
      );
    }

    // Build dynamic update query
    const allowedFields = ['receipt_date', 'total', 'subtotal', 'tax', 'store_name'];
    const updateFields = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        updateFields.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (updateFields.length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    // Add updated_at and receipt ID
    updateFields.push(`updated_at = NOW()`);
    values.push(id);

    const updateQuery = `
      UPDATE receipts 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, processed, updated_at
    `;

    const result = await pool.query(updateQuery, values);

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Receipt not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      receipt: result.rows[0],
      message: 'Receipt updated successfully'
    });

  } catch (error) {
    console.error('Error updating receipt:', error);
    return NextResponse.json(
      { error: 'Failed to update receipt' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Receipt ID is required' },
        { status: 400 }
      );
    }

    // Delete receipt (cascade will handle related items)
    const deleteQuery = 'DELETE FROM receipts WHERE id = $1 RETURNING id';
    const result = await pool.query(deleteQuery, [id]);

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Receipt not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Receipt deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting receipt:', error);
    return NextResponse.json(
      { error: 'Failed to delete receipt' },
      { status: 500 }
    );
  }
}