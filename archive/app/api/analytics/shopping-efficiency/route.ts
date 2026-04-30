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

    // Get shopping efficiency data by week
    const efficiencyQuery = `
      WITH weekly_stats AS (
        SELECT 
          DATE_TRUNC('week', ss.session_date) as week_start,
          COUNT(ss.id) as total_sessions,
          SUM(ss.total_amount) as total_spent,
          
          -- Calculate shopping efficiency (items purchased vs planned)
          AVG(
            CASE 
              WHEN total_planned_items.count > 0 
              THEN (purchased_items.count::float / total_planned_items.count::float) * 100
              ELSE 0 
            END
          ) as avg_shopping_efficiency,
          
          -- Calculate cost accuracy (actual vs planned cost)
          AVG(
            CASE 
              WHEN sl.estimated_total > 0 
              THEN 100 - (ABS(ss.total_amount - sl.estimated_total) / sl.estimated_total * 100)
              ELSE 0 
            END
          ) as avg_cost_accuracy
          
        FROM shopping_sessions ss
        JOIN shopping_lists sl ON ss.shopping_list_id = sl.id
        
        LEFT JOIN (
          SELECT 
            shopping_list_id,
            COUNT(*) as count
          FROM shopping_list_items 
          GROUP BY shopping_list_id
        ) total_planned_items ON sl.id = total_planned_items.shopping_list_id
        
        LEFT JOIN (
          SELECT 
            sl.id as shopping_list_id,
            COUNT(*) as count
          FROM shopping_list_items sli
          JOIN shopping_lists sl ON sli.shopping_list_id = sl.id
          WHERE sli.checked = true
          GROUP BY sl.id
        ) purchased_items ON sl.id = purchased_items.shopping_list_id
        
        WHERE ss.family_id = $1 
          AND ss.session_date >= $2 
          AND ss.session_date <= $3
        GROUP BY week_start
        ORDER BY week_start DESC
      )
      SELECT 
        TO_CHAR(week_start, 'Mon DD') || ' - ' || TO_CHAR(week_start + interval '6 days', 'Mon DD') as period,
        total_sessions,
        total_spent,
        COALESCE(avg_shopping_efficiency, 0) as shopping_efficiency,
        COALESCE(avg_cost_accuracy, 0) as cost_accuracy
      FROM weekly_stats
      LIMIT 8
    `;

    const efficiencyResult = await query(efficiencyQuery, [familyId, startDate.toISOString(), endDate.toISOString()]);

    // Calculate summary statistics
    const summaryQuery = `
      SELECT 
        COUNT(ss.id) as total_sessions,
        
        -- Average shopping efficiency
        AVG(
          CASE 
            WHEN total_planned_items.count > 0 
            THEN (purchased_items.count::float / total_planned_items.count::float) * 100
            ELSE 0 
          END
        ) as avg_efficiency,
        
        -- Average cost accuracy
        AVG(
          CASE 
            WHEN sl.estimated_total > 0 
            THEN 100 - (ABS(ss.total_amount - sl.estimated_total) / sl.estimated_total * 100)
            ELSE 0 
          END
        ) as avg_cost_accuracy,
        
        -- Total savings (negative means overspent)
        SUM(sl.estimated_total - ss.total_amount) as total_savings
        
      FROM shopping_sessions ss
      JOIN shopping_lists sl ON ss.shopping_list_id = sl.id
      
      LEFT JOIN (
        SELECT 
          shopping_list_id,
          COUNT(*) as count
        FROM shopping_list_items 
        GROUP BY shopping_list_id
      ) total_planned_items ON sl.id = total_planned_items.shopping_list_id
      
      LEFT JOIN (
        SELECT 
          sl.id as shopping_list_id,
          COUNT(*) as count
        FROM shopping_list_items sli
        JOIN shopping_lists sl ON sli.shopping_list_id = sl.id
        WHERE sli.checked = true
        GROUP BY sl.id
      ) purchased_items ON sl.id = purchased_items.shopping_list_id
      
      WHERE ss.family_id = $1 
        AND ss.session_date >= $2 
        AND ss.session_date <= $3
    `;

    const summaryResult = await query(summaryQuery, [familyId, startDate.toISOString(), endDate.toISOString()]);

    return NextResponse.json({
      success: true,
      trends: efficiencyResult.rows,
      summary: {
        totalSessions: parseInt(summaryResult.rows[0]?.total_sessions || '0'),
        avgEfficiency: parseFloat(summaryResult.rows[0]?.avg_efficiency || '0'),
        avgCostAccuracy: parseFloat(summaryResult.rows[0]?.avg_cost_accuracy || '0'),
        totalSavings: parseFloat(summaryResult.rows[0]?.total_savings || '0')
      }
    });

  } catch (error) {
    console.error('Shopping efficiency analytics error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch shopping efficiency data' },
      { status: 500 }
    );
  }
}