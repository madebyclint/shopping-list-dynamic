// This file maintains backward compatibility while using the new modular structure
// All functions are re-exported from their respective modules

// Export types and shared functions
export * from './database/index';

// Export grocery list functions
export * from './database/grocery-lists';

// Export meal planning functions  
export * from './database/meal-planning';

// Export AI cache functions
export * from './database/ai-cache';

// Export meal banking functions
export * from './database/meal-banking';

// Export pantry items functions
export * from './database/pantry-items';

// Export analytics functions
export * from './database/analytics';