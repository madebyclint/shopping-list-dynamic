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

    // Get item purchase patterns
    const itemPatternsQuery = `
      WITH item_stats AS (
        SELECT 
          i.id,
          i.name,
          c.name as category,
          
          -- Count planned occurrences
          COUNT(CASE WHEN sli.id IS NOT NULL THEN 1 END) as times_planned,
          
          -- Count purchased occurrences  
          COUNT(CASE WHEN sli.checked = true THEN 1 END) as times_purchased,
          
          -- Count over-purchased (from feedback)
          COUNT(CASE WHEN osf.id IS NOT NULL THEN 1 END) as times_over_purchased,
          
          -- Count missed (planned but not purchased)
          COUNT(CASE WHEN sli.id IS NOT NULL AND sli.checked = false THEN 1 END) as times_missed,
          
          -- Average cost variance
          AVG(CASE WHEN sli.actual_price IS NOT NULL AND sli.estimated_price > 0 
              THEN sli.actual_price - sli.estimated_price 
              ELSE 0 END) as avg_cost_variance
          
        FROM ingredients i
        LEFT JOIN shopping_list_items sli ON i.id = sli.ingredient_id
        LEFT JOIN shopping_lists sl ON sli.shopping_list_id = sl.id
        LEFT JOIN shopping_sessions ss ON sl.id = ss.shopping_list_id
        LEFT JOIN shopping_feedback sf ON ss.id = sf.session_id
        LEFT JOIN over_shopping_feedback osf ON sf.id = osf.feedback_id 
          AND osf.session_item_id IN (
            SELECT si.id FROM session_items si 
            WHERE si.ingredient_id = i.id
          )
        LEFT JOIN categories c ON i.category_id = c.id
        
        WHERE ss.family_id = $1 
          AND ss.session_date >= $2 
          AND ss.session_date <= $3
        GROUP BY i.id, i.name, c.name
        HAVING COUNT(CASE WHEN sli.id IS NOT NULL THEN 1 END) > 0
      )
      SELECT 
        name,
        category,
        times_planned,
        times_purchased, 
        times_over_purchased,
        times_missed,
        avg_cost_variance,
        
        -- Calculate purchase efficiency (purchased / planned)
        CASE 
          WHEN times_planned > 0 
          THEN (times_purchased::float / times_planned::float) * 100 
          ELSE 0 
        END as purchase_efficiency
        
      FROM item_stats
      WHERE times_planned >= 2  -- Only items planned multiple times
      ORDER BY 
        (times_over_purchased + times_missed) DESC,  -- Most problematic first
        times_planned DESC
      LIMIT 20
    `;

    const itemsResult = await query(itemPatternsQuery, [familyId, startDate.toISOString(), endDate.toISOString()]);

    return NextResponse.json({
      success: true,
      items: itemsResult.rows.map(row => ({
        name: row.name,
        category: row.category || 'Other',
        timesPlanned: parseInt(row.times_planned),
        timesPurchased: parseInt(row.times_purchased),
        timesOverPurchased: parseInt(row.times_over_purchased),
        timesMissed: parseInt(row.times_missed),
        avgCostVariance: parseFloat(row.avg_cost_variance || '0'),
        purchaseEfficiency: parseFloat(row.purchase_efficiency || '0')
      }))
    });

  } catch (error) {
    console.error('Item patterns analytics error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch item patterns data' },
      { status: 500 }
    );
  }
}