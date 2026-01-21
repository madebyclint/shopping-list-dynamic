'use client';

import { useState, useEffect } from 'react';
import { WeeklyMealPlan } from './types';
import { fetchPlans, deleteMealPlan, updateMealPlan } from './utils';

interface PlanManagementProps {
  currentPlan: WeeklyMealPlan | null;
  setCurrentPlan: (plan: WeeklyMealPlan | null) => void;
  onPlanUpdate: () => void;
}

export default function PlanManagement({
  currentPlan,
  setCurrentPlan,
  onPlanUpdate
}: PlanManagementProps) {
  const [plans, setPlans] = useState<WeeklyMealPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPlan, setEditingPlan] = useState<WeeklyMealPlan | null>(null);
  const [editForm, setEditForm] = useState({ name: '', week_start_date: '' });

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    setLoading(true);
    try {
      const fetchedPlans = await fetchPlans();
      setPlans(fetchedPlans);
    } catch (error) {
      console.error('Error loading plans:', error);
    }
    setLoading(false);
  };

  const handleSelectPlan = (plan: WeeklyMealPlan) => {
    setCurrentPlan(plan);
  };

  const handleEditPlan = (plan: WeeklyMealPlan) => {
    setEditingPlan(plan);
    setEditForm({
      name: plan.name,
      week_start_date: plan.week_start_date
    });
  };

  const handleSaveEdit = async () => {
    if (!editingPlan) return;

    const success = await updateMealPlan(editingPlan.id!, editForm);
    if (success) {
      // Update the plan in the local state
      setPlans(plans.map(plan =>
        plan.id === editingPlan.id
          ? { ...plan, ...editForm }
          : plan
      ));

      // Update current plan if it's the one being edited
      if (currentPlan?.id === editingPlan.id) {
        setCurrentPlan({ ...currentPlan, ...editForm });
      }

      setEditingPlan(null);
      onPlanUpdate();
    } else {
      alert('Failed to update meal plan');
    }
  };

  const handleCancelEdit = () => {
    setEditingPlan(null);
    setEditForm({ name: '', week_start_date: '' });
  };

  const handleDeletePlan = async (plan: WeeklyMealPlan) => {
    if (!confirm(`Are you sure you want to delete "${plan.name}"? This will also delete all associated meals.`)) {
      return;
    }

    const success = await deleteMealPlan(plan.id!);
    if (success) {
      setPlans(plans.filter(p => p.id !== plan.id));

      // Clear current plan if it was deleted
      if (currentPlan?.id === plan.id) {
        setCurrentPlan(null);
      }

      onPlanUpdate();
    } else {
      alert('Failed to delete meal plan');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading) {
    return <div className="plan-management loading">Loading plans...</div>;
  }

  return (
    <div className="plan-management">
      <h3>Meal Plan Management</h3>

      {plans.length === 0 ? (
        <p className="no-plans">No meal plans found. Create your first plan above!</p>
      ) : (
        <div className="plans-grid">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`plan-card ${currentPlan?.id === plan.id ? 'active' : ''}`}
            >
              {editingPlan?.id === plan.id ? (
                <div className="edit-form">
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="edit-name-input"
                  />
                  <input
                    type="date"
                    value={editForm.week_start_date}
                    onChange={(e) => setEditForm({ ...editForm, week_start_date: e.target.value })}
                    className="edit-date-input"
                  />
                  <div className="edit-buttons">
                    <button onClick={handleSaveEdit} className="save-btn">
                      Save
                    </button>
                    <button onClick={handleCancelEdit} className="cancel-btn">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="plan-info">
                  <h4 className="plan-name">{plan.name}</h4>
                  <p className="plan-date">Week of {formatDate(plan.week_start_date)}</p>
                  <div className="plan-actions">
                    <button
                      onClick={() => handleSelectPlan(plan)}
                      className="select-btn"
                      disabled={currentPlan?.id === plan.id}
                    >
                      {currentPlan?.id === plan.id ? 'Active' : 'Select'}
                    </button>
                    <button
                      onClick={() => handleEditPlan(plan)}
                      className="edit-btn"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeletePlan(plan)}
                      className="delete-btn"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        .plan-management {
          background: white;
          border-radius: 8px;
          padding: 20px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          margin-bottom: 20px;
        }

        .plan-management h3 {
          color: #333;
          margin-bottom: 15px;
          font-size: 1.2em;
        }

        .loading {
          text-align: center;
          color: #666;
          padding: 40px;
        }

        .no-plans {
          text-align: center;
          color: #666;
          font-style: italic;
          padding: 20px;
        }

        .plans-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 15px;
        }

        .plan-card {
          border: 2px solid #e0e0e0;
          border-radius: 8px;
          padding: 15px;
          transition: all 0.2s ease;
        }

        .plan-card:hover {
          border-color: #007bff;
          box-shadow: 0 2px 8px rgba(0,123,255,0.15);
        }

        .plan-card.active {
          border-color: #28a745;
          background-color: #f8fff9;
        }

        .plan-info h4 {
          margin: 0 0 8px 0;
          color: #333;
          font-size: 1.1em;
        }

        .plan-date {
          color: #666;
          font-size: 0.9em;
          margin: 0 0 15px 0;
        }

        .plan-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .plan-actions button {
          padding: 6px 12px;
          border: none;
          border-radius: 4px;
          font-size: 0.85em;
          cursor: pointer;
          transition: background-color 0.2s ease;
        }

        .select-btn {
          background-color: #007bff;
          color: white;
        }

        .select-btn:disabled {
          background-color: #28a745;
          cursor: default;
        }

        .select-btn:hover:not(:disabled) {
          background-color: #0056b3;
        }

        .edit-btn {
          background-color: #6c757d;
          color: white;
        }

        .edit-btn:hover {
          background-color: #545b62;
        }

        .delete-btn {
          background-color: #dc3545;
          color: white;
        }

        .delete-btn:hover {
          background-color: #c82333;
        }

        .edit-form {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .edit-name-input,
        .edit-date-input {
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 0.9em;
        }

        .edit-buttons {
          display: flex;
          gap: 8px;
        }

        .save-btn {
          background-color: #28a745;
          color: white;
          padding: 8px 16px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }

        .save-btn:hover {
          background-color: #218838;
        }

        .cancel-btn {
          background-color: #6c757d;
          color: white;
          padding: 8px 16px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }

        .cancel-btn:hover {
          background-color: #545b62;
        }
      `}</style>
    </div>
  );
}