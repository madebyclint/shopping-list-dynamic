'use client';

import { useState } from 'react';

interface PantryItem {
  name: string;
  category: string;
  qty: string;
  estimatedPrice: number;
}

interface PantryExtrasProps {
  planId: number;
  onItemsGenerated: (items: PantryItem[]) => void;
  onStatsUpdate: () => void;
  existingItems: PantryItem[];
}

export default function PantryExtras({
  planId,
  onItemsGenerated,
  onStatsUpdate,
  existingItems = []
}: PantryExtrasProps) {
  const [prompt, setPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewItems, setPreviewItems] = useState<PantryItem[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState('');

  const handleEnhancePrompt = async () => {
    if (!prompt.trim()) {
      setError('Please enter what you need for your pantry/extras');
      return;
    }

    setIsProcessing(true);
    setError('');

    try {
      const response = await fetch('/api/pantry/enhance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
          planId
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to enhance pantry items');
      }

      const result = await response.json();

      if (result.success && result.items) {
        setPreviewItems(result.items);
        setShowPreview(true);
        onStatsUpdate(); // Update AI usage stats
      } else {
        setError(result.error || 'Failed to process pantry items');
      }
    } catch (err) {
      console.error('Error enhancing pantry items:', err);
      setError('Failed to process pantry request. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddItems = () => {
    // Merge with existing items, avoiding duplicates
    const combinedItems = [...existingItems];

    previewItems.forEach(newItem => {
      const existingIndex = combinedItems.findIndex(
        existing => existing.name.toLowerCase() === newItem.name.toLowerCase()
      );

      if (existingIndex >= 0) {
        // Update existing item
        combinedItems[existingIndex] = newItem;
      } else {
        // Add new item
        combinedItems.push(newItem);
      }
    });

    onItemsGenerated(combinedItems);
    setPreviewItems([]);
    setShowPreview(false);
    setPrompt('');
  };

  const handleRemoveItem = (index: number) => {
    const updatedItems = existingItems.filter((_, i) => i !== index);
    onItemsGenerated(updatedItems);
  };

  const handleClearPreview = () => {
    setPreviewItems([]);
    setShowPreview(false);
    setError('');
  };

  const getTotalEstimatedCost = (items: PantryItem[]) => {
    return items.reduce((total, item) => total + (item.estimatedPrice || 0), 0);
  };

  return (
    <div className="pantry-extras-section">
      <div className="pantry-header">
        <h2>🏠 Pantry & Extras</h2>
        <p>Tell us what else you need, and AI will help add specific items to your shopping list.</p>
      </div>

      <div className="pantry-input-section">
        <div className="prompt-input-group">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g., 'need basic cooking oils and spices' or 'running low on breakfast items' or 'household cleaning supplies'"
            rows={3}
            disabled={isProcessing}
            className="pantry-prompt-input"
          />
          <button
            onClick={handleEnhancePrompt}
            disabled={isProcessing || !prompt.trim()}
            className="enhance-prompt-btn"
          >
            {isProcessing ? '🤖 AI Processing...' : '✨ Enhance with AI'}
          </button>
        </div>

        {error && (
          <div className="error-message">
            ⚠️ {error}
          </div>
        )}
      </div>

      {showPreview && previewItems.length > 0 && (
        <div className="preview-section">
          <div className="preview-header">
            <h3>🔍 Preview Generated Items</h3>
            <div className="preview-actions">
              <button onClick={handleAddItems} className="add-items-btn">
                ➕ Add All Items ({previewItems.length})
              </button>
              <button onClick={handleClearPreview} className="clear-preview-btn">
                ❌ Cancel
              </button>
            </div>
          </div>

          <div className="preview-items">
            {previewItems.map((item, index) => (
              <div key={index} className="preview-item">
                <div className="item-details">
                  <span className="item-name">{item.name}</span>
                  <span className="item-qty">{item.qty}</span>
                  <span className="item-category">{item.category}</span>
                  <span className="item-price">${item.estimatedPrice?.toFixed(2) || '0.00'}</span>
                </div>
              </div>
            ))}
            <div className="preview-total">
              Total estimated cost: ${getTotalEstimatedCost(previewItems).toFixed(2)}
            </div>
          </div>
        </div>
      )}

      {existingItems.length > 0 && (
        <div className="existing-items-section">
          <h3>📝 Added Pantry Items ({existingItems.length})</h3>
          <div className="existing-items-list">
            {existingItems.map((item, index) => (
              <div key={index} className="existing-item">
                <div className="item-details">
                  <span className="item-name">{item.name}</span>
                  <span className="item-qty">{item.qty}</span>
                  <span className="item-category">{item.category}</span>
                  <span className="item-price">${item.estimatedPrice?.toFixed(2) || '0.00'}</span>
                </div>
                <button
                  onClick={() => handleRemoveItem(index)}
                  className="remove-item-btn"
                  title="Remove item"
                >
                  ❌
                </button>
              </div>
            ))}
            <div className="existing-total">
              Total estimated cost: ${getTotalEstimatedCost(existingItems).toFixed(2)}
            </div>
          </div>
        </div>
      )}

      {existingItems.length === 0 && !showPreview && (
        <div className="empty-state">
          <p>💡 <strong>Examples:</strong></p>
          <ul>
            <li>"Basic cooking essentials - olive oil, garlic, onions"</li>
            <li>"Breakfast items for the week"</li>
            <li>"Running low on spices and seasonings"</li>
            <li>"Household cleaning supplies"</li>
            <li>"Snacks for movie night"</li>
          </ul>
        </div>
      )}

      <style jsx>{`
        .pantry-extras-section {
          background: #f8f9fa;
          border: 2px solid #e9ecef;
          border-radius: 12px;
          padding: 24px;
          margin: 24px 0;
        }

        .pantry-header h2 {
          margin: 0 0 8px 0;
          color: #495057;
          font-size: 24px;
        }

        .pantry-header p {
          margin: 0 0 20px 0;
          color: #6c757d;
          font-size: 14px;
        }

        .prompt-input-group {
          display: flex;
          gap: 12px;
          margin-bottom: 16px;
        }

        .pantry-prompt-input {
          flex: 1;
          padding: 12px;
          border: 2px solid #dee2e6;
          border-radius: 8px;
          font-size: 14px;
          resize: vertical;
          min-height: 80px;
        }

        .pantry-prompt-input:focus {
          outline: none;
          border-color: #007bff;
        }

        .enhance-prompt-btn {
          padding: 12px 20px;
          background: #007bff;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          cursor: pointer;
          white-space: nowrap;
          height: fit-content;
        }

        .enhance-prompt-btn:disabled {
          background: #6c757d;
          cursor: not-allowed;
        }

        .enhance-prompt-btn:hover:not(:disabled) {
          background: #0056b3;
        }

        .error-message {
          color: #dc3545;
          font-size: 14px;
          margin-top: 8px;
          padding: 8px;
          background: #f8d7da;
          border-radius: 4px;
        }

        .preview-section {
          background: white;
          border: 2px solid #007bff;
          border-radius: 8px;
          padding: 16px;
          margin: 16px 0;
        }

        .preview-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .preview-header h3 {
          margin: 0;
          color: #007bff;
        }

        .preview-actions {
          display: flex;
          gap: 8px;
        }

        .add-items-btn {
          padding: 8px 16px;
          background: #28a745;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
        }

        .add-items-btn:hover {
          background: #218838;
        }

        .clear-preview-btn {
          padding: 8px 16px;
          background: #dc3545;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
        }

        .clear-preview-btn:hover {
          background: #c82333;
        }

        .preview-items, .existing-items-list {
          display: grid;
          gap: 8px;
        }

        .preview-item, .existing-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px;
          background: #f8f9fa;
          border: 1px solid #dee2e6;
          border-radius: 6px;
        }

        .item-details {
          display: grid;
          grid-template-columns: 2fr 1fr 1fr 80px;
          gap: 12px;
          align-items: center;
          flex: 1;
        }

        .item-name {
          font-weight: 500;
          color: #495057;
        }

        .item-qty {
          color: #6c757d;
          font-size: 14px;
        }

        .item-category {
          color: #007bff;
          font-size: 12px;
          text-transform: uppercase;
          font-weight: 500;
        }

        .item-price {
          font-weight: 500;
          color: #28a745;
          text-align: right;
        }

        .remove-item-btn {
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px;
          font-size: 12px;
        }

        .preview-total, .existing-total {
          margin-top: 12px;
          padding-top: 12px;
          border-top: 2px solid #dee2e6;
          text-align: right;
          font-weight: 600;
          color: #495057;
        }

        .existing-items-section {
          background: white;
          border: 2px solid #28a745;
          border-radius: 8px;
          padding: 16px;
          margin: 16px 0;
        }

        .existing-items-section h3 {
          margin: 0 0 16px 0;
          color: #28a745;
        }

        .empty-state {
          color: #6c757d;
          font-size: 14px;
          margin-top: 16px;
        }

        .empty-state p {
          margin: 0 0 8px 0;
          font-weight: 500;
        }

        .empty-state ul {
          margin: 0;
          padding-left: 20px;
        }

        .empty-state li {
          margin-bottom: 4px;
        }
      `}</style>
    </div>
  );
}