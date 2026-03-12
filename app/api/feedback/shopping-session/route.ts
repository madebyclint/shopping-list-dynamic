import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/database';

interface PostShoppingFeedback {
  sessionId: string;
  userId: string;
  overShoppingItems?: {
    itemId: string;
    reason: string;
    notes?: string;
  }[];
  mealPlanningFeedback?: {
    plannedTooManyMeals?: boolean;
    plannedTooFewMeals?: boolean;
    difficultyLevel?: number; // 1-5
    varietyRating?: number; // 1-5
    notes?: string;
  };
  mealSpecificFeedback?: {
    mealId: string;
    notes: string;
    learnedTip?: string;
    costAdjustment?: number;
    wouldMakeAgain?: boolean;
  }[];
  costFeedback?: {
    expectedTotal?: number;
    actualTotal?: number;
    unexpectedExpenses?: {
      itemName: string;
      amount: number;
      reason: string;
    }[];
  };
  overallRating?: number; // 1-5
  improvementSuggestions?: string;
}

export async function POST(request: NextRequest) {
  try {
    const feedback: PostShoppingFeedback = await request.json();

    if (!feedback.sessionId || !feedback.userId) {
      return NextResponse.json(
        { error: 'Session ID and User ID are required' },
        { status: 400 }
      );
    }

    // Verify shopping session exists and belongs to user's family
    const sessionQuery = `
      SELECT s.id, s.family_id, s.total_amount, s.shopping_list_id
      FROM shopping_sessions s
      JOIN families f ON s.family_id = f.id
      JOIN users u ON f.id = u.family_id
      WHERE s.id = $1 AND u.id = $2
    `;

    const sessionResult = await query(sessionQuery, [feedback.sessionId, feedback.userId]);

    if (sessionResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Shopping session not found or access denied' },
        { status: 404 }
      );
    }

    const session = sessionResult.rows[0];

    // Begin transaction
    await query('BEGIN');

    try {
      // 1. Insert main feedback record
      const insertFeedbackQuery = `
        INSERT INTO shopping_feedback (
          session_id,
          user_id,
          family_id,
          overall_rating,
          improvement_suggestions,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING id
      `;

      const feedbackResult = await query(insertFeedbackQuery, [
        feedback.sessionId,
        feedback.userId,
        session.family_id,
        feedback.overallRating || null,
        feedback.improvementSuggestions || null
      ]);

      const feedbackId = feedbackResult.rows[0].id;

      // 2. Insert over-shopping feedback
      if (feedback.overShoppingItems && feedback.overShoppingItems.length > 0) {
        for (const item of feedback.overShoppingItems) {
          const insertOverShoppingQuery = `
            INSERT INTO over_shopping_feedback (
              feedback_id,
              session_item_id,
              reason,
              notes
            ) VALUES ($1, $2, $3, $4)
          `;

          await query(insertOverShoppingQuery, [
            feedbackId,
            item.itemId,
            item.reason,
            item.notes || null
          ]);
        }
      }

      // 3. Insert meal planning feedback
      if (feedback.mealPlanningFeedback) {
        const mpf = feedback.mealPlanningFeedback;
        const insertMealPlanFeedbackQuery = `
          INSERT INTO meal_planning_feedback (
            feedback_id,
            planned_too_many_meals,
            planned_too_few_meals,
            difficulty_rating,
            variety_rating,
            notes
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `;

        await query(insertMealPlanFeedbackQuery, [
          feedbackId,
          mpf.plannedTooManyMeals || false,
          mpf.plannedTooFewMeals || false,
          mpf.difficultyLevel || null,
          mpf.varietyRating || null,
          mpf.notes || null
        ]);
      }

      // 4. Insert meal-specific feedback
      if (feedback.mealSpecificFeedback && feedback.mealSpecificFeedback.length > 0) {
        for (const mealFeedback of feedback.mealSpecificFeedback) {
          const insertMealFeedbackQuery = `
            INSERT INTO meal_specific_feedback (
              feedback_id,
              meal_id,
              notes,
              learned_tip,
              cost_adjustment,
              would_make_again
            ) VALUES ($1, $2, $3, $4, $5, $6)
          `;

          await query(insertMealFeedbackQuery, [
            feedbackId,
            mealFeedback.mealId,
            mealFeedback.notes,
            mealFeedback.learnedTip || null,
            mealFeedback.costAdjustment || null,
            mealFeedback.wouldMakeAgain || null
          ]);
        }
      }

      // 5. Insert cost feedback
      if (feedback.costFeedback) {
        const cf = feedback.costFeedback;
        const insertCostFeedbackQuery = `
          INSERT INTO cost_feedback (
            feedback_id,
            expected_total,
            actual_total,
            unexpected_expenses
          ) VALUES ($1, $2, $3, $4)
        `;

        await query(insertCostFeedbackQuery, [
          feedbackId,
          cf.expectedTotal || null,
          cf.actualTotal || session.total_amount,
          cf.unexpectedExpenses ? JSON.stringify(cf.unexpectedExpenses) : null
        ]);
      }

      // 6. Update shopping session with feedback completion
      await query(
        'UPDATE shopping_sessions SET feedback_completed = true, feedback_at = NOW() WHERE id = $1',
        [feedback.sessionId]
      );

      await query('COMMIT');

      return NextResponse.json({
        success: true,
        feedbackId,
        message: 'Feedback submitted successfully'
      });

    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Feedback submission error:', error);
    return NextResponse.json(
      { error: 'Failed to submit feedback' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    const userId = searchParams.get('userId');

    if (!sessionId || !userId) {
      return NextResponse.json(
        { error: 'Session ID and User ID are required' },
        { status: 400 }
      );
    }

    // Get existing feedback for session
    const feedbackQuery = `
      SELECT 
        sf.id,
        sf.overall_rating,
        sf.improvement_suggestions,
        sf.created_at,
        
        -- Over-shopping feedback
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'itemId', osf.session_item_id,
              'reason', osf.reason,
              'notes', osf.notes
            )
          ) FILTER (WHERE osf.id IS NOT NULL), 
          '[]'
        ) as over_shopping_items,
        
        -- Meal planning feedback
        json_build_object(
          'plannedTooManyMeals', mpf.planned_too_many_meals,
          'plannedTooFewMeals', mpf.planned_too_few_meals,
          'difficultyLevel', mpf.difficulty_rating,
          'varietyRating', mpf.variety_rating,
          'notes', mpf.notes
        ) as meal_planning_feedback,
        
        -- Cost feedback
        json_build_object(
          'expectedTotal', cf.expected_total,
          'actualTotal', cf.actual_total,
          'unexpectedExpenses', cf.unexpected_expenses
        ) as cost_feedback

      FROM shopping_feedback sf
      LEFT JOIN over_shopping_feedback osf ON sf.id = osf.feedback_id
      LEFT JOIN meal_planning_feedback mpf ON sf.id = mpf.feedback_id
      LEFT JOIN cost_feedback cf ON sf.id = cf.feedback_id
      WHERE sf.session_id = $1 AND sf.user_id = $2
      GROUP BY sf.id, mpf.id, cf.id
    `;

    const feedbackResult = await query(feedbackQuery, [sessionId, userId]);

    if (feedbackResult.rows.length === 0) {
      return NextResponse.json({
        success: true,
        feedback: null,
        message: 'No feedback found for this session'
      });
    }

    // Get meal-specific feedback separately
    const mealFeedbackQuery = `
      SELECT 
        msf.meal_id,
        msf.notes,
        msf.learned_tip,
        msf.cost_adjustment,
        msf.would_make_again,
        m.name as meal_name
      FROM meal_specific_feedback msf
      JOIN shopping_feedback sf ON msf.feedback_id = sf.id
      JOIN meals m ON msf.meal_id = m.id
      WHERE sf.session_id = $1 AND sf.user_id = $2
    `;

    const mealFeedbackResult = await query(mealFeedbackQuery, [sessionId, userId]);

    const feedback = feedbackResult.rows[0];
    feedback.meal_specific_feedback = mealFeedbackResult.rows;

    return NextResponse.json({
      success: true,
      feedback
    });

  } catch (error) {
    console.error('Error fetching feedback:', error);
    return NextResponse.json(
      { error: 'Failed to fetch feedback' },
      { status: 500 }
    );
  }
}