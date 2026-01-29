import { NextRequest, NextResponse } from 'next/server';
import { initializeDatabase, getWeeklyMealPlan, createGroceryList, updateAIUsageStats, searchIngredients, findExistingListForMealPlan, updateExistingList, deleteGroceryListItems, addItemsToGroceryList, getPantryItems } from '@/lib/database';
import { parseGroceryListText, consolidateDuplicateIngredients, processIngredientsWithAI, findSimilarIngredients } from '@/lib/utils';
import OpenAI from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface ShoppingListRequest {
  planId: number;
  listName?: string;
  forceNew?: boolean;
  forceRefresh?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    // Skip database in development for faster response, unless forced
    if (process.env.NODE_ENV === 'development' && !process.env.FORCE_DATABASE) {
      const body = await request.json();
      const { planId, listName } = body;
      
      if (!planId) {
        return NextResponse.json(
          { error: 'Plan ID is required' },
          { status: 400 }
        );
      }

      // Return mock success response for development
      return NextResponse.json({ 
        id: Date.now(), 
        name: listName || `Mock Shopping List - ${new Date().toLocaleDateString()}`,
        itemCount: 15,
        duplicatesFound: 2,
        similarItems: { 'chicken breast': 'poultry', 'onions': 'vegetables' },
        isUpdate: false,
        preservationStats: { preserved: 0, added: 15, updated: 0 },
        message: 'Shopping list generated successfully (development mode - no database)' 
      });
    }

    await initializeDatabase();
    
    const body = await request.json();
    const { planId, listName, forceNew = false, forceRefresh = false } = body as ShoppingListRequest;

    if (!planId) {
      return NextResponse.json(
        { error: 'Plan ID is required' },
        { status: 400 }
      );
    }

    // Get the meal plan and its meals
    const planData = await getWeeklyMealPlan(planId);
    if (!planData) {
      // In development, provide mock meal plan data if not found
      if (process.env.NODE_ENV === 'development') {
        console.log('Meal plan not found, returning mock success in development mode');
        return NextResponse.json({ 
          id: Date.now(), 
          name: listName || `Mock Shopping List - ${new Date().toLocaleDateString()}`,
          itemCount: 12,
          duplicatesFound: 1,
          similarItems: { 'chicken': 'poultry' },
          isUpdate: false,
          preservationStats: { preserved: 0, added: 12, updated: 0 },
          message: 'Shopping list generated successfully (development mode - mock meal plan)' 
        });
      }
      return NextResponse.json(
        { error: 'Meal plan not found' },
        { status: 404 }
      );
    }

    const { plan, meals } = planData;

    // Check for existing shopping list for this meal plan
    const existingList = !forceNew ? await findExistingListForMealPlan(planId) : null;

    // Generate the shopping list name if not provided
    const defaultListName = `Shopping for ${plan.name} (Week of ${new Date(plan.week_start_date).toLocaleDateString()})`;
    const finalListName = listName || defaultListName;

    // Extract ingredients from all meals
    let rawIngredients = '';
    const mealIngredients: string[] = [];

    meals.forEach((meal, index) => {
      if (meal.main_ingredients) {
        // Add a header for each meal
        mealIngredients.push(`\n# ${meal.title || `Day ${meal.day_of_week + 1} Meal`}`);
        mealIngredients.push(meal.main_ingredients);
      }
    });

    // Get pantry items for this meal plan
    let pantryItems: any[] = [];
    try {
      pantryItems = await getPantryItems(planId);
      if (pantryItems.length > 0) {
        // Add pantry items as a separate section
        mealIngredients.push('\n# Pantry & Extras');
        pantryItems.forEach(item => {
          mealIngredients.push(`${item.qty} ${item.name}`);
        });
      }
    } catch (error) {
      console.warn('Error fetching pantry items:', error);
      // Continue without pantry items if there's an error
    }

    if (mealIngredients.length === 0) {
      return NextResponse.json(
        { error: 'No meals with ingredients found in this plan' },
        { status: 400 }
      );
    }

    rawIngredients = mealIngredients.join('\n');

    // Parse the ingredients into structured items
    const parsedItems = parseGroceryListText(rawIngredients);

    // Step 1: Enhanced consolidation with intelligent duplicate detection
    const consolidatedItems = consolidateDuplicateIngredients(parsedItems);

    // Step 2: Check for similar ingredients in existing database
    const similarItems = await findSimilarIngredients(consolidatedItems, searchIngredients);
    
    // Step 3: Comprehensive AI processing (units, consolidation, pricing, categorization)
    let processedItems = consolidatedItems;
    
    try {
      processedItems = await processIngredientsWithAI(consolidatedItems, openai);
      
      // Update AI usage stats for comprehensive processing
      const tokensUsed = (processIngredientsWithAI as any).lastTokenUsage || 0;
      if (tokensUsed > 0) {
        await updateAIUsageStats(1, tokensUsed);
      }
      
    } catch (error) {
      console.error('Error in comprehensive AI processing:', error);
      // Fall back to basic price estimation if full AI processing fails
      processedItems = await addPriceEstimates(consolidatedItems);
    }

    let listId: number;
    let preservationStats = { preserved: 0, added: 0, updated: 0 };
    let isUpdate = false;

    if (existingList && !forceRefresh) {
      // Update existing list: Replace all items with current meal ingredients, but preserve customizations
      listId = existingList.list.id!;
      
      // Get current items that match the new ingredients (to preserve customizations)
      const currentItemsMap = new Map();
      existingList.items.forEach(item => {
        const key = item.name.toLowerCase().trim();
        currentItemsMap.set(key, item);
      });
      
      // Apply customizations to new items where applicable
      const itemsWithCustomizations = processedItems.map(newItem => {
        const key = newItem.name.toLowerCase().trim();
        const existingItem = currentItemsMap.get(key);
        
        if (existingItem) {
          // Preserve user customizations but update meal information
          return {
            ...newItem,
            category: existingItem.category, // Keep user's category choice
            price: existingItem.price, // Keep user's price
            qty: existingItem.qty // Keep user's quantity adjustment
          };
        }
        return newItem;
      });
      
      // Replace all items with the new set (removes ingredients from deleted meals)
      await deleteGroceryListItems(listId);
      await addItemsToGroceryList(listId, itemsWithCustomizations);
      
      const preserved = itemsWithCustomizations.filter(item => {
        const key = item.name.toLowerCase().trim();
        return currentItemsMap.has(key);
      }).length;
      
      preservationStats = { 
        preserved, 
        added: itemsWithCustomizations.length - preserved, 
        updated: 0 
      };
      isUpdate = true;
    } else if (existingList && forceRefresh) {
      // Force refresh: Delete existing items and recreate with fresh AI categorization
      listId = existingList.list.id!;
      await deleteGroceryListItems(listId);
      await addItemsToGroceryList(listId, processedItems);
      isUpdate = true;
      preservationStats = { preserved: 0, added: processedItems.length, updated: 0 };
    } else {
      // Create new grocery list in the database
      console.log('Creating new grocery list:', finalListName, 'with', processedItems.length, 'items');
      listId = await createGroceryList(finalListName, rawIngredients, processedItems, planId);
      console.log('Created grocery list with ID:', listId);
    }
    
    console.log('Shopping list generation completed successfully. ListId:', listId);
    
    return NextResponse.json({ 
      id: listId, 
      name: finalListName,
      itemCount: processedItems.length,
      duplicatesFound: Object.keys(similarItems).length,
      similarItems: similarItems,
      isUpdate,
      preservationStats,
      message: isUpdate 
        ? forceRefresh
          ? `Shopping list refreshed! All ${preservationStats.added} items recategorized with fresh AI processing`
          : `Shopping list updated! ${preservationStats.preserved} customizations preserved, ${preservationStats.added} new items added, removed ingredients from changed meals`
        : 'Shopping list generated with AI-powered consolidation, smart units, and price estimation' 
    });

  } catch (error) {
    console.error('Error generating shopping list:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : 'No stack trace';
    console.error('Error details:', errorMessage);
    console.error('Error stack:', errorStack);
    
    // Don't return mock success - let the error be visible
    return NextResponse.json(
      { error: `Failed to generate shopping list: ${errorMessage}` },
      { status: 500 }
    );
  }
}

async function addPriceEstimates(items: any[]): Promise<any[]> {
  try {
    // Group items by category for more efficient AI calls
    const itemsByCategory: { [key: string]: any[] } = {};
    items.forEach(item => {
      if (!itemsByCategory[item.category]) {
        itemsByCategory[item.category] = [];
      }
      itemsByCategory[item.category].push(item);
    });

    const itemsWithPrices: any[] = [];
    let totalTokens = 0;

    // Process each category
    for (const [category, categoryItems] of Object.entries(itemsByCategory)) {
      const itemNames = categoryItems.map(item => `${item.qty || '1'} ${item.name}`).join(', ');
      
      const prompt = `Estimate grocery prices for these ${category.toLowerCase()} items in Brooklyn, NY for January 2026. Return ONLY a JSON array with format [{"name": "item_name", "price": "X.XX"}]. Items: ${itemNames}`;
      
      try {
        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 500
        });

        totalTokens += response.usage?.total_tokens || 0;
        
        const rawContent = response.choices[0].message.content || '[]';
        const cleanContent = cleanAIResponse(rawContent);
        const priceData = JSON.parse(cleanContent);
        
        // Match prices back to items
        categoryItems.forEach(item => {
          const priceInfo = priceData.find((p: any) => 
            p.name.toLowerCase().includes(item.name.toLowerCase()) || 
            item.name.toLowerCase().includes(p.name.toLowerCase())
          );
          
          item.price = priceInfo?.price || '2.99'; // Default fallback price
          itemsWithPrices.push(item);
        });
      } catch (aiError) {
        console.error(`Error estimating prices for ${category}:`, aiError);
        // Add items with default prices on AI error
        categoryItems.forEach(item => {
          item.price = '2.99';
          itemsWithPrices.push(item);
        });
      }
    }

    // Update AI usage stats
    if (totalTokens > 0) {
      await updateAIUsageStats(1, totalTokens);
    }

    return itemsWithPrices;
  } catch (error) {
    console.error('Error in addPriceEstimates:', error);
    // Return original items with default prices on error
    return items.map(item => ({ ...item, price: item.price || '2.99' }));
  }
}

function cleanAIResponse(content: string): string {
  // Remove markdown code blocks and clean up AI responses
  return content
    .replace(/```json\s*/gi, '') // Remove ```json
    .replace(/```\s*/gi, '') // Remove closing ```
    .replace(/^\s*[\[\{]/, match => match.trim()) // Clean leading whitespace before JSON
    .replace(/[\]\}]\s*$/, match => match.trim()) // Clean trailing whitespace after JSON
    .trim();
}