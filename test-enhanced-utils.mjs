// Test the enhanced ingredient processing
const testItems = [
  { name: 'eggs', qty: '3 ea', price: '2.99', category: 'Other', meal: 'breakfast' },
  { name: 'eggs', qty: '4 ea', price: '2.99', category: 'Other', meal: 'baking' },
  { name: 'fresh tomatoes', qty: '2 ea', price: '3.99', category: 'Other', meal: 'salad' },
  { name: 'canned tomatoes', qty: '1 can', price: '1.99', category: 'Other', meal: 'sauce' },
  { name: 'cherry tomatoes', qty: '1 lb', price: '4.99', category: 'Other', meal: 'snacks' },
  { name: 'tomatoes', qty: '3 ea', price: '3.99', category: 'Other', meal: 'sandwich' },
  { name: 'ground beef', qty: '1 lb', price: '8.99', category: 'Other', meal: 'tacos' },
  { name: 'beef steak', qty: '2 lbs', price: '15.99', category: 'Other', meal: 'dinner' },
  { name: 'whole milk', qty: '1 gal', price: '3.49', category: 'Other', meal: 'cereal' },
  { name: 'skim milk', qty: '1 qt', price: '2.49', category: 'Other', meal: 'coffee' }
];

console.log('Testing enhanced ingredient processing...\n');

// Test the functions we can test without AI
import { normalizeIngredientName, areIngredientsEquivalent, consolidateDuplicateIngredients } from '../lib/utils.ts';

console.log('=== Ingredient Name Normalization ===');
console.log('normalizeIngredientName("fresh tomatoes") =>', normalizeIngredientName("fresh tomatoes"));
console.log('normalizeIngredientName("Large Eggs") =>', normalizeIngredientName("Large Eggs"));
console.log('normalizeIngredientName("  Cherry Tomatoes  ") =>', normalizeIngredientName("  Cherry Tomatoes  "));

console.log('\n=== Ingredient Equivalence Testing ===');
console.log('areIngredientsEquivalent("eggs", "large eggs") =>', areIngredientsEquivalent("eggs", "large eggs"));
console.log('areIngredientsEquivalent("fresh tomatoes", "canned tomatoes") =>', areIngredientsEquivalent("fresh tomatoes", "canned tomatoes"));
console.log('areIngredientsEquivalent("cherry tomatoes", "fresh tomatoes") =>', areIngredientsEquivalent("cherry tomatoes", "fresh tomatoes"));
console.log('areIngredientsEquivalent("ground beef", "beef steak") =>', areIngredientsEquivalent("ground beef", "beef steak"));
console.log('areIngredientsEquivalent("whole milk", "skim milk") =>', areIngredientsEquivalent("whole milk", "skim milk"));
console.log('areIngredientsEquivalent("tomatoes", "fresh tomatoes") =>', areIngredientsEquivalent("tomatoes", "fresh tomatoes"));

console.log('\n=== Smart Consolidation Testing ===');
const consolidated = consolidateDuplicateIngredients(testItems);
console.log('Original items:', testItems.length);
console.log('After smart consolidation:', consolidated.length);
console.log('\nConsolidated items:');
consolidated.forEach(item => {
  console.log(`- ${item.name}: ${item.qty} (${item.meal})`);
});

console.log('\n=== Expected Results ===');
console.log('✅ Should consolidate: eggs (3 ea + 4 ea) → eggs: 7 ea (breakfast, baking)');
console.log('✅ Should consolidate: tomatoes + fresh tomatoes → fresh tomatoes (salad, sandwich)');
console.log('❌ Should NOT consolidate: fresh tomatoes ≠ canned tomatoes ≠ cherry tomatoes');
console.log('❌ Should NOT consolidate: ground beef ≠ beef steak');
console.log('❌ Should NOT consolidate: whole milk ≠ skim milk');