export interface ParsedItem {
  name: string;
  qty: string;
  price: string;
  category: string;
  meal: string;
}

export interface ItemsByCategory {
  [category: string]: {
    items: ParsedItem[];
  };
}

export function parseGroceryListText(inputString: string): ParsedItem[] {
  const lines = inputString.split('\n');
  const items: ParsedItem[] = [];
  let currentMeal = '';

  lines.forEach((line) => {
    const trimmedLine = line.trim();
    
    // Skip empty lines and comments
    if (trimmedLine === '' || trimmedLine.startsWith('//')) return;
    
    // Check if this is a meal header (starts with #)
    if (trimmedLine.startsWith('#')) {
      currentMeal = trimmedLine.replace('#', '').trim();
      return;
    }

    // Handle the old format with separators
    if (trimmedLine.includes('::::') || trimmedLine.includes(':::') || trimmedLine.includes('::')) {
      const mealParts = trimmedLine.split('::::');
      const meal = mealParts[1]?.trim() || currentMeal;

      const categoryParts = mealParts[0].split(':::');
      const category = categoryParts[1]?.trim() || '';

      const priceParts = categoryParts[0].split('::');
      const price = priceParts[1]?.trim() || '';

      const qtyParts = priceParts[0].split(':');
      const qty = qtyParts[1]?.trim() || '';
      const name = qtyParts[0]?.trim() || '';

      if (name) {
        items.push({
          name,
          qty,
          price,
          category: category || categorizeIngredient(name),
          meal
        });
      }
    } else {
      // Handle natural language ingredient extraction
      const ingredients = extractIngredientsFromText(trimmedLine);
      ingredients.forEach(ingredient => {
        items.push({
          name: ingredient.name,
          qty: ingredient.qty || '1',
          price: '',
          category: categorizeIngredient(ingredient.name),
          meal: currentMeal
        });
      });
    }
  });

  // Consolidate duplicate items
  return consolidateItems(items);
}

export function groupItemsByCategory(items: ParsedItem[]): ItemsByCategory {
  return items.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = { items: [] };
    }
    acc[item.category].items.push(item);
    return acc;
  }, {} as ItemsByCategory);
}

export function getPrice(inputString: string): number {
  // Remove non-numeric characters (except decimal point)
  const numericString = inputString.replace(/[^0-9.]/g, '');
  
  // Parse the numeric string
  const price = parseFloat(numericString);
  
  return isNaN(price) ? 0 : price;
}

export function calculateCost(item: ParsedItem): number {
  const qty = parseFloat(item.qty) || 1;
  const price = getPrice(item.price);
  return price * qty;
}

export function calculateTotalCost(items: ParsedItem[]): number {
  return items.reduce((total, item) => total + calculateCost(item), 0);
}

export function calculateCategoryCost(items: ParsedItem[]): number {
  return items.reduce((total, item) => total + calculateCost(item), 0);
}

interface ExtractedIngredient {
  name: string;
  qty?: string;
}

function cleanIngredientName(name: string): string {
  return name
    .replace(/^["'`]|["'`]$/g, '') // Remove quotes from start and end
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

function extractIngredientsFromText(text: string): ExtractedIngredient[] {
  const ingredients: ExtractedIngredient[] = [];
  
  // Split by common separators
  const items = text.split(/[,;]|\band\b/i).map(item => item.trim()).filter(item => item.length > 0);
  
  items.forEach(item => {
    // Extract quantity and name using regex
    const qtyMatch = item.match(/^(\d+(?:\.\d+)?\s*(?:cups?|lbs?|pounds?|oz|ounces?|tbsp|tablespoons?|tsp|teaspoons?|cloves?|cans?|packages?|heads?|bunches?)?)\.?\s+(.+)$/i);
    
    if (qtyMatch) {
      ingredients.push({
        name: cleanIngredientName(qtyMatch[2].trim()),
        qty: qtyMatch[1].trim()
      });
    } else {
      // Clean up the ingredient name
      const cleanName = cleanIngredientName(item.replace(/^(fresh|dried|chopped|diced|sliced|minced)\s+/i, '').trim());
      if (cleanName && cleanName.length > 2) {
        ingredients.push({
          name: cleanName
        });
      }
    }
  });

  return ingredients;
}

function categorizeIngredient(name: string): string {
  const lowerName = name.toLowerCase();
  
  // Produce
  if (/\b(apple|banana|orange|lemon|lime|onion|garlic|tomato|lettuce|spinach|carrot|celery|bell pepper|mushroom|broccoli|cauliflower|zucchini|cucumber|avocado|potato|sweet potato|herb|cilantro|parsley|basil|thyme|rosemary|ginger)s?\b/.test(lowerName)) {
    return 'Produce';
  }
  
  // Proteins
  if (/\b(chicken|beef|pork|fish|salmon|tuna|turkey|lamb|egg|tofu|beans?|lentils|chickpeas)s?\b/.test(lowerName)) {
    return 'Protein';
  }
  
  // Dairy
  if (/\b(milk|cheese|butter|yogurt|cream|sour cream)s?\b/.test(lowerName)) {
    return 'Dairy';
  }
  
  // Pantry/Dry Goods
  if (/\b(rice|pasta|flour|sugar|salt|pepper|olive oil|oil|vinegar|sauce|stock|broth|can|canned)s?\b/.test(lowerName)) {
    return 'Pantry';
  }
  
  // Bread/Bakery
  if (/\b(bread|tortilla|bagel|roll|bun)s?\b/.test(lowerName)) {
    return 'Bakery';
  }
  
  // Frozen
  if (/\b(frozen)\b/.test(lowerName)) {
    return 'Frozen';
  }
  
  return 'Other';
}

function consolidateItems(items: ParsedItem[]): ParsedItem[] {
  const consolidatedMap = new Map<string, ParsedItem>();
  
  items.forEach(item => {
    const key = `${item.name.toLowerCase()}-${item.meal}`;
    
    if (consolidatedMap.has(key)) {
      const existing = consolidatedMap.get(key)!;
      // Try to combine quantities if they're in the same unit
      const existingQty = parseFloat(existing.qty) || 1;
      const newQty = parseFloat(item.qty) || 1;
      
      if (existing.qty && item.qty && existing.qty.includes(item.qty.replace(/\d+\.?\d*\s*/, ''))) {
        existing.qty = `${existingQty + newQty} ${existing.qty.replace(/\d+\.?\d*\s*/, '')}`;
      } else if (existing.qty === item.qty || !existing.qty) {
        existing.qty = item.qty || existing.qty;
      } else {
        existing.qty = `${existing.qty}, ${item.qty}`;
      }
    } else {
      consolidatedMap.set(key, { ...item });
    }
  });
  
  return Array.from(consolidatedMap.values());
}

// Enhanced unit parsing for better formatting
export function parseQuantityAndUnit(qty: string): { amount: number; unit: string } {
  if (!qty || qty.trim() === '') return { amount: 1, unit: 'ea' };
  
  const cleanQty = qty.trim();
  
  // Common unit abbreviations and their full forms
  const unitMap: { [key: string]: string } = {
    'lb': 'lb',
    'lbs': 'lb', 
    'pound': 'lb',
    'pounds': 'lb',
    'oz': 'oz',
    'ounce': 'oz',
    'ounces': 'oz',
    'cup': 'cup',
    'cups': 'cup',
    'c': 'cup',
    'tbsp': 'tbsp',
    'tablespoon': 'tbsp',
    'tablespoons': 'tbsp',
    'tsp': 'tsp',
    'teaspoon': 'tsp',
    'teaspoons': 'tsp',
    'gallon': 'gal',
    'gallons': 'gal',
    'gal': 'gal',
    'quart': 'qt',
    'quarts': 'qt',
    'qt': 'qt',
    'pint': 'pt',
    'pints': 'pt',
    'pt': 'pt',
    'pkg': 'pkg',
    'package': 'pkg',
    'packages': 'pkg',
    'can': 'can',
    'cans': 'can',
    'jar': 'jar',
    'jars': 'jar',
    'bottle': 'bottle',
    'bottles': 'bottle',
    'each': 'ea',
    'ea': 'ea',
    'piece': 'ea',
    'pieces': 'ea'
  };
  
  // Try to match quantity and unit pattern
  const match = cleanQty.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if (match) {
    const amount = parseFloat(match[1]);
    const unitText = match[2].toLowerCase().trim();
    const unit = unitMap[unitText] || unitText || 'ea';
    return { amount, unit };
  }
  
  // If no number is found, assume 1 unit
  const unitText = cleanQty.toLowerCase();
  const unit = unitMap[unitText] || 'ea';
  return { amount: 1, unit };
}

// Utility function to parse and format quantity with units
export function formatQuantityWithUnit(qty: string): string {
  const { amount, unit } = parseQuantityAndUnit(qty);
  return `${amount} ${unit}`;
}

// Clean ingredient names to remove JSON artifacts
export function cleanIngredientDisplayName(name: string): string {
  if (!name) return name;
  
  // Remove JSON artifacts like {" at the beginning or trailing quotes/brackets
  return name
    .replace(/^[{"]+/, '') // Remove leading { and quotes
    .replace(/[}"]+$/, '') // Remove trailing } and quotes
    .replace(/^["'`]+|["'`]+$/g, '') // Remove quotes from start and end
    .trim();
}

// Function to create AI-powered unit standardization prompt
export function createUnitStandardizationPrompt(items: ParsedItem[]): string {
  const itemList = items
    .map(item => `- ${item.name}: ${item.qty} (for ${item.meal || 'meal'})`)
    .join('\n');

  if (!itemList) return '';

  return `Convert these grocery ingredients to appropriate grocery store units and consolidate where appropriate. 

IMPORTANT RULES:
- Eggs: Use "doz" (dozen) instead of "ea" (1-12 eggs = 1 doz, 13-24 eggs = 2 doz)
- Fresh produce: Use "lb" for most vegetables/fruits, "bunch" for herbs/greens
- Packaged items: Use "pkg", "box", "can", "bottle" as appropriate
- Dairy: Use standard container sizes (1 gal milk, 1 lb butter, etc.)
- DO NOT consolidate different varieties (fresh tomatoes ≠ canned tomatoes ≠ cherry tomatoes)
- DO consolidate same ingredients from different meals and combine meal usage

${itemList}

Return ONLY a JSON array with format: [{"name": "ingredient_name", "qty": "amount unit", "meals": "meal1, meal2"}]

Examples:
- "eggs: 3 ea, eggs: 4 ea" → {"name": "eggs", "qty": "1 doz", "meals": "breakfast, dinner"}  
- "tomatoes: 2 ea, fresh tomatoes: 1 lb" → {"name": "fresh tomatoes", "qty": "1 lb", "meals": "salad, sauce"}
- "canned tomatoes: 1 can, fresh tomatoes: 3 ea" → Keep separate (different types)`;
}

// Enhanced function to normalize ingredient names for better duplicate detection
export function normalizeIngredientName(name: string): string {
  const cleaned = name.toLowerCase().trim();
  
  // Remove common quantity descriptors that don't change the ingredient type
  const withoutQuantityWords = cleaned
    .replace(/\b(large|small|medium|big|little|extra)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
    
  return withoutQuantityWords;
}

// Enhanced function to detect if ingredients are truly the same
// Simple string similarity calculation
function calculateStringSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  // Exact match
  if (s1 === s2) return 1.0;
  
  // Calculate similarity using Levenshtein distance
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  if (longer.length === 0) return 1.0;
  
  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

// Levenshtein distance calculation
function levenshteinDistance(str1: string, str2: string): number {
  const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
  
  for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
  
  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + indicator
      );
    }
  }
  
  return matrix[str2.length][str1.length];
}

// Check if ingredient names are similar enough to consolidate
function areIngredientsSimilar(name1: string, name2: string): boolean {
  const similarity = calculateStringSimilarity(name1, name2);
  return similarity >= 0.95; // 95% similarity threshold
}

// Simple and reliable duplicate consolidation
export function consolidateDuplicateIngredients(items: ParsedItem[]): ParsedItem[] {
  const result: ParsedItem[] = [];
  
  for (const currentItem of items) {
    let foundMatch = false;
    
    // Check against existing results for duplicates
    for (let i = 0; i < result.length; i++) {
      const existingItem = result[i];
      
      if (areIngredientsSimilar(currentItem.name, existingItem.name)) {
        foundMatch = true;
        
        // Combine meals
        const existingMeals = existingItem.meal ? existingItem.meal.split(', ').filter(m => m.trim()) : [];
        const newMeals = currentItem.meal ? currentItem.meal.split(', ').filter(m => m.trim()) : [];
        const allMeals = [...new Set([...existingMeals, ...newMeals])];
        existingItem.meal = allMeals.join(', ');
        
        // Handle unit preference: prefer specific units over 'ea'
        const existingUnit = parseQuantityAndUnit(existingItem.qty);
        const currentUnit = parseQuantityAndUnit(currentItem.qty);
        
        if (existingUnit.unit === 'ea' && currentUnit.unit !== 'ea') {
          // Prefer the current item's unit over 'ea'
          existingItem.qty = currentItem.qty;
          existingItem.name = currentItem.name; // Use the name with the better unit
        } else if (currentUnit.unit === 'ea' && existingUnit.unit !== 'ea') {
          // Keep existing item (it has a better unit)
          // No changes needed
        } else if (existingUnit.unit === currentUnit.unit) {
          // Same unit, combine quantities
          existingItem.qty = `${existingUnit.amount + currentUnit.amount} ${existingUnit.unit}`;
        } else {
          // Different units, keep the longer/more descriptive name and first unit
          if (currentItem.name.length > existingItem.name.length) {
            existingItem.name = currentItem.name;
          }
        }
        
        // Use the better price if available
        if (currentItem.price && (!existingItem.price || existingItem.price === '2.99')) {
          existingItem.price = currentItem.price;
        }
        
        // Use the better category
        if (currentItem.category && currentItem.category !== 'Other' && 
            (!existingItem.category || existingItem.category === 'Other')) {
          existingItem.category = currentItem.category;
        }
        
        break;
      }
    }
    
    if (!foundMatch) {
      // No duplicate found, add as new item
      result.push({ ...currentItem });
    }
  }
  
  return result;
}

// Enhanced AI-powered ingredient processing
export async function processIngredientsWithAI(items: ParsedItem[], openaiClient: any): Promise<ParsedItem[]> {
  if (items.length === 0) return items;
  
  try {
    const prompt = createAdvancedIngredientProcessingPrompt(items);
    
    const response = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 3000 // Increased for larger lists
    });

    const rawContent = response.choices[0].message.content || '[]';
    console.log('AI Response raw:', rawContent.slice(0, 200) + '...'); // Debug log (truncated)
    
    const cleanedContent = cleanAIResponse(rawContent);
    console.log('Cleaned content:', cleanedContent.slice(0, 200) + '...'); // Debug log (truncated)
    
    let processedData;
    try {
      processedData = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error('JSON Parse Error:', parseError);
      console.error('Raw content:', rawContent);
      console.error('Cleaned content:', cleanedContent);
      // Return items with basic price estimates instead of failing completely
      return items.map(item => ({
        ...item,
        price: item.price || '2.99'
      }));
    }

    // Validate that we got an array
    if (!Array.isArray(processedData)) {
      console.error('AI response not an array:', processedData);
      return items.map(item => ({ ...item, price: item.price || '2.99' }));
    }

    // Validate and apply AI processing results
    const result = processedData.map((processed: any, index: number) => {
      const originalItem = items[index];
      return {
        name: processed.name || originalItem?.name || 'Unknown item',
        qty: processed.qty || originalItem?.qty || '1 ea',
        price: processed.estimated_price || processed.price || originalItem?.price || '2.99',
        category: processed.category || originalItem?.category || 'Other',
        meal: processed.meals || originalItem?.meal || 'Various'
      };
    });
    
    // Store token usage for external tracking
    if (response.usage?.total_tokens) {
      (processIngredientsWithAI as any).lastTokenUsage = response.usage.total_tokens;
    }
    
    console.log('AI processing successful, processed', result.length, 'items');
    return result;
    
  } catch (error) {
    console.error('Error in AI ingredient processing:', error);
    // Return items with basic price estimates
    return items.map(item => ({
      ...item,
      price: item.price || '2.99'
    }));
  }
}

// Advanced AI prompt for comprehensive ingredient processing
function createAdvancedIngredientProcessingPrompt(items: ParsedItem[]): string {
  const itemList = items.map(item => 
    `- ${item.name}: ${item.qty} (for ${item.meal || 'meal'}) [current category: ${item.category}]`
  ).join('\n');

  return `You are a grocery list processing assistant. Process these ingredients and return ONLY a JSON array.

INPUT INGREDIENTS:
${itemList}

PROCESSING RULES:
1. Convert egg quantities to dozens (1-11 eggs = "1 doz", 12+ eggs = "2 doz", etc.)
2. Use appropriate grocery units: lb for produce/meat, pkg/box/jar for packaged goods
3. Consolidate same ingredients from different meals 
4. Estimate current grocery prices (Brooklyn, NY)
5. Categorize as: Produce, Protein, Dairy, Pantry, Bakery, Frozen, Other

RETURN FORMAT - JSON array only, no markdown:
[
  {
    "name": "ingredient name",
    "qty": "amount unit", 
    "estimated_price": "X.XX",
    "category": "category",
    "meals": "meal1, meal2"
  }
]`;
}

function cleanAIResponse(content: string): string {
  // Remove markdown code blocks and clean up AI responses
  let cleaned = content.trim()
    .replace(/```json/gi, '') // Remove ```json
    .replace(/```/gi, '') // Remove closing ```
    .replace(/^[^[\{]*/, '') // Remove everything before first [ or {
    .replace(/[^}\]]*$/, '') // Remove everything after last } or ]
    .trim();
  
  // If we still don't have valid JSON start, try to extract it
  if (!cleaned.startsWith('[') && !cleaned.startsWith('{')) {
    const jsonMatch = cleaned.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    if (jsonMatch) {
      cleaned = jsonMatch[1];
    } else {
      // If no JSON found, return empty array
      return '[]';
    }
  }
  
  return cleaned;
}

// Function to check for similar ingredients in existing database
export async function findSimilarIngredients(newItems: ParsedItem[], searchIngredients: Function): Promise<{ [key: string]: any[] }> {
  const similarItems: { [key: string]: any[] } = {};
  
  for (const item of newItems) {
    try {
      const results = await searchIngredients(item.name, 5);
      
      // Filter for close matches
      const closeMatches = results.filter((result: any) => {
        const similarity = calculateStringSimilarity(item.name.toLowerCase(), result.name.toLowerCase());
        return similarity > 0.7; // 70% similarity threshold
      });
      
      if (closeMatches.length > 0) {
        similarItems[item.name] = closeMatches;
      }
    } catch (error) {
      console.error(`Error searching for similar items for "${item.name}":`, error);
    }
  }
  
  return similarItems;
}