import { NextRequest, NextResponse } from 'next/server';
import { 
  updateMeal,
  bankMeal, 
  getBankedMeals,
  saveMealAlternative,
  getMealAlternatives,
  updateBankedMealUsage
} from '@/lib/database';

interface BankMealRequest {
  mealId: number;
  currentMeal: {
    title: string;
    day_of_week: number;
    meal_type: 'cooking' | 'leftovers' | 'eating_out';
    comfort_flag?: boolean;
    shortcut_flag?: boolean;
    cultural_riff_flag?: boolean;
    veggie_inclusion?: boolean;
  };
  bankReason?: string;
  rating?: number;
}

interface ReplaceMealRequest {
  mealId: number;
  newMeal: {
    title: string;
    brief_description?: string;
    main_ingredients?: string;
    comfort_flag?: boolean;
    shortcut_flag?: boolean;
    cultural_riff_flag?: boolean;
    veggie_inclusion?: boolean;
  };
  bankOriginal?: boolean;
  bankReason?: string;
  alternativeId?: number; // From alternatives history
}

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');
    
    switch (action) {
      case 'bank':
        return await handleBankMeal(req);
      case 'replace':
        return await handleReplaceMeal(req);
      case 'use-banked':
        return await handleUseBankedMeal(req);
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Meal banking error:', error);
    return NextResponse.json(
      { error: 'Failed to process request', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

async function handleBankMeal(req: NextRequest) {
  const body: BankMealRequest = await req.json();
  const { mealId, currentMeal, bankReason, rating } = body;

  // Bank the current meal
  const bankedId = await bankMeal({
    title: currentMeal.title,
    day_of_week: currentMeal.day_of_week,
    meal_type: currentMeal.meal_type,
    comfort_flag: currentMeal.comfort_flag,
    shortcut_flag: currentMeal.shortcut_flag,
    cultural_riff_flag: currentMeal.cultural_riff_flag,
    veggie_inclusion: currentMeal.veggie_inclusion,
    bank_reason: bankReason,
    rating,
    status: 'banked'
  });

  return NextResponse.json({
    success: true,
    bankedId,
    message: `Meal "${currentMeal.title}" banked successfully`
  });
}

async function handleReplaceMeal(req: NextRequest) {
  const body: ReplaceMealRequest = await req.json();
  const { mealId, newMeal, bankOriginal, bankReason, alternativeId } = body;

  // If banking the original, get current meal first
  if (bankOriginal) {
    // This would need the current meal data - we'd get it from the database first
    // For now, assume it's handled in the frontend
  }

  // Update the meal with the new one
  await updateMeal(mealId, {
    title: newMeal.title,
    brief_description: newMeal.brief_description,
    main_ingredients: newMeal.main_ingredients,
    comfort_flag: newMeal.comfort_flag,
    shortcut_flag: newMeal.shortcut_flag,
    cultural_riff_flag: newMeal.cultural_riff_flag,
    veggie_inclusion: newMeal.veggie_inclusion
  });

  // If this came from an alternative, mark it as chosen
  if (alternativeId) {
    await saveMealAlternative({
      original_meal_id: mealId,
      alternative_title: newMeal.title,
      chosen: true
    });
  }

  return NextResponse.json({
    success: true,
    message: `Meal updated to "${newMeal.title}"`
  });
}

async function handleUseBankedMeal(req: NextRequest) {
  const body: { mealId: number; bankedMealId: number } = await req.json();
  const { mealId, bankedMealId } = body;

  // Get the banked meal
  const bankedMeals = await getBankedMeals();
  const bankedMeal = bankedMeals.find(meal => meal.id === bankedMealId);
  
  if (!bankedMeal) {
    return NextResponse.json({ error: 'Banked meal not found' }, { status: 404 });
  }

  // Update the current meal with banked meal data
  await updateMeal(mealId, {
    title: bankedMeal.title,
    comfort_flag: bankedMeal.comfort_flag,
    shortcut_flag: bankedMeal.shortcut_flag,
    cultural_riff_flag: bankedMeal.cultural_riff_flag,
    veggie_inclusion: bankedMeal.veggie_inclusion
  });

  // Update usage count
  await updateBankedMealUsage(bankedMealId);

  return NextResponse.json({
    success: true,
    message: `Applied banked meal "${bankedMeal.title}"`
  });
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  const mealId = url.searchParams.get('mealId');
  
  try {
    if (action === 'banked-meals') {
      const status = url.searchParams.get('status');
      const bankedMeals = await getBankedMeals(status || undefined);
      return NextResponse.json({ bankedMeals });
    }
    
    if (action === 'alternatives' && mealId) {
      const alternatives = await getMealAlternatives(parseInt(mealId));
      return NextResponse.json({ alternatives });
    }
    
    return NextResponse.json({
      message: 'Meal Banking API',
      endpoints: {
        'POST ?action=bank': 'Bank current meal',
        'POST ?action=replace': 'Replace meal with new one',
        'POST ?action=use-banked': 'Use a banked meal',
        'GET ?action=banked-meals': 'Get all banked meals',
        'GET ?action=alternatives&mealId=X': 'Get alternatives for meal'
      }
    });
  } catch (error) {
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}