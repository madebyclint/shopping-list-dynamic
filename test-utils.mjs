// Simple test functions since we can't easily import TypeScript modules
function formatQuantityWithUnit(qty) {
  if (!qty || qty.trim() === '') return '1 ea';
  
  // Clean the quantity string
  const cleanQty = qty.trim();
  
  // If it's already formatted with units, return as is
  if (/\d+\.?\d*\s*[a-zA-Z]/.test(cleanQty)) {
    return cleanQty;
  }
  
  // If it's just a number, add appropriate unit based on common patterns
  const numericValue = parseFloat(cleanQty);
  if (!isNaN(numericValue)) {
    // Default to 'ea' (each) for simple numbers
    return `${numericValue} ea`;
  }
  
  return cleanQty;
}

function cleanIngredientDisplayName(name) {
  if (!name) return name;
  
  // Remove JSON artifacts like {" at the beginning or trailing quotes/brackets
  return name
    .replace(/^[{"]+/, '') // Remove leading { and quotes
    .replace(/[}"]+$/, '') // Remove trailing } and quotes
    .replace(/^["'`]+|["'`]+$/g, '') // Remove quotes from start and end
    .trim();
}

function parseQuantityAndUnit(qty) {
  if (!qty || qty.trim() === '') return { amount: 1, unit: 'ea' };
  
  const cleanQty = qty.trim();
  
  // Common unit abbreviations and their full forms
  const unitMap = {
    'lb': 'lb',
    'lbs': 'lb', 
    'pound': 'lb',
    'pounds': 'lb',
    'oz': 'oz',
    'gallon': 'gal',
    'gallons': 'gal',
    'gal': 'gal',
    'pkg': 'pkg',
    'package': 'pkg',
    'packages': 'pkg',
    'each': 'ea',
    'ea': 'ea'
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

console.log('Testing utility functions...\n');

// Test quantity formatting
console.log('=== Quantity Formatting ===');
console.log('formatQuantityWithUnit("1") =>', formatQuantityWithUnit("1"));
console.log('formatQuantityWithUnit("2 lbs") =>', formatQuantityWithUnit("2 lbs"));
console.log('formatQuantityWithUnit("1.5") =>', formatQuantityWithUnit("1.5"));
console.log('formatQuantityWithUnit("3 cups") =>', formatQuantityWithUnit("3 cups"));
console.log('formatQuantityWithUnit("") =>', formatQuantityWithUnit(""));

// Test quantity and unit parsing
console.log('\n=== Quantity and Unit Parsing ===');
console.log('parseQuantityAndUnit("1 gallon") =>', parseQuantityAndUnit("1 gallon"));
console.log('parseQuantityAndUnit("2 pkg") =>', parseQuantityAndUnit("2 pkg"));
console.log('parseQuantityAndUnit("1.5 pounds") =>', parseQuantityAndUnit("1.5 pounds"));
console.log('parseQuantityAndUnit("4") =>', parseQuantityAndUnit("4"));

// Test ingredient name cleaning
console.log('\n=== Ingredient Name Cleaning ===');
console.log('cleanIngredientDisplayName("{\\"chickpeas") =>', cleanIngredientDisplayName('{"chickpeas'));
console.log('cleanIngredientDisplayName("tomatoes"}") =>', cleanIngredientDisplayName('tomatoes"}'));
console.log('cleanIngredientDisplayName("regular ingredient") =>', cleanIngredientDisplayName('regular ingredient'));
console.log('cleanIngredientDisplayName("\\"quoted item\\"") =>', cleanIngredientDisplayName('"quoted item"'));