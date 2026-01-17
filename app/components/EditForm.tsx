'use client';

import { useState } from 'react';

interface EditFormProps {
  isVisible: boolean;
  onSubmit: (name: string, rawText: string) => void;
  initialText?: string;
}

export default function EditForm({ isVisible, onSubmit, initialText = '' }: EditFormProps) {
  const [rawText, setRawText] = useState(initialText);
  const [listName, setListName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!listName.trim() || !rawText.trim()) return;
    onSubmit(listName, rawText);
    setListName('');
    setRawText('');
  };

  const sampleData = `Tomatoes:2 pieces::$1:::Produce::::Turkey Flautas
Tortillas:1 package::$5:::Aisles::::Turkey Flautas
Cereal:1 box::$5:::Aisles::::Pantry
Bread:1 loaf::$5:::Aisles::::Pantry
Eggs:2 dozen::$7:::Refrigerated::::Pantry
Bananas:1 bundle::$3:::Produce::::Pantry
Mexican Cheese:1 package::$5:::Refrigerated::::Turkey Flautas`;

  return (
    <form
      className={`js-form ${!isVisible ? 'collapsed' : ''}`}
      onSubmit={handleSubmit}
    >
      <h1>Edit Grocery List</h1>

      <div>
        <label htmlFor="listName">List Name:</label>
        <input
          id="listName"
          type="text"
          value={listName}
          onChange={(e) => setListName(e.target.value)}
          placeholder="e.g., Weekly Shopping"
          required
        />
      </div>

      <div>
        <textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          rows={20}
          cols={50}
          placeholder="Item:Qty::Price:::Location::::Meal"
          required
        />
      </div>

      <div className="form-buttons">
        <button type="submit">Save List</button>
        <button
          type="button"
          onClick={() => setRawText(sampleData)}
          className="sample-button"
        >
          Load Sample Data
        </button>
      </div>
    </form>
  );
}