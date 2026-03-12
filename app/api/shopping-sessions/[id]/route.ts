import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/database';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!id || !userId) {
      return NextResponse.json(
        { error: 'Session ID and User ID are required' },
        { status: 400 }
      );
    }

    // Get shopping session details with verification
    const sessionQuery = `
      SELECT 
        ss.id,
        ss.shopping_list_id,
        ss.session_date,
        ss.total_amount,
        ss.feedback_completed,
        ss.feedback_at,
        s.name as store_name,
        s.chain as store_chain,
        sl.name as list_name,
        sl.estimated_total
      FROM shopping_sessions ss
      LEFT JOIN stores s ON ss.store_id = s.id
      JOIN shopping_lists sl ON ss.shopping_list_id = sl.id
      JOIN families f ON ss.family_id = f.id
      JOIN users u ON f.id = u.family_id
      WHERE ss.id = $1 AND u.id = $2
    `;

    const sessionResult = await query(sessionQuery, [id, userId]);

    if (sessionResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Shopping session not found or access denied' },
        { status: 404 }
      );
    }

    const session = sessionResult.rows[0];

    // Get planned meals for this session
    const plannedMealsQuery = `
      SELECT DISTINCT
        m.id,
        m.name,
        m.estimated_cost,
        m.meal_type,
        mm.scheduled_date
      FROM meals m
      JOIN menu_meals mm ON m.id = mm.meal_id
      JOIN weekly_menus wm ON mm.menu_id = wm.id
      JOIN shopping_lists sl ON wm.id = sl.menu_id
      WHERE sl.id = $1
      ORDER BY mm.scheduled_date, m.meal_type
    `;

    const plannedMealsResult = await query(plannedMealsQuery, [session.shopping_list_id]);

    return NextResponse.json({
      success: true,
      session: {
        id: session.id,
        shoppingListId: session.shopping_list_id,
        sessionDate: session.session_date,
        totalAmount: parseFloat(session.total_amount || '0'),
        feedbackCompleted: session.feedback_completed,
        feedbackAt: session.feedback_at,
        storeName: session.store_name || session.store_chain,
        listName: session.list_name,
        estimatedTotal: parseFloat(session.estimated_total || '0')
      },
      plannedMeals: plannedMealsResult.rows.map(meal => ({
        id: meal.id,
        name: meal.name,
        estimatedCost: parseFloat(meal.estimated_cost || '0'),
        mealType: meal.meal_type,
        scheduledDate: meal.scheduled_date
      }))
    });

  } catch (error) {
    console.error('Error fetching shopping session:', error);
    return NextResponse.json(
      { error: 'Failed to fetch shopping session details' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const updates = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      );
    }

    // Build dynamic update query
    const allowedFields = ['total_amount', 'feedback_completed', 'feedback_at'];
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

    // Add updated_at and session ID
    updateFields.push('updated_at = NOW()');
    values.push(id);

    const updateQuery = `
      UPDATE shopping_sessions 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, total_amount, feedback_completed, feedback_at
    `;

    const result = await query(updateQuery, values);

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Shopping session not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      session: result.rows[0],
      message: 'Shopping session updated successfully'
    });

  } catch (error) {
    console.error('Error updating shopping session:', error);
    return NextResponse.json(
      { error: 'Failed to update shopping session' },
      { status: 500 }
    );
  }
}