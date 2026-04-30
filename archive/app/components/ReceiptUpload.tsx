'use client';

import React, { useState, useRef, useCallback } from 'react';

interface ReceiptUploadProps {
  groceryListId: string;
  storeName?: string;
  onUploadComplete: (result: ReceiptUploadResult) => void;
  onUploadError: (error: string) => void;
}

interface ReceiptUploadResult {
  receiptId: string;
  filename: string;
  uploadUrl: string;
  message: string;
}

export default function ReceiptUpload({
  groceryListId,
  storeName,
  onUploadComplete,
  onUploadError
}: ReceiptUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file) return;

    // Validate file
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      onUploadError('Only JPEG, PNG, and WebP images are allowed');
      return;
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      onUploadError('File size must be less than 10MB');
      return;
    }

    // Create preview
    const preview = URL.createObjectURL(file);
    setPreviewUrl(preview);

    // Upload file
    await uploadReceipt(file);
  }, [onUploadError, groceryListId, storeName]);

  const uploadReceipt = async (file: File) => {
    setUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('receipt', file);
      formData.append('groceryListId', groceryListId);
      if (storeName) {
        formData.append('storeName', storeName);
      }

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 100);

      const response = await fetch('/api/receipts/upload', {
        method: 'POST',
        body: formData
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      const result = await response.json();
      setUploading(false);

      // Start processing
      await processReceipt(result.receiptId);
      
      onUploadComplete(result);

    } catch (error) {
      setUploading(false);
      setUploadProgress(0);
      onUploadError(error instanceof Error ? error.message : 'Upload failed');
    }
  };

  const processReceipt = async (receiptId: string) => {
    setProcessing(true);

    try {
      const response = await fetch('/api/receipts/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ receiptId })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Processing failed');
      }

      const result = await response.json();
      setProcessing(false);

      // Processing completed successfully
      console.log('Receipt processed:', result);

    } catch (error) {
      setProcessing(false);
      onUploadError(error instanceof Error ? error.message : 'Processing failed');
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    const imageFile = files.find(file => file.type.startsWith('image/'));
    
    if (imageFile) {
      handleFileSelect(imageFile);
    } else {
      onUploadError('Please drop an image file');
    }
  }, [handleFileSelect, onUploadError]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const takePhoto = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment', // Use back camera
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        } 
      });

      // Create video element to capture photo
      const video = document.createElement('video');
      video.srcObject = stream;
      video.play();

      video.addEventListener('loadedmetadata', () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0);
          
          canvas.toBlob((blob) => {
            if (blob) {
          const file = new File([blob], `receipt-${Date.now()}.jpg`, { type: 'image/jpeg' });
              handleFileSelect(file);
            }
          }, 'image/jpeg', 0.8);
        }

        // Stop camera
        stream.getTracks().forEach(track => track.stop());
      });

    } catch (error) {
      onUploadError('Camera access failed. Please upload a photo instead.');
    }
  };

  const resetUpload = () => {
    setPreviewUrl(null);
    setUploadProgress(0);
    setUploading(false);
    setProcessing(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-4">
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Upload Receipt</h3>
        
        {!previewUrl && (
          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
              dragOver 
                ? 'border-blue-400 bg-blue-50' 
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <div className="space-y-4">
              <div className="text-gray-600">
                <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                  <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-gray-600">
                  Drop your receipt image here, or
                </p>
                <div className="mt-3 space-y-2">
                  <button
                    onClick={triggerFileInput}
                    className="w-full px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100"
                  >
                    Choose File
                  </button>
                  
                  <button
                    onClick={takePhoto}
                    className="w-full px-4 py-2 text-sm font-medium text-green-600 bg-green-50 border border-green-200 rounded-md hover:bg-green-100"
                  >
                    📷 Take Photo
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-500">
                JPEG, PNG, WebP up to 10MB
              </p>
            </div>
          </div>
        )}

        {previewUrl && (
          <div className="space-y-4">
            <div className="relative">
              <img
                src={previewUrl}
                alt="Receipt preview"
                className="w-full h-64 object-contain bg-gray-50 rounded-lg"
              />
              <button
                onClick={resetUpload}
                className="absolute top-2 right-2 p-1 bg-gray-800 text-white rounded-full hover:bg-gray-900"
              >
                ✕
              </button>
            </div>

            {(uploading || processing) && (
              <div className="space-y-2">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${
                      processing ? 'bg-blue-600' : 'bg-green-600'
                    }`}
                    style={{ width: `${processing ? 50 : uploadProgress}%` }}
                  />
                </div>
                <p className="text-sm text-gray-600 text-center">
                  {uploading && 'Uploading receipt...'}
                  {processing && 'Processing with OCR...'}
                </p>
              </div>
            )}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              handleFileSelect(file);
            }
          }}
        />
      </div>
    </div>
  );
}