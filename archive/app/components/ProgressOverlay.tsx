'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface ProgressOverlayProps {
  isVisible: boolean;
  message?: string;
  subMessage?: string;
  progress?: number; // 0-100 for progress bar, undefined for indeterminate
}

export default function ProgressOverlay({
  isVisible,
  message = "Processing...",
  subMessage,
  progress
}: ProgressOverlayProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!isVisible || !mounted) return null;

  const overlayContent = (
    <div className="progress-overlay">
      <div className="progress-content">
        {/* Bouncing grocery emojis for shopping list generation */}
        {message.includes('Chef') && (
          <div className="bouncing-groceries">
            <span className="grocery-emoji">🥕</span>
            <span className="grocery-emoji">🍎</span>
            <span className="grocery-emoji">🥖</span>
            <span className="grocery-emoji">🧀</span>
            <span className="grocery-emoji">🥚</span>
          </div>
        )}
        <div className="progress-spinner">
          <div className="spinner-ring"></div>
        </div>
        <h3>{message}</h3>
        {subMessage && (
          <p className="progress-submessage">{subMessage}</p>
        )}
        {progress !== undefined && (
          <div className="progress-bar-container">
            <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(overlayContent, document.body);
}