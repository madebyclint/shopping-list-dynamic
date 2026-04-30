import { NextRequest, NextResponse } from 'next/server';
import { 
  recordPurchase, 
  getPurchasesByFoodGroup, 
  getPurchasesByStoreSection,
  getExtraPurchasesReport,
  categorizePurchaseItem,
  getFoodGroups,
  getStoreSections
} from '@/lib/database/analytics';

// GET /api/analytics/purchases - Get purchase reports
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const reportType = searchParams.get('type');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    switch (reportType) {
      case 'food-groups':
        const foodGroupData = await getPurchasesByFoodGroup(startDate, endDate);
        return NextResponse.json({ success: true, data: foodGroupData });

      case 'store-sections':
        const storeSectionData = await getPurchasesByStoreSection(startDate, endDate);
        return NextResponse.json({ success: true, data: storeSectionData });

      case 'extra-purchases':
        const extraPurchasesData = await getExtraPurchasesReport(startDate, endDate);
        return NextResponse.json({ success: true, data: extraPurchasesData });

      case 'categories':
        const foodGroups = await getFoodGroups();
        const storeSections = await getStoreSections();
        return NextResponse.json({ 
          success: true, 
          data: { foodGroups, storeSections } 
        });

      default:
        return NextResponse.json({ 
          error: 'Invalid report type. Use: food-groups, store-sections, extra-purchases, or categories' 
        }, { status: 400 });
    }
  } catch (error) {
    console.error('Analytics purchase API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/analytics/purchases - Record a purchase
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      grocery_list_id,
      receipt_id,
      grocery_item_id,
      item_name,
      planned_quantity,
      purchased_quantity,
      unit_price,
      total_price,
      was_planned = true,
      was_extra_purchase = false,
      was_substitute = false,
      purchase_date,
      store_name,
      category
    } = body;

    // Auto-categorize item into food group
    const food_group_id = await categorizePurchaseItem(item_name, category);

    // Simple store section mapping based on existing category
    let store_section_id = null;
    if (category) {
      const categoryMapping = {
        'Produce': 1,
        'Bakery': 2, 
        'Dairy': 3,
        'Frozen': 4,
        'Protein': 5,
        'Pantry': 6,
        'Other': 9
      };
      store_section_id = categoryMapping[category as keyof typeof categoryMapping] || 9;
    }

    const purchaseId = await recordPurchase({
      grocery_list_id,
      receipt_id,
      grocery_item_id,
      item_name,
      planned_quantity,
      purchased_quantity,
      unit_price,
      total_price,
      food_group_id,
      store_section_id,
      was_planned,
      was_extra_purchase,
      was_substitute,
      purchase_date: purchase_date || new Date().toISOString().split('T')[0],
      store_name
    });

    return NextResponse.json({ success: true, id: purchaseId });
  } catch (error) {
    console.error('Record purchase API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}