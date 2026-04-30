'use client';

import { useState, useEffect } from 'react';

interface Ingredient {
  name: string;
  category: string;
  count: number;
  avgPrice: string;
}

export default function Ingredients() {
  const [ingredients, setIngredients] = useState<{ [category: string]: Ingredient[] }>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchAllIngredients();
  }, []);

  const fetchAllIngredients = async () => {
    try {
      // Fetch all ingredients by searching with an empty query and high limit
      const response = await fetch(`/api/items?action=search&q=&limit=1000`);
      if (response.ok) {
        const data = await response.json();

        // Group ingredients by category and sort alphabetically
        const grouped = data.reduce((acc: { [key: string]: Ingredient[] }, ingredient: Ingredient) => {
          if (!acc[ingredient.category]) {
            acc[ingredient.category] = [];
          }
          acc[ingredient.category].push(ingredient);
          return acc;
        }, {});

        // Sort ingredients alphabetically within each category
        Object.keys(grouped).forEach(category => {
          grouped[category].sort((a, b) => a.name.localeCompare(b.name));
        });

        setIngredients(grouped);
      }
    } catch (error) {
      console.error('Error fetching ingredients:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredIngredients = searchTerm
    ? Object.entries(ingredients).reduce((acc, [category, items]) => {
      const filtered = items.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      if (filtered.length > 0) {
        acc[category] = filtered;
      }
      return acc;
    }, {} as { [category: string]: Ingredient[] })
    : ingredients;

  const totalIngredients = Object.values(ingredients).flat().length;

  if (loading) {
    return (
      <div className="content-section">
        <h1>Ingredients</h1>
        <p>Loading ingredient database...</p>
      </div>
    );
  }

  return (
    <div className="content-section">
      <h1>Ingredients Database</h1>
      <p>All ingredients from your shopping lists ({totalIngredients} total ingredients)</p>

      <div className="ingredient-controls">
        <input
          type="text"
          placeholder="Search ingredients..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
      </div>

      {Object.keys(filteredIngredients).length === 0 ? (
        <div className="placeholder-content">
          <div className="placeholder-item">
            <h3>🥫 {searchTerm ? 'No matching ingredients found' : 'No ingredients yet'}</h3>
            <p>{searchTerm ? 'Try a different search term' : 'Create some shopping lists to build your ingredient database!'}</p>
          </div>
        </div>
      ) : (
        <article className="ingredients-grid">
          {Object.entries(filteredIngredients)
            .sort(([a], [b]) => a.localeCompare(b)) // Sort categories alphabetically
            .map(([category, items]) => (
              <section key={category} className="ingredient-category">
                <h2>{category} ({items.length} items)</h2>
                <ul className="ingredients-list">
                  {items.map((ingredient, index) => (
                    <li key={`${ingredient.name}-${index}`} className="ingredient-item">
                      <div className="ingredient-info">
                        <span className="ingredient-name">{ingredient.name}</span>
                        <div className="ingredient-stats">
                          <span className="usage-count">Used {ingredient.count}x</span>
                          <span className="avg-price">~${ingredient.avgPrice}</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          }
        </article>
      )}
    </div>
  );
}