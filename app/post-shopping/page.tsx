'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import PostShoppingPage from '@/app/components/PostShoppingPage';

function PostShoppingContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('sessionId');
  const userId = searchParams.get('userId');

  if (!sessionId || !userId) {
    return (
      <div className="max-w-2xl mx-auto p-4 text-center py-12">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-yellow-800 mb-2">Missing Information</h2>
          <p className="text-yellow-700">
            This page requires a valid shopping session ID and user ID.
          </p>
          <p className="text-sm text-yellow-600 mt-2">
            Please access this page through your shopping list or recent trips.
          </p>
          <button
            onClick={() => window.location.href = '/shopping-lists'}
            className="mt-4 px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700"
          >
            Go to Shopping Lists
          </button>
        </div>
      </div>
    );
  }

  return <PostShoppingPage sessionId={sessionId} userId={userId} />;
}

export default function PostShoppingPageRoute() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Suspense fallback={
        <div className="max-w-2xl mx-auto p-4 text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      }>
        <PostShoppingContent />
      </Suspense>
    </div>
  );
}