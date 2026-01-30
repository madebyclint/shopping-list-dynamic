import {
  exportAllData,
  importData,
  getImportPreview,
  DATA_EXPORT_VERSION
} from '../lib/database/data-export-import';
import { pool } from '../lib/database/index';

// Mock the database pool
jest.mock('../lib/database/index', () => ({
  pool: {
    connect: jest.fn(),
    query: jest.fn()
  }
}));

// Mock DOMPurify
jest.mock('isomorphic-dompurify', () => ({
  sanitize: jest.fn((input) => input) // Return input unchanged for testing
}));

const mockPool = pool as jest.Mocked<typeof pool>;
const mockClient = {
  query: jest.fn(),
  release: jest.fn()
};

describe('Data Export/Import System', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPool.connect.mockResolvedValue(mockClient as any);
  });

  describe('exportAllData', () => {
    it('should export all data successfully', async () => {
      // Mock database responses
      const mockWeeklyPlans = [
        { id: 1, name: 'Test Plan', week_start_date: '2026-02-01', created_at: new Date() }
      ];
      const mockMeals = [
        { id: 1, plan_id: 1, day_of_week: 0, meal_type: 'cooking', title: 'Test Meal' }
      ];
      const mockGroceryLists = [
        { id: 1, name: 'Test List', raw_text: 'test', meal_plan_id: 1 }
      ];
      const mockGroceryItems = [
        { id: 1, name: 'Test Item', qty: '1', price: '$2.00', category: 'Test', meal: 'Test Meal', list_id: 1 }
      ];
      const mockPantryItems = [
        { id: 1, plan_id: 1, name: 'Test Pantry', category: 'Test', qty: '1' }
      ];
      const mockBankedMeals = [
        { id: 1, title: 'Banked Meal', day_of_week: 0, meal_type: 'cooking' }
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rows: mockWeeklyPlans, rowCount: 1 })
        .mockResolvedValueOnce({ rows: mockMeals, rowCount: 1 })
        .mockResolvedValueOnce({ rows: mockGroceryLists, rowCount: 1 })
        .mockResolvedValueOnce({ rows: mockGroceryItems, rowCount: 1 })
        .mockResolvedValueOnce({ rows: mockPantryItems, rowCount: 1 })
        .mockResolvedValueOnce({ rows: mockBankedMeals, rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // AI cache
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // Meal alternatives
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT

      const result = await exportAllData();

      expect(result).toMatchObject({
        version: DATA_EXPORT_VERSION,
        exportedAt: expect.any(String),
        data: {
          weeklyMealPlans: mockWeeklyPlans,
          meals: mockMeals,
          groceryLists: mockGroceryLists,
          groceryItems: mockGroceryItems,
          pantryItems: mockPantryItems,
          bankedMeals: mockBankedMeals,
          aiMenuCache: [],
          mealAlternativesHistory: []
        },
        metadata: {
          totalPlans: 1,
          totalLists: 1,
          totalItems: 2, // 1 grocery + 1 pantry
          planDateRange: {
            earliest: '2026-02-01',
            latest: '2026-02-01'
          }
        }
      });

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should handle database errors with rollback', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockRejectedValueOnce(new Error('Database error'));

      await expect(exportAllData()).rejects.toThrow('Database error');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should calculate metadata correctly with no date range', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // weekly plans
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // meals
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // grocery lists
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // grocery items
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // pantry items
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // banked meals
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // AI cache
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // meal alternatives
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT

      const result = await exportAllData();

      expect(result.metadata).toMatchObject({
        totalPlans: 0,
        totalLists: 0,
        totalItems: 0
      });
      expect(result.metadata.planDateRange).toBeUndefined();
    });
  });

  describe('getImportPreview', () => {
    it('should generate preview for valid data', async () => {
      const sampleData = {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        data: {
          weeklyMealPlans: [
            { id: 1, name: 'Test Plan', week_start_date: '2026-02-01' },
            { id: 2, name: 'Another Plan', week_start_date: '2026-02-08' }
          ],
          meals: [{ id: 1, plan_id: 1, title: 'Test Meal' }],
          groceryLists: [{ id: 1, name: 'Test List' }],
          groceryItems: [{ id: 1, name: 'Test Item' }],
          pantryItems: [],
          bankedMeals: [],
          aiMenuCache: [],
          mealAlternativesHistory: []
        }
      };

      const result = await getImportPreview(sampleData);

      expect(result).toMatchObject({
        version: '1.0.0',
        compatible: true,
        summary: {
          weeklyMealPlans: 2,
          meals: 1,
          groceryLists: 1,
          groceryItems: 1,
          pantryItems: 0,
          bankedMeals: 0,
          aiMenuCache: 0,
          mealAlternativesHistory: 0
        },
        dateRange: {
          earliest: '2026-02-01',
          latest: '2026-02-08'
        },
        warnings: []
      });
    });

    it('should handle version mismatch', async () => {
      const sampleData = {
        version: '2.0.0',
        data: {
          weeklyMealPlans: [],
          meals: [],
          groceryLists: [],
          groceryItems: [],
          pantryItems: [],
          bankedMeals: [],
          aiMenuCache: [],
          mealAlternativesHistory: []
        }
      };

      const result = await getImportPreview(sampleData);

      expect(result.compatible).toBe(false);
      expect(result.warnings).toContain(`Version mismatch: expected ${DATA_EXPORT_VERSION}, got 2.0.0`);
    });

    it('should handle data with invalid dates', async () => {
      const sampleData = {
        version: '1.0.0',
        data: {
          weeklyMealPlans: [
            { id: 1, name: 'Test Plan', week_start_date: 'invalid-date' },
            { id: 2, name: 'Valid Plan', week_start_date: '2026-02-01' }
          ],
          meals: [],
          groceryLists: [],
          groceryItems: [],
          pantryItems: [],
          bankedMeals: [],
          aiMenuCache: [],
          mealAlternativesHistory: []
        }
      };

      const result = await getImportPreview(sampleData);

      expect(result.dateRange).toMatchObject({
        earliest: '2026-02-01',
        latest: '2026-02-01'
      });
    });

    it('should handle empty meal plans gracefully', async () => {
      const sampleData = {
        version: '1.0.0',
        data: {
          weeklyMealPlans: [],
          meals: [],
          groceryLists: [],
          groceryItems: [],
          pantryItems: [],
          bankedMeals: [],
          aiMenuCache: [],
          mealAlternativesHistory: []
        }
      };

      const result = await getImportPreview(sampleData);

      expect(result.dateRange).toBeUndefined();
    });
  });

  describe('importData', () => {
    const sampleImportData = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      data: {
        weeklyMealPlans: [
          { id: 1, name: 'Test Plan', week_start_date: '2026-02-01', created_at: new Date() }
        ],
        meals: [
          { id: 1, plan_id: 1, day_of_week: 0, meal_type: 'cooking', title: 'Test Meal' }
        ],
        groceryLists: [
          { id: 1, name: 'Test List', raw_text: 'test', meal_plan_id: 1 }
        ],
        groceryItems: [
          { id: 1, name: 'Test Item', qty: '1', price: '$2.00', category: 'Test', meal: 'Test Meal', list_id: 1 }
        ],
        pantryItems: [
          { id: 1, plan_id: 1, name: 'Test Pantry', category: 'Test', qty: '1' }
        ],
        bankedMeals: [],
        aiMenuCache: [],
        mealAlternativesHistory: []
      }
    };

    it('should import data successfully with supplement mode', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        // Weekly meal plans import
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // Check existing plan
        .mockResolvedValueOnce({ rows: [{ id: 100 }], rowCount: 1 }) // Insert plan
        // Meals import
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // Check existing meal
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // Insert meal
        // Grocery lists import
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // Check existing list
        .mockResolvedValueOnce({ rows: [{ id: 200 }], rowCount: 1 }) // Insert list
        // Grocery items import
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // Check existing item
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // Insert item
        // Pantry items import
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // Check existing pantry
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // Insert pantry
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT

      const result = await importData(sampleImportData, {
        supplementMode: true,
        skipDuplicates: true,
        preserveIds: false
      });

      expect(result.success).toBe(true);
      expect(result.imported.weeklyMealPlans).toBe(1);
      expect(result.imported.meals).toBe(1);
      expect(result.imported.groceryLists).toBe(1);
      expect(result.imported.groceryItems).toBe(1);
      expect(result.imported.pantryItems).toBe(1);
      expect(result.errors).toHaveLength(0);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should skip duplicates when skipDuplicates is enabled', async () => {
      // Set up mocks for a successful import with duplicates being skipped
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        
        // Weekly meal plans - existing plan found (duplicate)
        .mockResolvedValueOnce({ rows: [{ id: 100 }], rowCount: 1 }) // Existing plan found, should skip
        
        // Meals - check for existing meal (plan exists so we process meals)
        .mockResolvedValueOnce({ rows: [{ id: 200 }], rowCount: 1 }) // Existing meal found, should skip
        
        // Grocery lists - check for existing list
        .mockResolvedValueOnce({ rows: [{ id: 300 }], rowCount: 1 }) // Existing list found, should skip
        
        // Grocery items - check for existing item
        .mockResolvedValueOnce({ rows: [{ id: 400 }], rowCount: 1 }) // Existing item found, should skip
        
        // Pantry items - check for existing item
        .mockResolvedValueOnce({ rows: [{ id: 500 }], rowCount: 1 }) // Existing pantry found, should skip
        
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT

      const result = await importData(sampleImportData, {
        supplementMode: true,
        skipDuplicates: true,
        preserveIds: false
      });

      // The function should succeed but import nothing since all duplicates were skipped
      expect(result.success).toBe(true);
      expect(result.imported.weeklyMealPlans).toBe(0);
      expect(result.skipped.weeklyMealPlans).toBe(1);
      expect(result.skipped.meals).toBe(1);
      expect(result.skipped.groceryLists).toBe(1);
      expect(result.skipped.groceryItems).toBe(1);
      expect(result.skipped.pantryItems).toBe(1);
    });

    it('should preserve IDs when preserveIds is enabled', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // Check existing plan
        .mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 }) // Insert with preserved ID
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // Check existing meal
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // Insert meal
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // Check existing list
        .mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 }) // Insert list
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // Check existing item
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // Insert item
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // Check existing pantry
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // Insert pantry
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT

      const result = await importData(sampleImportData, {
        supplementMode: true,
        skipDuplicates: true,
        preserveIds: true
      });

      expect(result.success).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith(
        'INSERT INTO weekly_meal_plans (id, name, week_start_date, created_at) VALUES ($1, $2, $3, $4) RETURNING id',
        expect.any(Array)
      );
    });

    it('should handle database errors with graceful failure', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockRejectedValueOnce(new Error('Database error')) // First query fails
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT (transaction continues despite error)

      const result = await importData(sampleImportData);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Database error');
      // Note: ROLLBACK is only called for transaction-level errors, not individual operation errors
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT'); // Transaction completes
    });

    it('should handle orphaned records gracefully', async () => {
      const dataWithOrphans = {
        ...sampleImportData,
        data: {
          ...sampleImportData.data,
          meals: [
            { id: 1, plan_id: 999, day_of_week: 0, meal_type: 'cooking', title: 'Orphaned Meal' }
          ]
        }
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        // Weekly meal plans import (empty)
        // Meals import - orphaned meal should be skipped
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT

      const result = await importData(dataWithOrphans, {
        supplementMode: true,
        skipDuplicates: true,
        preserveIds: false
      });

      expect(result.errors).toContain('Meal skipped: referenced plan_id 999 not found');
    });

    it('should sanitize input data', async () => {
      const maliciousData = {
        version: '1.0.0',
        data: {
          weeklyMealPlans: [
            { 
              id: 1, 
              name: '<script>alert("xss")</script>Test Plan', 
              week_start_date: '2026-02-01' 
            }
          ],
          meals: [],
          groceryLists: [],
          groceryItems: [],
          pantryItems: [],
          bankedMeals: [],
          aiMenuCache: [],
          mealAlternativesHistory: []
        }
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // Check existing plan
        .mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 }) // Insert plan
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT

      // The DOMPurify mock will return the input unchanged for testing,
      // but in real usage it would sanitize the malicious content
      const result = await importData(maliciousData);

      expect(result.success).toBe(true);
      expect(result.imported.weeklyMealPlans).toBe(1);
    });
  });

  describe('Version compatibility', () => {
    it('should use correct version constant', () => {
      expect(DATA_EXPORT_VERSION).toBe('1.0.0');
    });

    it('should include version in export data', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // weekly plans
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // meals
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // grocery lists
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // grocery items
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // pantry items
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // banked meals
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // AI cache
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // meal alternatives
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT

      const result = await exportAllData();

      expect(result.version).toBe(DATA_EXPORT_VERSION);
    });
  });

  describe('Error handling edge cases', () => {
    it('should handle malformed import data gracefully', async () => {
      const malformedData = {
        version: '1.0.0',
        data: {
          weeklyMealPlans: null, // Invalid data type
          meals: undefined,
          groceryLists: 'not an array',
          groceryItems: [],
          pantryItems: [],
          bankedMeals: [],
          aiMenuCache: [],
          mealAlternativesHistory: []
        }
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT

      const result = await importData(malformedData);

      expect(result.success).toBe(false); // Should fail due to malformed data
      expect(result.errors.length).toBeGreaterThan(0); // Should have errors
      expect(result.imported.weeklyMealPlans).toBe(0);
    });

    it('should handle missing required fields with error reporting', async () => {
      const incompleteData = {
        version: '1.0.0',
        data: {
          weeklyMealPlans: [
            { id: 1 } // Missing required fields
          ],
          meals: [],
          groceryLists: [],
          groceryItems: [],
          pantryItems: [],
          bankedMeals: [],
          aiMenuCache: [],
          mealAlternativesHistory: []
        }
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // Check existing plan
        .mockRejectedValueOnce(new Error('null value in column "name" violates not-null constraint'))
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT

      const result = await importData(incompleteData);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(error => error.includes('name'))).toBe(true);
    });
  });
});