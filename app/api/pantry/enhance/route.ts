import { NextRequest, NextResponse } from 'next/server';
import { initializeDatabase, updateAIUsageStats } from '@/lib/database';
import OpenAI from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface PantryEnhanceRequest {
  prompt: string;
  planId: number;
}

export async function POST(request: NextRequest) {
  try {
    // Skip in development unless forced
    if (process.env.NODE_ENV === 'development' && !process.env.FORCE_DATABASE) {
      const body = await request.json();
      const { prompt } = body;
      
      // Return mock enhanced pantry items for development
      return NextResponse.json({
        success: true,
        message: 'Pantry items enhanced successfully (development mode)',
        items: [
          { name: 'olive oil', category: 'pantry', qty: '1 bottle', estimatedPrice: 4.99 },
          { name: 'garlic', category: 'produce', qty: '1 bulb', estimatedPrice: 0.99 },
          { name: 'salt', category: 'pantry', qty: '1 container', estimatedPrice: 1.49 }
        ],
        originalPrompt: prompt,
        tokensUsed: 450
      });
    }

    await initializeDatabase();
    
    const body = await request.json();
    const { prompt, planId } = body as PantryEnhanceRequest;

    if (!prompt || prompt.trim().length === 0) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    if (!planId) {
      return NextResponse.json(
        { error: 'Plan ID is required' },
        { status: 400 }
      );
    }

    const systemPrompt = `You are an AI shopping assistant specialized in converting user requests into detailed grocery shopping list items. Your job is to take a user's pantry/extras request and convert it into specific shopping list items with appropriate quantities and categories.

Guidelines:
1. Convert vague requests into specific grocery items
2. Suggest reasonable quantities for a typical household
3. Categorize items appropriately (produce, dairy, meat, pantry, frozen, etc.)
4. ALWAYS provide realistic price estimates in USD (very important!)
5. If the user mentions running low or needing to restock, suggest typical household quantities
6. For cooking ingredients, consider standard recipe amounts
7. Break down complex requests into individual items
8. Base prices on current 2026 grocery store prices

Categories to use: produce, meat, dairy, pantry, frozen, beverages, snacks, household, personal care, other

IMPORTANT: Always include a numeric estimatedPrice for each item. Examples:
- Bananas: $1.99
- Milk (1 gallon): $3.49
- Bread: $2.79
- Olive oil: $4.99

Return your response as a JSON array of objects with this structure:
{
  "name": "specific item name",
  "category": "appropriate category", 
  "qty": "quantity with unit (e.g., 1 bottle, 2 lbs, 1 dozen)",
  "estimatedPrice": 1.99
}

Example input: "need stuff for making pasta and some basic pantry staples"
Example output: [
  {"name": "spaghetti pasta", "category": "pantry", "qty": "1 lb box", "estimatedPrice": 1.29},
  {"name": "marinara sauce", "category": "pantry", "qty": "1 jar", "estimatedPrice": 2.49},
  {"name": "olive oil", "category": "pantry", "qty": "1 bottle", "estimatedPrice": 4.99},
  {"name": "garlic", "category": "produce", "qty": "1 bulb", "estimatedPrice": 0.99}
]`;

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { 
            role: "system", 
            content: systemPrompt
          },
          { 
            role: "user", 
            content: `Please convert this pantry/extras request into specific shopping list items: "${prompt}"` 
          }
        ],
        temperature: 0.3,
        max_tokens: 1000
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        throw new Error('No response from OpenAI');
      }

      // Parse the JSON response
      let enhancedItems;
      try {
        enhancedItems = JSON.parse(response);
      } catch (parseError) {
        console.error('Failed to parse OpenAI response as JSON:', response);
        throw new Error('Invalid response format from AI');
      }

      // Validate the response structure
      if (!Array.isArray(enhancedItems)) {
        throw new Error('AI response is not an array');
      }

      // Ensure each item has required fields
      const validatedItems = enhancedItems.map((item, index) => {
        if (!item.name || !item.category || !item.qty) {
          throw new Error(`Item ${index + 1} is missing required fields`);
        }
        
        // Ensure price is a valid number
        let estimatedPrice = 0;
        if (item.estimatedPrice !== undefined && item.estimatedPrice !== null) {
          const priceNum = typeof item.estimatedPrice === 'string' ? parseFloat(item.estimatedPrice) : Number(item.estimatedPrice);
          estimatedPrice = isNaN(priceNum) ? 0 : Math.max(0, priceNum);
        }
        
        return {
          name: item.name.toLowerCase(),
          category: item.category.toLowerCase(),
          qty: item.qty,
          estimatedPrice: estimatedPrice
        };
      });

      // Track AI usage
      const tokensUsed = completion.usage?.total_tokens || 0;
      try {
        await updateAIUsageStats(1, tokensUsed);
      } catch (statsError) {
        console.warn('Failed to update AI usage stats:', statsError);
      }

      return NextResponse.json({
        success: true,
        message: `Successfully enhanced ${validatedItems.length} pantry items`,
        items: validatedItems,
        originalPrompt: prompt,
        tokensUsed
      });

    } catch (aiError) {
      console.error('OpenAI API error:', aiError);
      return NextResponse.json(
        { error: 'Failed to enhance pantry items with AI' },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Error in pantry enhance endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}