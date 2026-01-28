'use client';

import { useState, useEffect } from 'react';

interface SearchResult {
  name: string;
  category: string;
  count: number;
  avgPrice?: string;
}

interface IngredientSearchProps {
  onSelectIngredient: (ingredient: SearchResult) => void;
  placeholder?: string;
  className?: string;
}

export default function IngredientSearch({ onSelectIngredient, placeholder = "Search ingredients...", className = "" }: IngredientSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    const searchIngredients = async () => {
      if (query.length < 2) {
        setResults([]);
        setShowResults(false);
        return;
      }

      setIsLoading(true);
      try {
        const response = await fetch(`/api/items?action=search&q=${encodeURIComponent(query)}&limit=10`);
        if (response.ok) {
          const data = await response.json();
          setResults(data);
          setShowResults(true);
        }
      } catch (error) {
        console.error('Error searching ingredients:', error);
      } finally {
        setIsLoading(false);
      }
    };

    const timeoutId = setTimeout(searchIngredients, 300);
    return () => clearTimeout(timeoutId);
  }, [query]);

  const handleSelectIngredient = (ingredient: SearchResult) => {
    setQuery('');
    setShowResults(false);
    onSelectIngredient(ingredient);
  };

  return (
    <div className={`ingredient-search ${className}`}>
      <div className="search-input-container">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="search-input"
          onFocus={() => query.length >= 2 && setShowResults(true)}
          onBlur={() => setTimeout(() => setShowResults(false), 200)} // Delay to allow click
        />
        {isLoading && (
          <div className="search-loading">
            🔄
          </div>
        )}
      </div>

      {showResults && results.length > 0 && (
        <div className="search-results">
          {results.map((ingredient, index) => (
            <div
              key={`${ingredient.name}-${ingredient.category}-${index}`}
              className="search-result-item"
              onClick={() => handleSelectIngredient(ingredient)}
            >
              <div className="ingredient-info">
                <span className="ingredient-name">{ingredient.name}</span>
                <span className="ingredient-category">{ingredient.category}</span>
              </div>
              <div className="ingredient-stats">
                <span className="usage-count">Used {ingredient.count}x</span>
                {ingredient.avgPrice && (
                  <span className="avg-price">${ingredient.avgPrice}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showResults && query.length >= 2 && results.length === 0 && !isLoading && (
        <div className="search-no-results">
          <div
            className="add-new-item"
            onClick={() => handleSelectIngredient({ name: query.trim(), category: 'Other' })}
          >
            ➕ Add "{query.trim()}" as new item
          </div>
        </div>
      )}
    </div>
  );
}