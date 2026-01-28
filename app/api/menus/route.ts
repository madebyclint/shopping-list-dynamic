import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { 
  createWeeklyMealPlan, 
  createMeal, 
  initializeAIMenuTables,
  findSimilarMenuInCache,
  saveMenuToCache,
  updateAIUsageStats,
  getAIUsageStats
} from '@/lib/database';
import crypto from 'crypto';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Family context for AI prompts
const FAMILY_CONTEXT = {
  location: "Brooklyn, NY",
  size: 4,
  preferences: "Budget-friendly, rainbow palette (colorful vegetables), complexity variety",
  constraints: "Busy family schedule, prefer 30-minute weeknight meals with occasional complex weekend cooking"
};

interface AIMenuRequest {
  weekStartDate: string;
  name?: string;
  preferences?: string;
}

interface GeneratedMeal {
  day_of_week: number;
  meal_type: 'cooking' | 'leftovers' | 'eating_out';
  title: string;
  comfort_flag: boolean;
  shortcut_flag: boolean;
  cultural_riff_flag: boolean;
  veggie_inclusion: boolean;
}

// Cost tracking (simple approach for now)
let aiUsageCount = 0;
let totalTokensUsed = 0;

function generateAIPrompt(weekStartDate: string, preferences?: string): string {
  const customPrefs = preferences ? ` Additional preferences: ${preferences}` : '';
  
  return `You are a family meal planning expert. Generate a weekly meal plan for a ${FAMILY_CONTEXT.location} family of ${FAMILY_CONTEXT.size}.

REQUIREMENTS:
- Generate exactly 7 meals: 6 dinners (Monday-Saturday) + 1 Sunday breakfast
- Family preferences: ${FAMILY_CONTEXT.preferences}${customPrefs}
- Constraints: ${FAMILY_CONTEXT.constraints}
- Week starting: ${weekStartDate}

MEAL GUIDELINES:
- Dinners: Mix of 30-min weeknight meals and 1-2 more complex weekend dishes
- Sunday breakfast: Special family breakfast (pancakes, french toast, etc.)
- Include variety: comfort food, international cuisines, fresh/seasonal ingredients
- Emphasize colorful vegetables in each meal
- Budget-conscious but flavorful options

RESPONSE FORMAT (JSON only, no markdown):
{
  "meals": [
    {
      "day_of_week": 0, // 0=Sunday, 1=Monday, etc.
      "meal_type": "cooking", // "cooking", "leftovers", "eating_out"
      "title": "Meal Name",
      "comfort_flag": false, // true for comfort foods
      "shortcut_flag": false, // true for quick 30-min meals
      "cultural_riff_flag": false, // true for international/ethnic dishes
      "veggie_inclusion": true // true if emphasizes vegetables
    }
  ]
}

Ensure all 7 meals are included (Sunday breakfast + 6 dinners).`;
}

async function checkSimilarMenuInCache(weekStartDate: string, preferences: string = ''): Promise<any | null> {
  try {
    // Create hash of preferences for consistent cache lookup
    const preferencesHash = crypto.createHash('md5').update(preferences).digest('hex');
    
    // Use the enhanced cache lookup
    const cachedResult = await findSimilarMenuInCache(weekStartDate, preferencesHash);
    
    if (cachedResult) {
      console.log('Found cached menu for similar preferences');
      return {
        plan: cachedResult.plan,
        meals: cachedResult.meals,
        fromCache: true,
        preferencesHash
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error checking menu cache:', error);
    return null;
  }
}

async function generateMenuWithAI(prompt: string): Promise<GeneratedMeal[]> {
  try {
    console.log('Generating menu with OpenAI...');
    const startTime = Date.now();
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are a professional meal planning assistant specializing in family-friendly, budget-conscious meal plans. Always respond with valid JSON only."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 1500,
      temperature: 0.8, // Some creativity but still reliable
    });

    const responseTime = Date.now() - startTime;
    console.log(`OpenAI API response time: ${responseTime}ms`);

    // Update usage tracking
    aiUsageCount++;
    totalTokensUsed += completion.usage?.total_tokens || 0;
    
    if (responseTime > 30000) {
      console.warn('Response time exceeded 30 seconds');
    }

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      throw new Error('No response from OpenAI');
    }

    const parsedResponse = JSON.parse(response);
    
    if (!parsedResponse.meals || !Array.isArray(parsedResponse.meals)) {
      throw new Error('Invalid response format from AI');
    }

    // Validate we have the right number of meals
    if (parsedResponse.meals.length !== 7) {
      throw new Error(`Expected 7 meals, got ${parsedResponse.meals.length}`);
    }

    return parsedResponse.meals;
    
  } catch (error) {
    console.error('Error generating menu with AI:', error);
    throw new Error(`AI menu generation failed: ${error.message}`);
  }
}

function generateFallbackMenu(weekStartDate: string): GeneratedMeal[] {
  console.log('Generating fallback menu...');
  
  return [
    { day_of_week: 0, meal_type: 'cooking', title: 'Sunday Pancakes with Berries', comfort_flag: true, shortcut_flag: false, cultural_riff_flag: false, veggie_inclusion: true },
    { day_of_week: 1, meal_type: 'cooking', title: 'Monday Quick Stir-Fry', comfort_flag: false, shortcut_flag: true, cultural_riff_flag: true, veggie_inclusion: true },
    { day_of_week: 2, meal_type: 'cooking', title: 'Tuesday Pasta Primavera', comfort_flag: false, shortcut_flag: true, cultural_riff_flag: false, veggie_inclusion: true },
    { day_of_week: 3, meal_type: 'cooking', title: 'Wednesday Chicken & Vegetables', comfort_flag: false, shortcut_flag: true, cultural_riff_flag: false, veggie_inclusion: true },
    { day_of_week: 4, meal_type: 'cooking', title: 'Thursday Tacos', comfort_flag: false, shortcut_flag: true, cultural_riff_flag: true, veggie_inclusion: true },
    { day_of_week: 5, meal_type: 'cooking', title: 'Friday Pizza Night', comfort_flag: true, shortcut_flag: true, cultural_riff_flag: false, veggie_inclusion: true },
    { day_of_week: 6, meal_type: 'cooking', title: 'Saturday Slow-Cooked Stew', comfort_flag: true, shortcut_flag: false, cultural_riff_flag: false, veggie_inclusion: true }
  ];
}

async function saveMenuToDatabase(meals: GeneratedMeal[], weekStartDate: string, name: string): Promise<number> {
  try {
    // Create the weekly meal plan
    const planId = await createWeeklyMealPlan(name, weekStartDate);
    
    // Create each meal
    for (const meal of meals) {
      await createMeal({
        plan_id: planId,
        day_of_week: meal.day_of_week,
        meal_type: meal.meal_type,
        title: meal.title,
        comfort_flag: meal.comfort_flag,
        shortcut_flag: meal.shortcut_flag,
        cultural_riff_flag: meal.cultural_riff_flag,
        veggie_inclusion: meal.veggie_inclusion
      });
    }
    
    return planId;
  } catch (error) {
    console.error('Error saving menu to database:', error);
    throw error;
  }
}

export async function POST(req: NextRequest) {
  try {
    // Initialize AI tables if they don't exist
    await initializeAIMenuTables();
    
    const body: AIMenuRequest = await req.json();
    const { weekStartDate, name, preferences = '' } = body;
    
    // Validate required fields
    if (!weekStartDate) {
      return NextResponse.json(
        { error: 'weekStartDate is required' },
        { status: 400 }
      );
    }

    // Check OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    console.log(`Generating menu for week starting ${weekStartDate}`);

    // Step 1: Check cache first (with preferences consideration)
    const cachedResult = await checkSimilarMenuInCache(weekStartDate, preferences);
    if (cachedResult && cachedResult.fromCache) {
      const stats = await getAIUsageStats();
      return NextResponse.json({
        success: true,
        planId: cachedResult.plan.id,
        meals: cachedResult.meals,
        message: 'Using cached menu with similar preferences',
        fromCache: true,
        usageStats: stats
      });
    }

    // Step 2: Generate with AI (with timeout and error handling)
    let generatedMeals: GeneratedMeal[];
    let usedFallback = false;
    let tokensUsed = 0;
    let generationTimeMs = 0;
    
    try {
      const prompt = generateAIPrompt(weekStartDate, preferences);
      const startTime = Date.now();
      generatedMeals = await generateMenuWithAI(prompt);
      generationTimeMs = Date.now() - startTime;
      
      // Get token usage from the last API call (stored in generateMenuWithAI)
      tokensUsed = totalTokensUsed;
    } catch (aiError) {
      console.error('AI generation failed, using fallback:', aiError);
      generatedMeals = generateFallbackMenu(weekStartDate);
      usedFallback = true;
      generationTimeMs = 100; // Fallback is instant
    }

    // Step 3: Save to database
    const planName = name || `AI Menu - Week of ${new Date(weekStartDate).toLocaleDateString()}`;
    const planId = await saveMenuToDatabase(generatedMeals, weekStartDate, planName);

    // Step 4: Update cache and usage stats
    if (!usedFallback) {
      const preferencesHash = crypto.createHash('md5').update(preferences).digest('hex');
      await saveMenuToCache(weekStartDate, planId, preferencesHash, tokensUsed, generationTimeMs);
      await updateAIUsageStats(1, tokensUsed);
    }

    const finalStats = await getAIUsageStats();

    return NextResponse.json({
      success: true,
      planId,
      meals: generatedMeals,
      message: usedFallback ? 'Generated with fallback menu' : 'Generated with AI',
      fromCache: false,
      usedFallback,
      generationTimeMs,
      tokensUsed,
      usageStats: finalStats
    });

  } catch (error) {
    console.error('Menu generation error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate menu',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve usage statistics
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  
  if (action === 'stats') {
    const stats = await getAIUsageStats();
    return NextResponse.json({
      ...stats,
      estimatedCost: parseFloat(stats.total_cost_estimate || 0).toFixed(4)
    });
  }
  
  return NextResponse.json({
    message: 'AI Menu Generation API',
    endpoints: {
      'POST /api/menus': 'Generate new menu',
      'GET /api/menus?action=stats': 'Get usage statistics'
    }
  });
}