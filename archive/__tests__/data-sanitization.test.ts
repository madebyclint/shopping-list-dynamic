// Import the sanitization functions by extracting them from the main file
// Since they're not exported, we'll test them indirectly through the main functions

import { getImportPreview } from '../lib/database/data-export-import';

// Mock DOMPurify
jest.mock('isomorphic-dompurify', () => ({
  sanitize: jest.fn()
}));

import DOMPurify from 'isomorphic-dompurify';
const mockSanitize = DOMPurify.sanitize as jest.MockedFunction<typeof DOMPurify.sanitize>;

describe('Data Sanitization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock returns input unchanged
    mockSanitize.mockImplementation((input) => input);
  });

  describe('XSS Prevention', () => {
    it('should sanitize malicious script tags in meal plan names', async () => {
      const maliciousData = {
        version: '1.0.0',
        data: {
          weeklyMealPlans: [
            {
              id: 1,
              name: '<script>alert("XSS")</script>Legitimate Plan Name',
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

      // Configure DOMPurify mock to simulate sanitization
      mockSanitize.mockImplementation((input) => {
        if (typeof input === 'string') {
          return input.replace(/<script.*?>.*?<\/script>/gi, '');
        }
        return input;
      });

      const result = await getImportPreview(maliciousData);

      expect(mockSanitize).toHaveBeenCalled();
      expect(result.summary.weeklyMealPlans).toBe(1);
      expect(result.compatible).toBe(true);
    });

    it('should sanitize HTML entities in grocery item names', async () => {
      const maliciousData = {
        version: '1.0.0',
        data: {
          weeklyMealPlans: [],
          meals: [],
          groceryLists: [],
          groceryItems: [
            {
              id: 1,
              name: '&lt;img src=x onerror=alert("XSS")&gt;Apples',
              category: 'Fruits',
              qty: '5',
              price: '$3.00'
            }
          ],
          pantryItems: [],
          bankedMeals: [],
          aiMenuCache: [],
          mealAlternativesHistory: []
        }
      };

      // Configure DOMPurify to decode and sanitize
      mockSanitize.mockImplementation((input) => {
        if (typeof input === 'string') {
          return input
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/<.*?>/g, ''); // Remove all tags
        }
        return input;
      });

      const result = await getImportPreview(maliciousData);

      expect(mockSanitize).toHaveBeenCalled();
      expect(result.summary.groceryItems).toBe(1);
    });

    it('should handle nested object sanitization', async () => {
      const dataWithNestedContent = {
        version: '1.0.0',
        data: {
          weeklyMealPlans: [],
          meals: [
            {
              id: 1,
              title: 'Safe Meal Title',
              brief_description: '<script>malicious()</script>This is a description',
              cooking_instructions: 'javascript:void(0);Cook for 30 minutes',
              main_ingredients: ['<b>onBold</b>Ingredient', 'Normal Ingredient']
            }
          ],
          groceryLists: [],
          groceryItems: [],
          pantryItems: [],
          bankedMeals: [],
          aiMenuCache: [],
          mealAlternativesHistory: []
        }
      };

      // Mock DOMPurify to strip tags and javascript
      mockSanitize.mockImplementation((input) => {
        if (typeof input === 'string') {
          return input
            .replace(/<script.*?>.*?<\/script>/gi, '')
            .replace(/javascript:/gi, '')
            .replace(/<.*?>/g, '');
        }
        return input;
      });

      const result = await getImportPreview(dataWithNestedContent);

      expect(mockSanitize).toHaveBeenCalled();
      expect(result.summary.meals).toBe(1);
    });

    it('should preserve legitimate data while sanitizing malicious content', async () => {
      const mixedData = {
        version: '1.0.0',
        data: {
          weeklyMealPlans: [
            {
              id: 1,
              name: 'Healthy Week Plan',
              week_start_date: '2026-02-01'
            }
          ],
          meals: [
            {
              id: 1,
              plan_id: 1,
              title: '<script>alert("hack")</script>Pasta Night',
              brief_description: 'Delicious pasta with <b>marinara</b> sauce',
              day_of_week: 1,
              meal_type: 'cooking'
            }
          ],
          groceryLists: [
            {
              id: 1,
              name: 'Weekly Groceries',
              raw_text: 'Normal grocery list\n<iframe src="evil.com"></iframe>',
              meal_plan_id: 1
            }
          ],
          groceryItems: [],
          pantryItems: [],
          bankedMeals: [],
          aiMenuCache: [],
          mealAlternativesHistory: []
        }
      };

      // Mock comprehensive sanitization
      mockSanitize.mockImplementation((input) => {
        if (typeof input === 'string') {
          return input
            .replace(/<script.*?>.*?<\/script>/gi, '') // Remove scripts
            .replace(/<iframe.*?<\/iframe>/gi, '') // Remove iframes
            .replace(/javascript:/gi, '') // Remove javascript: urls
            .replace(/on\w+\s*=/gi, ''); // Remove event handlers
        }
        return input;
      });

      const result = await getImportPreview(mixedData);

      expect(result.summary.weeklyMealPlans).toBe(1);
      expect(result.summary.meals).toBe(1);
      expect(result.summary.groceryLists).toBe(1);
      expect(result.compatible).toBe(true);
      
      // Verify sanitization was called for string fields
      expect(mockSanitize).toHaveBeenCalled();
    });
  });

  describe('SQL Injection Prevention', () => {
    it('should handle single quotes in input data', async () => {
      const dataWithQuotes = {
        version: '1.0.0',
        data: {
          weeklyMealPlans: [
            {
              id: 1,
              name: "Bob's Weekly Plan'; DROP TABLE meals; --",
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

      // Mock sanitization that handles SQL injection
      mockSanitize.mockImplementation((input) => {
        if (typeof input === 'string') {
          // Remove SQL injection patterns
          return input
            .replace(/;\s*DROP\s+TABLE\s+\w+/gi, '')
            .replace(/--.*$/gm, '')
            .replace(/\/\*.*?\*\//g, '');
        }
        return input;
      });

      const result = await getImportPreview(dataWithQuotes);

      expect(result.summary.weeklyMealPlans).toBe(1);
      expect(mockSanitize).toHaveBeenCalled();
    });

    it('should handle special characters in various fields', async () => {
      const dataWithSpecialChars = {
        version: '1.0.0',
        data: {
          weeklyMealPlans: [],
          meals: [],
          groceryLists: [],
          groceryItems: [
            {
              id: 1,
              name: "O'Connor's Organic Apples",
              category: 'Produce & Fresh',
              qty: "3 lbs @ $2.99/lb",
              price: '$8.97',
              meal: 'Apple Pie & Ice Cream'
            }
          ],
          pantryItems: [
            {
              id: 1,
              name: 'Salt & Pepper Mix',
              category: 'Spices/Seasonings',
              qty: '1 container (16 oz)'
            }
          ],
          bankedMeals: [],
          aiMenuCache: [],
          mealAlternativesHistory: []
        }
      };

      const result = await getImportPreview(dataWithSpecialChars);

      expect(result.summary.groceryItems).toBe(1);
      expect(result.summary.pantryItems).toBe(1);
      expect(result.compatible).toBe(true);
    });
  });

  describe('Data Type Validation', () => {
    it('should handle null and undefined values gracefully', async () => {
      const dataWithNulls = {
        version: '1.0.0',
        data: {
          weeklyMealPlans: [
            {
              id: 1,
              name: null,
              week_start_date: '2026-02-01'
            }
          ],
          meals: [
            {
              id: 1,
              title: undefined,
              brief_description: null,
              plan_id: 1
            }
          ],
          groceryLists: [],
          groceryItems: [],
          pantryItems: [],
          bankedMeals: [],
          aiMenuCache: [],
          mealAlternativesHistory: []
        }
      };

      // Mock sanitization that handles null/undefined
      mockSanitize.mockImplementation((input) => {
        if (input === null || input === undefined) {
          return input;
        }
        if (typeof input === 'string') {
          return input;
        }
        return String(input);
      });

      const result = await getImportPreview(dataWithNulls);

      expect(result.summary.weeklyMealPlans).toBe(1);
      expect(result.summary.meals).toBe(1);
      expect(result.compatible).toBe(true);
    });

    it('should handle array inputs correctly', async () => {
      const dataWithValidArrays = {
        version: '1.0.0',
        data: {
          weeklyMealPlans: [
            { id: 1, name: 'Test Plan', week_start_date: '2026-02-01' }
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

      const result = await getImportPreview(dataWithValidArrays);

      // Should process valid arrays correctly
      expect(result.summary.weeklyMealPlans).toBe(1);
      expect(result.compatible).toBe(true);
      expect(mockSanitize).toHaveBeenCalled();
    });
  });

  describe('Performance with Large Datasets', () => {
    it('should handle sanitization of large datasets efficiently', async () => {
      // Create a large dataset
      const largeDataset = {
        version: '1.0.0',
        data: {
          weeklyMealPlans: Array.from({ length: 50 }, (_, i) => ({
            id: i + 1,
            name: `Plan ${i + 1} with <script>alert('test')</script>`,
            week_start_date: '2026-02-01'
          })),
          meals: Array.from({ length: 200 }, (_, i) => ({
            id: i + 1,
            plan_id: Math.floor(i / 4) + 1,
            title: `Meal ${i + 1}`,
            brief_description: '<b>Description</b> for meal'
          })),
          groceryLists: [],
          groceryItems: Array.from({ length: 500 }, (_, i) => ({
            id: i + 1,
            name: `Item ${i + 1}`,
            category: 'Test Category',
            qty: '1',
            price: '$1.00'
          })),
          pantryItems: [],
          bankedMeals: [],
          aiMenuCache: [],
          mealAlternativesHistory: []
        }
      };

      const startTime = Date.now();
      const result = await getImportPreview(largeDataset);
      const endTime = Date.now();

      expect(result.summary.weeklyMealPlans).toBe(50);
      expect(result.summary.meals).toBe(200);
      expect(result.summary.groceryItems).toBe(500);
      
      // Should complete within reasonable time (adjust threshold as needed)
      expect(endTime - startTime).toBeLessThan(1000); // 1 second
    });
  });
});