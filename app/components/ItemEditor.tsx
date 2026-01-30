'use client';

import { useState } from 'react';
import { GroceryItem } from '@/lib/database';

interface ItemEditorProps {
  item: GroceryItem;
  onSave: (updatedItem: Partial<GroceryItem>) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

const CATEGORIES = [
  'Bakery/Deli',
  'Refrigerated',
  'Frozen',
  'Produce',
  'Aisles',
  'Other'
];

export default function ItemEditor({ item, onSave, onCancel, onDelete }: ItemEditorProps) {
  const [name, setName] = useState(item.name);
  const [qty, setQty] = useState(item.qty);
  const [price, setPrice] = useState(item.price);
  const [category, setCategory] = useState(item.category);
  const [meal, setMeal] = useState(item.meal);

  const handleSave = () => {
    onSave({
      name,
      qty,
      price,
      category,
      meal
    });
  };

  return (
    <div className="item-editor">
      <div className="editor-row">
        <label>
          Name:
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Item name"
          />
        </label>
      </div>

      <div className="editor-row">
        <label>
          Quantity (with unit):
          <input
            type="text"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="1 lb, 2 cups, 3 ea, etc."
          />
        </label>
        <label>
          Price:
          <input
            type="text"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="$0.00"
          />
        </label>
      </div>

      <div className="editor-row">
        <label>
          Category:
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="editor-row">
        <label>
          Meal:
          <input
            type="text"
            value={meal}
            onChange={(e) => setMeal(e.target.value)}
            placeholder="For which meal?"
          />
        </label>
      </div>

      <div className="editor-actions">
        <button onClick={handleSave} className="save-btn">
          Save
        </button>
        <button onClick={onCancel} className="cancel-btn">
          Cancel
        </button>
        {onDelete && (
          <button onClick={onDelete} className="delete-btn">
            Delete
          </button>
        )}
      </div>
    </div>
  );
}