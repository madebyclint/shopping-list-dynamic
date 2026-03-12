import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { pool } from '@/lib/database';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('receipt') as File;
    const groceryListId = formData.get('groceryListId') as string;
    const storeName = formData.get('storeName') as string;

    if (!file || !groceryListId) {
      return NextResponse.json(
        { error: 'Receipt file and grocery list ID are required' },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Only JPEG, PNG, and WebP images are allowed' },
        { status: 400 }
      );
    }

    // Validate file size (10MB limit)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File size must be less than 10MB' },
        { status: 400 }
      );
    }

    // Ensure uploads directory exists
    const uploadsDir = path.join(process.cwd(), 'uploads/receipts');
    try {
      await mkdir(uploadsDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }

    // Generate unique filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileExtension = path.extname(file.name);
    const filename = `receipt-${groceryListId}-${timestamp}${fileExtension}`;
    const filePath = path.join(uploadsDir, filename);

    // Save file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filePath, buffer);

    // Create receipt record in database using existing schema
    const receiptUrl = `/uploads/receipts/${filename}`;
    const insertReceiptQuery = `
      INSERT INTO receipts (
        grocery_list_id, 
        store_name, 
        image_url,
        processed,
        receipt_date
      ) 
      VALUES ($1, $2, $3, false, CURRENT_DATE)
      RETURNING id, processed, created_at
    `;

    const receiptResult = await pool.query(insertReceiptQuery, [
      parseInt(groceryListId),
      storeName || null,
      receiptUrl
    ]);

    const receiptId = receiptResult.rows[0].id;

    return NextResponse.json({
      success: true,
      receiptId,
      filename,
      uploadUrl: receiptUrl,
      message: 'Receipt uploaded successfully. Processing will begin shortly.'
    });

  } catch (error) {
    console.error('Receipt upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload receipt' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { message: 'POST to this endpoint to upload receipts' },
    { status: 405 }
  );
}