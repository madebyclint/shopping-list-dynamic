import { NextRequest, NextResponse } from 'next/server';
import { initializeDatabase, getWeeklyMealPlan, createGroceryList, updateAIUsageStats } from '@/lib/database';
import { parseGroceryListText } from '@/lib/utils';
import OpenAI from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface ShoppingListRequest {
  planId: number;
  listName?: string;
}

export async function POST(request: NextRequest) {
  try {
    await initializeDatabase();
    
    const body = await request.json();
    const { planId, listName } = body as ShoppingListRequest;

    if (!planId) {
      return NextResponse.json(
        { error: 'Plan ID is required' },
        { status: 400 }
      );
    }

    // Get the meal plan and its meals
    const planData = await getWeeklyMealPlan(planId);
    if (!planData) {
      return NextResponse.json(
        { error: 'Meal plan not found' },
        { status: 404 }
      );
    }

    const { plan, meals } = planData;

    // Generate the shopping list name if not provided
    const defaultListName = `Shopping for ${plan.name} (Week of ${new Date(plan.week_start_date).toLocaleDateString()})`;
    const finalListName = listName || defaultListName;

    // Extract ingredients from all meals
    let rawIngredients = '';
    const mealIngredients: string[] = [];

    meals.forEach((meal, index) => {
      if (meal.main_ingredients && meal.meal_type === 'cooking') {
        // Add a header for each meal
        mealIngredients.push(`\n# ${meal.title || `Day ${meal.day_of_week + 1} Meal`}`);
        mealIngredients.push(meal.main_ingredients);
      }
    });

    if (mealIngredients.length === 0) {
      return NextResponse.json(
        { error: 'No cooking meals with ingredients found in this plan' },
        { status: 400 }
      );
    }

    rawIngredients = mealIngredients.join('\n');

    // Parse the ingredients into structured items
    const parsedItems = parseGroceryListText(rawIngredients);

    // Add price estimates using AI
    const itemsWithPrices = await addPriceEstimates(parsedItems);

    // Create the grocery list in the database
    const listId = await createGroceryList(finalListName, rawIngredients, itemsWithPrices);
    
    return NextResponse.json({ 
      id: listId, 
      name: finalListName,
      itemCount: itemsWithPrices.length,
      message: 'Shopping list generated successfully' 
    });

  } catch (error) {
    console.error('Error generating shopping list:', error);
    
    // Return mock success for development when DB is not available
    if (process.env.NODE_ENV === 'development') {
      return NextResponse.json({ 
        id: Date.now(), 
        name: 'Development Shopping List',
        itemCount: 5,
        message: 'Shopping list generated successfully (mock)' 
      });
    }
    
    return NextResponse.json(
      { error: 'Failed to generate shopping list' },
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