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