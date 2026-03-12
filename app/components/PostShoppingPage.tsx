'use client';

import React, { useState, useEffect } from 'react';
import ReceiptUpload from '@/app/components/ReceiptUpload';
import PostShoppingFeedbackForm from '@/app/components/PostShoppingFeedbackForm';

interface PostShoppingPageProps {
  groceryListId: number;
}

interface ShoppingSession {
  id: string;
  name: string;
  createdAt: string;
  feedbackCompleted: boolean;
}

interface ReceiptData {
  id: string;
  processed: boolean;
  items: ReceiptItem[];
  totalAmount: number;
}

interface ReceiptItem {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  matchedToPlanned: boolean;
}

interface AnalysisData {
  receiptItems: ReceiptItem[];
  plannedItems: any[];
  analysis: {
    totalPlannedCost: number;
    totalActualCost: number;
    costVariance: number;
    costVariancePercentage: number;
    extraItems: number;
    missedItems: number;
    matchedItems: number;
    shoppingEfficiency: number;
  };
  insights: {
    type: 'success' | 'warning' | 'info';
    message: string;
  }[];
}

export default function PostShoppingPage({ groceryListId }: PostShoppingPageProps) {
  const [currentStep, setCurrentStep] = useState<'upload' | 'analysis' | 'feedback' | 'complete'>('upload');
  const [session, setSession] = useState<ShoppingSession | null>(null);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [plannedMeals, setPlannedMeals] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadGroceryList();
  }, [groceryListId]);

  const loadGroceryList = async () => {
    try {
      const response = await fetch(`/api/grocery-lists/${groceryListId}`);
      if (!response.ok) {
        throw new Error('Failed to load grocery list');
      }
      
      const data = await response.json();
      setSession({
        id: data.id.toString(),
        name: data.name,
        createdAt: data.created_at,
        feedbackCompleted: data.feedback_completed || false
      });
      setPlannedMeals([]); // No planned meals in the current structure

      // If feedback is already completed, go to complete step
      if (data.feedback_completed) {
        setCurrentStep('complete');
      }

      // Check if there's already a receipt for this list
      // Skip this check for now as the endpoint doesn't exist yet
      // const existingReceiptResponse = await fetch(
      //   `/api/grocery-lists/${groceryListId}/receipt`
      // );

    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load list');
    } finally {
      setLoading(false);
    }
  };

  const loadAnalysisData = async (receiptId: string) => {
    try {
      const response = await fetch('/api/receipts/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptId, groceryListId })
      });

      if (!response.ok) {
        throw new Error('Failed to analyze receipt');
      }

      const data = await response.json();
      setAnalysisData(data);

    } catch (error) {
      setError(error instanceof Error ? error.message : 'Analysis failed');
    }
  };

  const handleReceiptUploadComplete = async (result: any) => {
    try {
      setReceiptData({
        id: result.receiptId,
        processed: false,
        items: [],
        totalAmount: 0
      });

      // Poll for processing completion
      const pollInterval = setInterval(async () => {
        try {
          const response = await fetch(`/api/receipts/${result.receiptId}`);
          if (response.ok) {
            const data = await response.json();
            
            if (data.receipt.processed) {
              clearInterval(pollInterval);
              setReceiptData({
                id: data.receipt.id,
                processed: true,
                items: [],
                totalAmount: data.receipt.total || 0
              });
              
              await loadAnalysisData(data.receipt.id);
              setCurrentStep('analysis');
            }
          }
        } catch (error) {
          clearInterval(pollInterval);
          setError('Failed to check processing status');
        }
      }, 2000);

      // Clear interval after 2 minutes
      setTimeout(() => clearInterval(pollInterval), 120000);

    } catch (error) {
      setError(error instanceof Error ? error.message : 'Upload processing failed');
    }
  };

  const handleFeedbackSubmitSuccess = (feedbackId: string) => {
    setCurrentStep('complete');
    setSession(prev => prev ? { ...prev, feedbackCompleted: true } : null);
  };

  const handleFeedbackSubmitError = (error: string) => {
    setError(error);
  };

  const renderUploadStep = () => (
    <div>
      <h2>Upload Your Receipt</h2>
      <p>
        Take a photo or upload your shopping receipt to get started with analysis
      </p>
      
      <ReceiptUpload
        groceryListId={groceryListId.toString()}
        storeName={session?.name}
        onUploadComplete={handleReceiptUploadComplete}
        onUploadError={setError}
      />

      {receiptData && !receiptData.processed && (
        <div className="processing-indicator">
          <div>
            <div className="spinner"></div>
            <span className="message">Processing your receipt...</span>
          </div>
          <p className="sub-message">
            This usually takes 30-60 seconds
          </p>
        </div>
      )}
    </div>
  );

  const renderAnalysisStep = () => {
    if (!analysisData) {
      return (
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Analyzing your receipt...</p>
        </div>
      );
    }

    return (
      <div>
        <h2>Shopping Analysis</h2>
        <p>
          Here's how your actual shopping compared to your planned list
        </p>
        
        {/* Analysis content placeholder */}
        <div style={{ background: 'var(--background-alt)', padding: '1rem', borderRadius: '6px', marginBottom: '1.5rem' }}>
          <p style={{ color: 'var(--text-subdued)' }}>
            Receipt processed with OCR. Analysis results will be displayed here...
          </p>
        </div>
        
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={() => setCurrentStep('feedback')}
            className="analysis-continue-btn"
          >
            Continue to Feedback
          </button>
        </div>
      </div>
    );
  };

  const renderFeedbackStep = () => {
    if (!analysisData) return null;

    return (
      <div>
        <h2>Share Your Feedback</h2>
        <p>
          Help us improve your future meal planning and shopping experience
        </p>
        
        <PostShoppingFeedbackForm
          groceryListId={groceryListId}
          receiptItems={analysisData.receiptItems || []}
          plannedItems={analysisData.plannedItems || []}
          onSubmitSuccess={handleFeedbackSubmitSuccess}
          onSubmitError={handleFeedbackSubmitError}
        />
      </div>
    );
  };

  const renderCompleteStep = () => (
    <div className="completion-container">
      <div className="completion-icon">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
        </svg>
      </div>
      
      <h2>Feedback Complete!</h2>
      <p>
        Thank you for sharing your feedback. We'll use this to improve your future meal planning.
      </p>
      
      <div className="completion-actions">
        <button
          onClick={() => window.location.href = '/analytics'}
          className="insights-btn"
        >
          View Shopping Insights
        </button>
        
        <button
          onClick={() => window.location.href = '/meal-plans'}
          className="block w-full px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200"
        >
          Plan Next Week's Meals
        </button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading your shopping session...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <h3>Error</h3>
        <p>{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="error-retry-btn"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="loading-container">
        <p>Shopping session not found.</p>
      </div>
    );
  }

  return (
    <div className="post-shopping-container">
      {/* Header */}
      <div className="post-shopping-header">
        <h1>Post-Shopping Experience</h1>
        <p>
          List: {session.name} - Created {new Date(session.createdAt).toLocaleDateString()}
        </p>
      </div>

      {/* Progress Indicator */}
      <div className="post-shopping-progress">
        <div className="progress-steps">
          {(['upload', 'analysis', 'feedback', 'complete'] as const).map((step, index) => {
            const isActive = currentStep === step;
            const isCompleted = ['upload', 'analysis', 'feedback', 'complete'].indexOf(currentStep) > index;
            
            return (
              <div key={step} className="progress-step">
                <div className={`step-indicator ${
                  isCompleted ? 'completed' : 
                  isActive ? 'active' : 
                  'pending'
                }`}>
                  {isCompleted ? '✓' : index + 1}
                </div>
                {index < 3 && (
                  <div className={`step-connector ${
                    isCompleted ? 'completed' : 'pending'
                  }`} />
                )}
              </div>
            );
          })}
        </div>
        
        <div className="progress-labels">
          <span>Upload</span>
          <span>Analysis</span>
          <span>Feedback</span>
          <span>Complete</span>
        </div>
      </div>

      {/* Step Content */}
      <div className="post-shopping-content">
        <div className="step-content">
          {currentStep === 'upload' && renderUploadStep()}
          {currentStep === 'analysis' && renderAnalysisStep()}
          {currentStep === 'feedback' && renderFeedbackStep()}
          {currentStep === 'complete' && renderCompleteStep()}
        </div>
      </div>
    </div>
  );
}