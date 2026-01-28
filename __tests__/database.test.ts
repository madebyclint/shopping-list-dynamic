import { newDb } from 'pg-mem';
import { Pool } from 'pg';
import {
  initializeDatabase,
  initializeAIMenuTables,
  createGroceryList,
  getGroceryList,
  updateItemPurchaseStatus,
  getAllGroceryLists,
  createWeeklyMealPlan,
  createMeal,
  getWeeklyMealPlan,
  getAllWeeklyMealPlans,
  updateMeal,
  deleteWeeklyMealPlan,
  updateWeeklyMealPlan,
  findSimilarMenuInCache,
  saveMenuToCache,
  updateAIUsageStats,
  getAIUsageStats,
  bankMeal,
  getBankedMeals,
  updateBankedMealUsage,
  saveMealAlternative,
  getMealAlternatives,
  GroceryItem,
  Meal,
  BankedMeal,
  MealAlternativeHistory
} from '../lib/database';

// Mock the pg Pool
jest.mock('pg', () => {
  const mPool = {
    query: jest.fn(),
  };
  return { Pool: jest.fn(() => mPool) };
});

describe('Database Functions', () => {
  let mockPool: jest.Mocked<Pool>;
  let db: any;

  beforeEach(() => {
    // Create a new in-memory database for each test
    db = newDb();
    
    // Get the mock pool instance
    mockPool = new Pool() as jest.Mocked<Pool>;
    
    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('Database Initialization', () => {
    it('should initialize database tables successfully', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // SELECT 1
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // grocery_lists table
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // grocery_items table
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // weekly_meal_plans table
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // meals table

      await expect(initializeDatabase()).resolves.toBeUndefined();
      expect(mockPool.query).toHaveBeenCalledTimes(5);
    });

    it('should throw error when database connection fails', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Connection failed'));

      await expect(initializeDatabase()).rejects.toThrow('Connection failed');
    });

    it('should initialize AI menu tables successfully', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // ai_menu_cache
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // ai_usage_stats
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // banked_meals
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // meal_alternatives_history
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 }) // check stats count
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // insert initial stats

      await expect(initializeAIMenuTables()).resolves.toBeUndefined();
      expect(mockPool.query).toHaveBeenCalledTimes(6);
    });
  });

  describe('Grocery List Functions', () => {
    const mockGroceryItems: Omit<GroceryItem, 'id' | 'list_id' | 'created_at'>[] = [
      {
        name: 'Apples',
        qty: '6',
        price: '$4.99',
        category: 'Produce',
        meal: 'Snack'
      },
      {
        name: 'Bread',
        qty: '1 loaf',
        price: '$2.99',
        category: 'Bakery',
        meal: 'Breakfast'
      }
    ];

    it('should create a grocery list with items successfully', async () => {
      const mockListId = 1;
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: mockListId }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await createGroceryList('Weekly Shopping', 'Raw grocery text', mockGroceryItems);

      expect(result).toBe(mockListId);
      expect(mockPool.query).toHaveBeenCalledTimes(3); // 1 list + 2 items
    });

    it('should get grocery list with items successfully', async () => {
      const mockList = { id: 1, name: 'Test List', raw_text: 'Raw text', created_at: new Date() };
      const mockItems = [
        { id: 1, name: 'Apples', qty: '6', price: '$4.99', category: 'Produce', meal: 'Snack', list_id: 1 }
      ];

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockList], rowCount: 1 })
        .mockResolvedValueOnce({ rows: mockItems, rowCount: 1 });

      const result = await getGroceryList(1);

      expect(result).toEqual({
        list: mockList,
        items: mockItems
      });
      expect(mockPool.query).toHaveBeenCalledTimes(2);
    });

    it('should return null for non-existent grocery list', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await getGroceryList(999);

      expect(result).toBeNull();
      expect(mockPool.query).toHaveBeenCalledTimes(1);
    });

    it('should update item purchase status successfully', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await expect(updateItemPurchaseStatus(1, true)).resolves.toBeUndefined();
      expect(mockPool.query).toHaveBeenCalledWith(
        'UPDATE grocery_items SET is_purchased = $1 WHERE id = $2',
        [true, 1]
      );
    });

    it('should get all grocery lists successfully', async () => {
      const mockLists = [
        { id: 1, name: 'List 1', created_at: new Date() },
        { id: 2, name: 'List 2', created_at: new Date() }
      ];

      mockPool.query.mockResolvedValueOnce({ rows: mockLists, rowCount: 2 });

      const result = await getAllGroceryLists();

      expect(result).toEqual(mockLists);
      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT id, name, created_at FROM grocery_lists ORDER BY created_at DESC'
      );
    });
  });

  describe('Meal Plan Functions', () => {
    it('should create weekly meal plan successfully', async () => {
      const mockPlanId = 1;
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: mockPlanId }], rowCount: 1 });

      const result = await createWeeklyMealPlan('Week 1', '2024-01-01');

      expect(result).toBe(mockPlanId);
      expect(mockPool.query).toHaveBeenCalledWith(
        'INSERT INTO weekly_meal_plans (name, week_start_date) VALUES ($1, $2) RETURNING id',
        ['Week 1', '2024-01-01']
      );
    });

    it('should create meal successfully', async () => {
      const mockMealId = 1;
      const mockMeal: Omit<Meal, 'id' | 'created_at'> = {
        plan_id: 1,
        day_of_week: 1,
        meal_type: 'cooking',
        title: 'Pasta Night',
        brief_description: 'Delicious pasta',
        main_ingredients: 'pasta, tomatoes',
        comfort_flag: true,
        shortcut_flag: false,
        cultural_riff_flag: false,
        veggie_inclusion: true
      };

      mockPool.query.mockResolvedValueOnce({ rows: [{ id: mockMealId }], rowCount: 1 });

      const result = await createMeal(mockMeal);

      expect(result).toBe(mockMealId);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO meals'),
        [1, 1, 'cooking', 'Pasta Night', 'Delicious pasta', 'pasta, tomatoes', true, false, false, true]
      );
    });

    it('should get weekly meal plan with meals successfully', async () => {
      const mockPlan = { id: 1, name: 'Week 1', week_start_date: '2024-01-01' };
      const mockMeals = [
        { id: 1, plan_id: 1, day_of_week: 1, meal_type: 'cooking', title: 'Pasta' }
      ];

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockPlan], rowCount: 1 })
        .mockResolvedValueOnce({ rows: mockMeals, rowCount: 1 });

      const result = await getWeeklyMealPlan(1);

      expect(result).toEqual({
        plan: mockPlan,
        meals: mockMeals
      });
    });

    it('should return null for non-existent meal plan', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await getWeeklyMealPlan(999);

      expect(result).toBeNull();
    });

    it('should get all weekly meal plans successfully', async () => {
      const mockPlans = [
        { id: 1, name: 'Week 1', week_start_date: '2024-01-01' },
        { id: 2, name: 'Week 2', week_start_date: '2024-01-08' }
      ];

      mockPool.query.mockResolvedValueOnce({ rows: mockPlans, rowCount: 2 });

      const result = await getAllWeeklyMealPlans();

      expect(result).toEqual(mockPlans);
    });

    it('should update meal successfully', async () => {
      const updates = { title: 'Updated Pasta', comfort_flag: false };
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await expect(updateMeal(1, updates)).resolves.toBeUndefined();
      expect(mockPool.query).toHaveBeenCalledWith(
        'UPDATE meals SET title = $2, comfort_flag = $3 WHERE id = $1',
        [1, 'Updated Pasta', false]
      );
    });

    it('should delete weekly meal plan successfully', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // delete meals
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // delete plan

      await expect(deleteWeeklyMealPlan(1)).resolves.toBeUndefined();
      expect(mockPool.query).toHaveBeenCalledTimes(2);
    });

    it('should update weekly meal plan successfully', async () => {
      const updates = { name: 'Updated Week' };
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await expect(updateWeeklyMealPlan(1, updates)).resolves.toBeUndefined();
      expect(mockPool.query).toHaveBeenCalledWith(
        'UPDATE weekly_meal_plans SET name = $2 WHERE id = $1',
        [1, 'Updated Week']
      );
    });
  });

  describe('AI Menu Cache Functions', () => {
    it('should find similar menu in cache - exact match', async () => {
      const mockPlan = { id: 1, name: 'Week 1', ai_cost_tokens: 100, generation_time_ms: 500 };
      const mockMeals = [{ id: 1, plan_id: 1, day_of_week: 1, title: 'Pasta' }];

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockPlan], rowCount: 1 }) // exact match
        .mockResolvedValueOnce({ rows: mockMeals, rowCount: 1 }); // meals

      const result = await findSimilarMenuInCache('2024-01-01', 'hash123');

      expect(result).toEqual({
        plan: mockPlan,
        meals: mockMeals
      });
    });

    it('should find similar menu in cache - similar week', async () => {
      const mockPlan = { id: 1, name: 'Week 1', ai_cost_tokens: 100, generation_time_ms: 500 };
      const mockMeals = [{ id: 1, plan_id: 1, day_of_week: 1, title: 'Pasta' }];

      mockPool.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // no exact match
        .mockResolvedValueOnce({ rows: [mockPlan], rowCount: 1 }) // similar match
        .mockResolvedValueOnce({ rows: mockMeals, rowCount: 1 }); // meals

      const result = await findSimilarMenuInCache('2024-01-01', 'hash123');

      expect(result).toEqual({
        plan: mockPlan,
        meals: mockMeals
      });
    });

    it('should return null when no similar menu found', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // no exact match
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // no similar match

      const result = await findSimilarMenuInCache('2024-01-01', 'hash123');

      expect(result).toBeNull();
    });

    it('should save menu to cache successfully', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await expect(saveMenuToCache('2024-01-01', 1, 'hash123', 100, 500)).resolves.toBeUndefined();
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO ai_menu_cache'),
        ['2024-01-01', 1, 'hash123', 100, 500]
      );
    });

    it('should update AI usage stats successfully', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await expect(updateAIUsageStats(1, 100)).resolves.toBeUndefined();
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE ai_usage_stats'),
        [1, 100, 0.003] // 100 tokens * 0.00003
      );
    });

    it('should get AI usage stats successfully', async () => {
      const mockStats = { total_calls: 10, total_tokens: 1000, total_cost_estimate: 0.03 };
      mockPool.query.mockResolvedValueOnce({ rows: [mockStats], rowCount: 1 });

      const result = await getAIUsageStats();

      expect(result).toEqual(mockStats);
    });

    it('should return default stats when none exist', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await getAIUsageStats();

      expect(result).toEqual({ total_calls: 0, total_tokens: 0, total_cost_estimate: 0 });
    });
  });

  describe('Meal Banking Functions', () => {
    const mockBankedMeal: Omit<BankedMeal, 'id' | 'created_at'> = {
      title: 'Saved Pasta',
      day_of_week: 1,
      meal_type: 'cooking',
      comfort_flag: true,
      shortcut_flag: false,
      cultural_riff_flag: false,
      veggie_inclusion: true,
      bank_reason: 'Family favorite',
      original_meal_title: 'Pasta Night',
      rating: 5,
      status: 'favorited'
    };

    it('should bank meal successfully', async () => {
      const mockMealId = 1;
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: mockMealId }], rowCount: 1 });

      const result = await bankMeal(mockBankedMeal);

      expect(result).toBe(mockMealId);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO banked_meals'),
        expect.arrayContaining(['Saved Pasta', 1, 'cooking'])
      );
    });

    it('should get banked meals without status filter', async () => {
      const mockMeals = [mockBankedMeal];
      mockPool.query.mockResolvedValueOnce({ rows: mockMeals, rowCount: 1 });

      const result = await getBankedMeals();

      expect(result).toEqual(mockMeals);
      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT * FROM banked_meals ORDER BY created_at DESC',
        []
      );
    });

    it('should get banked meals with status filter', async () => {
      const mockMeals = [mockBankedMeal];
      mockPool.query.mockResolvedValueOnce({ rows: mockMeals, rowCount: 1 });

      const result = await getBankedMeals('favorited');

      expect(result).toEqual(mockMeals);
      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT * FROM banked_meals WHERE status = $1 ORDER BY created_at DESC',
        ['favorited']
      );
    });

    it('should update banked meal usage successfully', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await expect(updateBankedMealUsage(1)).resolves.toBeUndefined();
      expect(mockPool.query).toHaveBeenCalledWith(
        'UPDATE banked_meals SET times_used = times_used + 1 WHERE id = $1',
        [1]
      );
    });
  });

  describe('Meal Alternatives Functions', () => {
    const mockAlternative: Omit<MealAlternativeHistory, 'id' | 'created_at'> = {
      original_meal_id: 1,
      alternative_title: 'Spicy Pasta',
      chosen: true,
      ai_reasoning: 'More exciting flavor profile',
      generation_cost_tokens: 50
    };

    it('should save meal alternative successfully', async () => {
      const mockAlternativeId = 1;
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: mockAlternativeId }], rowCount: 1 });

      const result = await saveMealAlternative(mockAlternative);

      expect(result).toBe(mockAlternativeId);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO meal_alternatives_history'),
        [1, 'Spicy Pasta', true, 'More exciting flavor profile', 50]
      );
    });

    it('should get meal alternatives successfully', async () => {
      const mockAlternatives = [mockAlternative];
      mockPool.query.mockResolvedValueOnce({ rows: mockAlternatives, rowCount: 1 });

      const result = await getMealAlternatives(1);

      expect(result).toEqual(mockAlternatives);
      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT * FROM meal_alternatives_history WHERE original_meal_id = $1 ORDER BY created_at DESC',
        [1]
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully in createGroceryList', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Database error'));

      await expect(createGroceryList('Test', 'Text', [])).rejects.toThrow('Database error');
    });

    it('should handle database errors gracefully in getGroceryList', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Database error'));

      await expect(getGroceryList(1)).rejects.toThrow('Database error');
    });

    it('should handle database errors gracefully in createWeeklyMealPlan', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Database error'));

      await expect(createWeeklyMealPlan('Test', '2024-01-01')).rejects.toThrow('Database error');
    });

    it('should return null for cache errors in findSimilarMenuInCache', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Database error'));

      const result = await findSimilarMenuInCache('2024-01-01', 'hash');

      expect(result).toBeNull();
    });

    it('should return default stats for errors in getAIUsageStats', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Database error'));

      const result = await getAIUsageStats();

      expect(result).toEqual({ total_calls: 0, total_tokens: 0, total_cost_estimate: 0 });
    });
  });
});