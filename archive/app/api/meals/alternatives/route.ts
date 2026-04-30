import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { 
  createMeal, 
  updateMeal,
  initializeAIMenuTables,
  updateAIUsageStats,
  getAIUsageStats
} from '@/lib/database';
import crypto from 'crypto';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Family context for individual meal generation
const FAMILY_CONTEXT = {
  location: "Brooklyn, NY",
  size: 4,
  preferences: "Budget-friendly, rainbow palette (colorful vegetables), complexity variety",
  constraints: "Busy family schedule, prefer 30-minute weeknight meals with occasional complex weekend cooking"
};

interface MealAlternativeRequest {
  mealId: number;
  currentMeal: string;
  currentIngredients?: string;
  dayOfWeek: number; // 0-6 
  mealType: 'cooking' | 'leftovers' | 'eating_out';
  prompt?: string;
  actionType: 'alternative' | 'modify';
  previousSuggestions?: string[];
  // Legacy support
  preferences?: string;
  avoidIngredients?: string;
}

function generateMealAlternativePrompt(
  currentMeal: string, 
  dayOfWeek: number, 
  actionType: 'alternative' | 'modify',
  prompt?: string,
  currentIngredients?: string,
  previousSuggestions?: string[]
): string {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = dayNames[dayOfWeek];
  
  const mealTypeContext = dayOfWeek === 0 ? 'breakfast' : 'dinner';
  const complexityHint = dayOfWeek === 0 || dayOfWeek === 6 ? 'can be more elaborate' : 'should be quick 30-minute meal';
  
  if (actionType === 'modify') {
    const ingredientsText = currentIngredients ? ` Current ingredients include: ${currentIngredients}.` : '';
    return `You are a meal planning assistant for a ${FAMILY_CONTEXT.location} family of ${FAMILY_CONTEXT.size}.

Current meal: "${currentMeal}"${ingredientsText}

Please MODIFY this existing meal based on this request: "${prompt}"

Keep the same base dish name and core concept, but adjust it according to the request. For example:
- If asked to "add more protein", keep "Pasta Primavera" but add chicken or beans
- If asked to "make it vegetarian", keep the same dish but replace meat with plant proteins
- If asked to "avoid dairy", keep the dish but use dairy-free alternatives

This is for ${dayName} ${mealTypeContext} and ${complexityHint}.

Return a JSON object with:
{
  "title": "Modified dish title (keep base name when possible)",
  "brief_description": "How this meal was modified (2-3 sentences)",
  "main_ingredients": "Key ingredients list",
  "reasoning": "Brief explanation of the modification",
  "comfort_flag": boolean,
  "shortcut_flag": boolean (true if 30min or less),
  "cultural_riff_flag": boolean,
  "veggie_inclusion": boolean
}`;
  } else {
    const avoidPrevious = previousSuggestions && previousSuggestions.length > 0 
      ? ` Avoid suggesting these meals that were already recommended: ${previousSuggestions.join(', ')}.`
      : '';
    
    return `You are a meal planning assistant for a ${FAMILY_CONTEXT.location} family of ${FAMILY_CONTEXT.size}.

Current meal: "${currentMeal}"

Please suggest a COMPLETELY DIFFERENT meal as an alternative${prompt ? ` based on this request: "${prompt}"` : ''}.${avoidPrevious}

This is for ${dayName} ${mealTypeContext} and ${complexityHint}.

Return a JSON object with:
{
  "title": "New meal title",
  "brief_description": "Brief description (2-3 sentences)",
  "main_ingredients": "Key ingredients list",
  "reasoning": "Brief explanation of why this is a good alternative",
  "comfort_flag": boolean,
  "shortcut_flag": boolean (true if 30min or less),
  "cultural_riff_flag": boolean,
  "veggie_inclusion": boolean
}`;
  }
}

export async function POST(req: NextRequest) {
  try {
    await initializeAIMenuTables();
    
    const body: MealAlternativeRequest = await req.json();
    const { 
      mealId, 
      currentMeal, 
      currentIngredients,
      dayOfWeek, 
      mealType,
      prompt,
      actionType = 'alternative',
      previousSuggestions = [],
      // Legacy support
      preferences = '', 
      avoidIngredients = '' 
    } = body;

    // Handle legacy requests
    const actualPrompt = prompt || [preferences, avoidIngredients].filter(Boolean).join('. ');

    // Validate required fields
    if (!mealId || !currentMeal || dayOfWeek === undefined) {
      return NextResponse.json(
        { error: 'mealId, currentMeal, and dayOfWeek are required' },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    console.log(`Generating ${actionType} for meal: ${currentMeal} with prompt: ${actualPrompt}`);

    try {
      const aiPrompt = generateMealAlternativePrompt(
        currentMeal,
        dayOfWeek,
        actionType,
        actualPrompt,
        currentIngredients,
        previousSuggestions
      );
      
      const completion = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "user",
            content: aiPrompt
          }
        ],
        temperature: 0.8,
        max_tokens: 800
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        throw new Error('No response from OpenAI');
      }

      const parsedResponse = JSON.parse(response);
      
      if (!parsedResponse.title) {
        throw new Error('Invalid response format from AI');
      }

      // Track usage
      const tokensUsed = completion.usage?.total_tokens || 0;
      await updateAIUsageStats(1, tokensUsed);

      const stats = await getAIUsageStats();

      return NextResponse.json({
        success: true,
        alternative: {
          title: parsedResponse.title,
          brief_description: parsedResponse.brief_description || '',
          main_ingredients: parsedResponse.main_ingredients || '',
          comfort_flag: parsedResponse.comfort_flag || false,
          shortcut_flag: parsedResponse.shortcut_flag || false,
          cultural_riff_flag: parsedResponse.cultural_riff_flag || false,
          veggie_inclusion: parsedResponse.veggie_inclusion || true,
          reasoning: parsedResponse.reasoning || 'AI-generated alternative'
        },
        originalMeal: currentMeal,
        tokensUsed,
        usageStats: stats
      });

    } catch (aiError) {
      console.error('AI alternative generation failed:', aiError);
      
      // Fallback alternatives based on day and current meal
      const fallbackAlternatives = {
        0: ['Sunday Pancakes', 'French Toast', 'Breakfast Burritos', 'Avocado Toast'],
        1: ['Quick Stir-Fry', 'Pasta Primavera', 'Chicken Wraps', 'Veggie Burgers'],
        2: ['Tacos', 'Stir-Fry Noodles', 'Grilled Cheese & Soup', 'Chicken Caesar Salad'],
        3: ['Sheet Pan Dinner', 'Pasta Bake', 'Stuffed Peppers', 'Fish & Vegetables'],
        4: ['Pizza Night', 'Burger & Fries', 'Chicken Fajitas', 'Fried Rice'],
        5: ['Take-out Night', 'Sandwich & Salad', 'Quesadillas', 'Soup & Bread'],
        6: ['Slow Cooker Stew', 'Roast Dinner', 'Homemade Pizza', 'Pasta with Meat Sauce']
      };

      const dayAlternatives = fallbackAlternatives[dayOfWeek as keyof typeof fallbackAlternatives] || fallbackAlternatives[1];
      const fallbackTitle = dayAlternatives[Math.floor(Math.random() * dayAlternatives.length)];

      return NextResponse.json({
        success: true,
        alternative: {
          title: fallbackTitle,
          comfort_flag: dayOfWeek === 0 || dayOfWeek === 6,
          shortcut_flag: dayOfWeek >= 1 && dayOfWeek <= 5,
          cultural_riff_flag: false,
          veggie_inclusion: true,
          reasoning: 'Fallback alternative (AI unavailable)'
        },
        originalMeal: currentMeal,
        usedFallback: true,
        tokensUsed: 0,
        usageStats: await getAIUsageStats()
      });
    }

  } catch (error) {
    console.error('Alternative generation error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate alternative',
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return NextResponse.json({
    message: 'AI Meal Alternative Generation API',
    usage: 'POST with mealId, currentMeal, dayOfWeek to generate alternatives'
  });
}