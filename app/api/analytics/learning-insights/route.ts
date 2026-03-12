import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/database';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const familyId = searchParams.get('familyId');
    const range = searchParams.get('range') || '30d';

    if (!familyId) {
      return NextResponse.json(
        { error: 'Family ID is required' },
        { status: 400 }
      );
    }

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    
    switch (range) {
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
      case '6m':
        startDate.setMonth(startDate.getMonth() - 6);
        break;
      default: // 30d
        startDate.setDate(startDate.getDate() - 30);
        break;
    }

    // Get meal-specific learning insights
    const mealInsightsQuery = `
      SELECT 
        'meal_tip' as type,
        m.name || ' - ' || COALESCE(LEFT(msf.learned_tip, 50), 'Cooking tip') as title,
        msf.learned_tip as description,
        CASE 
          WHEN msf.cost_adjustment < 0 THEN 'Saved $' || ABS(msf.cost_adjustment)
          WHEN msf.cost_adjustment > 0 THEN 'Cost $' || msf.cost_adjustment || ' more'
          ELSE 'Cooking improvement'
        END as impact,
        sf.created_at as date
      FROM meal_specific_feedback msf
      JOIN shopping_feedback sf ON msf.feedback_id = sf.id
      JOIN meals m ON msf.meal_id = m.id
      WHERE sf.family_id = $1 
        AND sf.created_at >= $2 
        AND sf.created_at <= $3
        AND msf.learned_tip IS NOT NULL 
        AND LENGTH(msf.learned_tip) > 10
      ORDER BY sf.created_at DESC
      LIMIT 10
    `;

    const mealInsightsResult = await query(mealInsightsQuery, [familyId, startDate.toISOString(), endDate.toISOString()]);

    // Get cost-saving insights from over-shopping feedback
    const costInsightsQuery = `
      SELECT 
        'cost_saving' as type,
        'Avoid buying ' || string_agg(si.product_name, ', ' ORDER BY si.total_price DESC) as title,
        'Items frequently over-purchased: ' || string_agg(osf.reason, ', ') as description,
        'Potential savings: $' || SUM(si.total_price)::text as impact,
        MIN(sf.created_at) as date
      FROM over_shopping_feedback osf
      JOIN shopping_feedback sf ON osf.feedback_id = sf.id
      JOIN session_items si ON osf.session_item_id = si.id
      WHERE sf.family_id = $1 
        AND sf.created_at >= $2 
        AND sf.created_at <= $3
      GROUP BY osf.reason
      HAVING COUNT(*) >= 2  -- Items over-purchased at least twice
      ORDER BY SUM(si.total_price) DESC
      LIMIT 5
    `;

    const costInsightsResult = await query(costInsightsQuery, [familyId, startDate.toISOString(), endDate.toISOString()]);

    // Get efficiency insights from meal planning feedback
    const efficiencyInsightsQuery = `
      SELECT 
        'efficiency' as type,
        CASE 
          WHEN COUNT(CASE WHEN mpf.planned_too_many_meals THEN 1 END) > COUNT(CASE WHEN mpf.planned_too_few_meals THEN 1 END)
          THEN 'Consider planning fewer meals'
          WHEN COUNT(CASE WHEN mpf.planned_too_few_meals THEN 1 END) > COUNT(CASE WHEN mpf.planned_too_many_meals THEN 1 END)
          THEN 'Consider planning more meals'
          ELSE 'Meal planning balance is good'
        END as title,
        'Based on your feedback from ' || COUNT(*) || ' shopping trips' as description,
        CASE 
          WHEN AVG(mpf.variety_rating) < 3 THEN 'Try more variety in meals'
          WHEN AVG(mpf.difficulty_level) > 4 THEN 'Consider simpler meal options'
          ELSE 'Keep up the good planning!'
        END as impact,
        MAX(sf.created_at) as date
      FROM meal_planning_feedback mpf
      JOIN shopping_feedback sf ON mpf.feedback_id = sf.id
      WHERE sf.family_id = $1 
        AND sf.created_at >= $2 
        AND sf.created_at <= $3
      HAVING COUNT(*) >= 2  -- At least 2 feedback sessions
    `;

    const efficiencyInsightsResult = await query(efficiencyInsightsQuery, [familyId, startDate.toISOString(), endDate.toISOString()]);

    // Combine all insights
    const allInsights = [
      ...mealInsightsResult.rows,
      ...costInsightsResult.rows,
      ...efficiencyInsightsResult.rows
    ].map(row => ({
      type: row.type,
      title: row.title,
      description: row.description,
      impact: row.impact,
      date: row.date
    }));

    // Get summary count
    const summaryQuery = `
      SELECT COUNT(*) as feedback_count
      FROM shopping_feedback sf
      WHERE sf.family_id = $1 
        AND sf.created_at >= $2 
        AND sf.created_at <= $3
    `;

    const summaryResult = await query(summaryQuery, [familyId, startDate.toISOString(), endDate.toISOString()]);

    return NextResponse.json({
      success: true,
      insights: allInsights,
      summary: {
        feedbackCount: parseInt(summaryResult.rows[0]?.feedback_count || '0')
      }
    });

  } catch (error) {
    console.error('Learning insights analytics error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch learning insights data' },
      { status: 500 }
    );
  }
}