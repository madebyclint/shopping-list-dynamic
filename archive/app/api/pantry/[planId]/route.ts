import { NextRequest, NextResponse } from 'next/server';
import { initializeDatabase, getPantryItems, updatePantryItems } from '@/lib/database';

interface PantryItemRequest {
  name: string;
  category: string;
  qty: string;
  estimatedPrice?: number;
}

interface PantryUpdateRequest {
  items: PantryItemRequest[];
  prompt?: string;
  tokensUsed?: number;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ planId: string }> }) {
  try {
    // Skip database in development unless forced
    if (process.env.NODE_ENV === 'development' && !process.env.FORCE_DATABASE) {
      return NextResponse.json({
        success: true,
        items: []
      });
    }

    await initializeDatabase();
    
    const { planId: planIdStr } = await params;
    const planId = parseInt(planIdStr);
    if (isNaN(planId)) {
      return NextResponse.json(
        { error: 'Invalid plan ID' },
        { status: 400 }
      );
    }

    const items = await getPantryItems(planId);
    
    return NextResponse.json({
      success: true,
      items
    });

  } catch (error) {
    console.error('Error fetching pantry items:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ planId: string }> }) {
  try {
    // Skip database in development unless forced
    if (process.env.NODE_ENV === 'development' && !process.env.FORCE_DATABASE) {
      return NextResponse.json({
        success: true,
        message: 'Pantry items updated successfully (development mode)'
      });
    }

    await initializeDatabase();
    
    const { planId: planIdStr } = await params;
    const planId = parseInt(planIdStr);
    if (isNaN(planId)) {
      return NextResponse.json(
        { error: 'Invalid plan ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { items, prompt, tokensUsed } = body as PantryUpdateRequest;

    if (!Array.isArray(items)) {
      return NextResponse.json(
        { error: 'Items must be an array' },
        { status: 400 }
      );
    }

    // Validate items
    const validatedItems = items.map((item, index) => {
      if (!item.name || !item.category || !item.qty) {
        throw new Error(`Item ${index + 1} is missing required fields (name, category, qty)`);
      }
      
      // Safely handle price conversion
      let estimatedPrice = 0;
      if (item.estimatedPrice !== undefined && item.estimatedPrice !== null) {
        const priceNum = typeof item.estimatedPrice === 'string' ? parseFloat(item.estimatedPrice) : Number(item.estimatedPrice);
        estimatedPrice = isNaN(priceNum) ? 0 : Math.max(0, priceNum);
      }
      
      return {
        name: item.name.toLowerCase().trim(),
        category: item.category.toLowerCase().trim(),
        qty: item.qty.trim(),
        estimated_price: estimatedPrice
      };
    });

    await updatePantryItems(planId, validatedItems, prompt, tokensUsed);
    
    return NextResponse.json({
      success: true,
      message: `Successfully updated ${validatedItems.length} pantry items`,
      itemCount: validatedItems.length
    });

  } catch (error) {
    console.error('Error updating pantry items:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ planId: string }> }) {
  try {
    // Skip database in development unless forced
    if (process.env.NODE_ENV === 'development' && !process.env.FORCE_DATABASE) {
      return NextResponse.json({
        success: true,
        message: 'Pantry items cleared successfully (development mode)'
      });
    }

    await initializeDatabase();
    
    const { planId: planIdStr } = await params;
    const planId = parseInt(planIdStr);
    if (isNaN(planId)) {
      return NextResponse.json(
        { error: 'Invalid plan ID' },
        { status: 400 }
      );
    }

    await updatePantryItems(planId, []); // Clear all items
    
    return NextResponse.json({
      success: true,
      message: 'All pantry items cleared successfully'
    });

  } catch (error) {
    console.error('Error clearing pantry items:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}