import { NextRequest, NextResponse } from 'next/server';
import { initializeDatabase, updateMeal, updateAIUsageStats } from '@/lib/database';
import OpenAI from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface EnhanceMealRequest {
  mealId: number;
  title: string;
  currentData?: {
    main_ingredients?: string;
    brief_description?: string;
    cooking_instructions?: string;
    estimated_time_minutes?: number;
  };
}

export async function POST(request: NextRequest) {
  try {
    // Skip in development unless forced
    if (process.env.NODE_ENV === 'development' && !process.env.FORCE_DATABASE) {
      return NextResponse.json({
        success: true,
        message: 'Meal enhanced successfully (development mode)',
        updatedFields: ['ingredients', 'description', 'instructions', 'time'],
        tokensUsed: 850
      });
    }

    await initializeDatabase();
    
    const body = await request.json();
    const { mealId, title, currentData = {} } = body as EnhanceMealRequest;

    if (!mealId || !title) {
      return NextResponse.json(
        { error: 'Meal ID and title are required' },
        { status: 400 }
      );
    }

    // Determine what data is missing
    const missingFields = [];
    if (!currentData.main_ingredients) missingFields.push('ingredients');
    if (!currentData.brief_description) missingFields.push('description');
    if (!currentData.cooking_instructions) missingFields.push('instructions');
    if (!currentData.estimated_time_minutes) missingFields.push('estimated time');

    if (missingFields.length === 0) {
      return NextResponse.json(
        { error: 'Meal already has complete data' },
        { status: 400 }
      );
    }

    // Create AI prompt to fill in missing data
    const prompt = `You are a culinary expert helping to complete meal planning data. 

Meal Title: "${title}"

Current Data:
${currentData.main_ingredients ? `Ingredients: ${currentData.main_ingredients}` : ''}
${currentData.brief_description ? `Description: ${currentData.brief_description}` : ''}
${currentData.cooking_instructions ? `Instructions: ${currentData.cooking_instructions}` : ''}
${currentData.estimated_time_minutes ? `Time: ${currentData.estimated_time_minutes} minutes` : ''}

Please provide the missing data in JSON format. Be practical and realistic:

${!currentData.main_ingredients ? '- main_ingredients: Comma-separated list of key ingredients needed' : ''}
${!currentData.brief_description ? '- brief_description: 1-sentence appealing description (max 120 chars)' : ''}
${!currentData.cooking_instructions ? '- cooking_instructions: Step-by-step cooking instructions as a single text string (practical, not overly detailed)' : ''}
${!currentData.estimated_time_minutes ? '- estimated_time_minutes: Total time including prep and cooking (realistic estimate as a number)' : ''}

IMPORTANT: Respond with ONLY a valid JSON object. Do not wrap in markdown code blocks. Do not include any other text.

Example format:
{
  "brief_description": "Fluffy pancakes with fresh fruit and syrup",
  "cooking_instructions": "Mix ingredients, cook on griddle, serve with fruit",
  "estimated_time_minutes": 25
}`;

    console.log('Enhancing meal with AI:', title);
    
    const startTime = Date.now();
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 800,
    });

    const aiResponse = completion.choices[0]?.message?.content;
    const tokensUsed = completion.usage?.total_tokens || 0;

    if (!aiResponse) {
      throw new Error('No response from AI');
    }

    // Parse AI response
    let enhancedData;
    try {
      // Clean up the AI response - remove markdown code blocks if present
      let cleanResponse = aiResponse.trim();
      if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      enhancedData = JSON.parse(cleanResponse);
      
      // Handle array format for cooking instructions (convert to string)
      if (enhancedData.cooking_instructions && Array.isArray(enhancedData.cooking_instructions)) {
        enhancedData.cooking_instructions = enhancedData.cooking_instructions.join(' ');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiResponse);
      console.error('Parse error:', parseError);
      throw new Error('Invalid AI response format');
    }

    // Prepare update object with only missing fields
    const updateData: any = { ...currentData };
    const updatedFields = [];

    if (!currentData.main_ingredients && enhancedData.main_ingredients) {
      updateData.main_ingredients = enhancedData.main_ingredients;
      updatedFields.push('ingredients');
    }
    if (!currentData.brief_description && enhancedData.brief_description) {
      updateData.brief_description = enhancedData.brief_description;
      updatedFields.push('description');
    }
    if (!currentData.cooking_instructions && enhancedData.cooking_instructions) {
      updateData.cooking_instructions = enhancedData.cooking_instructions;
      updatedFields.push('instructions');
    }
    if (!currentData.estimated_time_minutes && enhancedData.estimated_time_minutes) {
      updateData.estimated_time_minutes = enhancedData.estimated_time_minutes;
      updatedFields.push('time');
    }

    // Update the meal in database
    const success = await updateMeal(mealId, updateData);
    
    if (!success) {
      throw new Error('Failed to update meal in database');
    }

    // Track AI usage costs
    await updateAIUsageStats(1, tokensUsed);

    console.log(`Meal enhanced successfully. Updated: ${updatedFields.join(', ')}. Tokens: ${tokensUsed}`);

    return NextResponse.json({
      success: true,
      message: `Enhanced meal with ${updatedFields.join(', ')}`,
      updatedFields,
      tokensUsed,
      enhancedData: updateData
    });

  } catch (error) {
    console.error('Error enhancing meal:', error);
    return NextResponse.json(
      { 
        error: 'Failed to enhance meal',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}