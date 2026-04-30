import { NextRequest, NextResponse } from 'next/server';
import { 
  createReceipt,
  updateReceipt,
  getBudgetVarianceReport,
  createShoppingTripSummary
} from '@/lib/database/analytics';

// GET /api/analytics/budget - Get budget variance reports
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const budgetData = await getBudgetVarianceReport(startDate, endDate);
    return NextResponse.json({ success: true, data: budgetData });
  } catch (error) {
    console.error('Budget analytics API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/analytics/budget - Create shopping trip summary or receipt
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (body.action === 'create-trip-summary') {
      const {
        grocery_list_id,
        receipt_id,
        planned_total,
        actual_total,
        planned_items_count,
        purchased_items_count,
        extra_items_count,
        skipped_items_count,
        store_name,
        shopping_date
      } = body;

      const summaryId = await createShoppingTripSummary({
        grocery_list_id,
        receipt_id,
        planned_total,
        actual_total,
        planned_items_count,
        purchased_items_count,
        extra_items_count,
        skipped_items_count,
        store_name,
        shopping_date: shopping_date || new Date().toISOString().split('T')[0]
      });

      return NextResponse.json({ success: true, id: summaryId });
      
    } else if (body.action === 'create-receipt') {
      const receiptId = await createReceipt({
        grocery_list_id: body.grocery_list_id,
        store_name: body.store_name,
        store_address: body.store_address,
        receipt_date: body.receipt_date,
        receipt_time: body.receipt_time,
        subtotal: body.subtotal,
        tax: body.tax,
        total: body.total,
        payment_method: body.payment_method,
        image_url: body.image_url,
        raw_text: body.raw_text,
        processed: body.processed || false
      });

      return NextResponse.json({ success: true, id: receiptId });
      
    } else {
      return NextResponse.json({ 
        error: 'Invalid action. Use: create-trip-summary or create-receipt' 
      }, { status: 400 });
    }
  } catch (error) {
    console.error('Budget tracking API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/analytics/budget - Update receipt
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { receiptId, ...updates } = body;

    await updateReceipt(receiptId, updates);
    return NextResponse.json({ success: true, message: 'Receipt updated' });
  } catch (error) {
    console.error('Update receipt API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}