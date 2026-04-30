import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/database';

export async function POST(request: NextRequest) {
  try {
    const { grocery_list_id, overall_rating, time_spent, budget_adherence, items_forgotten, categories } = await request.json();

    // Validate required fields
    if (!grocery_list_id || !overall_rating || !time_spent || !budget_adherence) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Insert main feedback record
    const feedbackInsert = `
      INSERT INTO shopping_feedback (
        grocery_list_id, overall_rating, time_spent, 
        budget_adherence, items_forgotten, created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW()) 
      RETURNING id
    `;

    const feedbackResult = await pool.query(feedbackInsert, [
      grocery_list_id, overall_rating, time_spent, 
      budget_adherence, items_forgotten || 0
    ]);

    const feedbackId = feedbackResult.rows[0].id;

    // Insert category feedback if provided
    if (categories && Array.isArray(categories)) {
      for (const category of categories) {
        const categoryInsert = `
          INSERT INTO category_feedback (
            feedback_id, category_name, found_easily, 
            price_satisfaction, availability_rating
          ) VALUES ($1, $2, $3, $4, $5)
        `;
        
        await pool.query(categoryInsert, [
          feedbackId,
          category.name,
          category.found_easily,
          category.price_satisfaction,
          category.availability_rating
        ]);
      }
    }

    return NextResponse.json({
      message: 'Feedback submitted successfully',
      feedbackId
    });

  } catch (error) {
    console.error('Error submitting feedback:', error);
    return NextResponse.json(
      { error: 'Failed to submit feedback' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const grocery_list_id = searchParams.get('grocery_list_id');

    if (!grocery_list_id) {
      return NextResponse.json({ error: 'Missing grocery_list_id parameter' }, { status: 400 });
    }

    // Get feedback for the grocery list
    const feedbackQuery = `
      SELECT sf.*, 
             json_agg(
               json_build_object(
                 'category_name', cf.category_name,
                 'found_easily', cf.found_easily,
                 'price_satisfaction', cf.price_satisfaction,
                 'availability_rating', cf.availability_rating
               )
             ) FILTER (WHERE cf.id IS NOT NULL) as categories
      FROM shopping_feedback sf
      LEFT JOIN category_feedback cf ON sf.id = cf.feedback_id
      WHERE sf.grocery_list_id = $1
      GROUP BY sf.id
      ORDER BY sf.created_at DESC
    `;

    const result = await pool.query(feedbackQuery, [parseInt(grocery_list_id)]);
    
    return NextResponse.json({
      feedback: result.rows
    });

  } catch (error) {
    console.error('Error fetching feedback:', error);
    return NextResponse.json(
      { error: 'Failed to fetch feedback' },
      { status: 500 }
    );
  }
}