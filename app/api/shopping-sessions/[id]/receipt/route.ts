import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/database';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      );
    }

    // Get receipt for this session
    const receiptQuery = `
      SELECT 
        r.id,
        r.receipt_image_url,
        r.ocr_text,
        r.ocr_confidence,
        r.total_amount,
        r.processing_status,
        r.processed_at,
        r.created_at
      FROM receipts r
      WHERE r.session_id = $1
      ORDER BY r.created_at DESC
      LIMIT 1
    `;

    const receiptResult = await query(receiptQuery, [id]);

    if (receiptResult.rows.length === 0) {
      return NextResponse.json({
        success: true,
        receipt: null,
        message: 'No receipt found for this session'
      });
    }

    const receipt = receiptResult.rows[0];

    // Get receipt items if processing is complete
    let items = [];
    if (receipt.processing_status === 'completed') {
      const itemsQuery = `
        SELECT 
          ri.id,
          ri.product_name,
          ri.quantity,
          ri.unit_price,
          ri.total_price,
          ri.matched_ingredient_id,
          ri.match_confidence
        FROM receipt_items ri
        WHERE ri.receipt_id = $1
        ORDER BY ri.line_number
      `;

      const itemsResult = await query(itemsQuery, [receipt.id]);
      items = itemsResult.rows;
    }

    return NextResponse.json({
      success: true,
      receipt: {
        id: receipt.id,
        imageUrl: receipt.receipt_image_url,
        ocrText: receipt.ocr_text,
        ocrConfidence: receipt.ocr_confidence,
        totalAmount: receipt.total_amount,
        processingStatus: receipt.processing_status,
        processedAt: receipt.processed_at,
        createdAt: receipt.created_at,
        items
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