import { NextRequest, NextResponse } from 'next/server';
import { initializeDatabase, addItemToList, findExistingListForMealPlan, getPantryItems } from '@/lib/database';

interface AddPantryToListRequest {
  planId: number;
  listId?: number; // Optional - if not provided, will find existing list for meal plan
}

// Helper function to safely format price
function formatPrice(price: any): string {
  if (price === null || price === undefined || price === '') {
    return '$0.00';
  }
  
  const numPrice = typeof price === 'string' ? parseFloat(price) : Number(price);
  
  if (isNaN(numPrice)) {
    return '$0.00';
  }
  
  return `$${numPrice.toFixed(2)}`;
}

export async function POST(request: NextRequest) {
  try {
    // Skip database in development unless forced
    if (process.env.NODE_ENV === 'development' && !process.env.FORCE_DATABASE) {
      const body = await request.json();
      return NextResponse.json({
        success: true,
        message: 'Pantry items added to shopping list successfully (development mode)',
        addedItems: 5,
        listId: 123
      });
    }

    await initializeDatabase();
    
    const body = await request.json();
    const { planId, listId } = body as AddPantryToListRequest;

    if (!planId) {
      return NextResponse.json(
        { error: 'Plan ID is required' },
        { status: 400 }
      );
    }

    // Get pantry items for this plan
    const pantryItems = await getPantryItems(planId);
    
    if (pantryItems.length === 0) {
      return NextResponse.json(
        { error: 'No pantry items found for this meal plan' },
        { status: 400 }
      );
    }

    // Find the shopping list to add to
    let targetListId = listId;
    let targetList = null;

    if (!targetListId) {
      // Find existing list for this meal plan
      targetList = await findExistingListForMealPlan(planId);
      if (!targetList) {
        return NextResponse.json(
          { error: 'No shopping list found for this meal plan. Please generate a shopping list first.' },
          { status: 400 }
        );
      }
      targetListId = targetList.list.id;
    }

    // Convert pantry items to grocery list items format
    let addedCount = 0;
    for (const pantryItem of pantryItems) {
      try {
        await addItemToList(targetListId!, {
          name: pantryItem.name,
          qty: pantryItem.qty,
          price: formatPrice(pantryItem.estimated_price),
          category: pantryItem.category,
          meal: 'Pantry & Extras',
          is_purchased: false,
          is_skipped: false
        });
        addedCount++;
      } catch (error) {
        console.warn(`Failed to add pantry item ${pantryItem.name}:`, error);
        // Continue with other items
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully added ${addedCount} pantry items to shopping list`,
      addedItems: addedCount,
      listId: targetListId,
      pantryItemsProcessed: pantryItems.length
    });

  } catch (error) {
    console.error('Error adding pantry items to shopping list:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}