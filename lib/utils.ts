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
  const itemsRaw = inputString.split('\n');
  const items: ParsedItem[] = [];

  itemsRaw.forEach((rawItem) => {
    if (rawItem.trim() === '' || rawItem.trim().startsWith('//')) return;

    const mealParts = rawItem.split('::::');
    const meal = mealParts[1]?.trim() || '';

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
        category,
        meal
      });
    }
  });

  return items;
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