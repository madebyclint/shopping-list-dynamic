# Google Cloud Vision OCR Setup

The receipt processing now uses real OCR via Google Cloud Vision API. 

## Setup Steps:

1. **Install dependencies**:
```bash
npm install @google-cloud/vision
```

2. **Create Google Cloud Project**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing one
   - Enable the Vision API

3. **Create Service Account**:
   - Go to IAM & Admin > Service Accounts
   - Create a new service account
   - Download the JSON key file
   - Place it in your project root (e.g., `google-cloud-key.json`)

4. **Set Environment Variables**:
```bash
# Add to your .env.local file
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_CLOUD_KEY_FILE=./google-cloud-key.json
```

5. **Security**: Add `google-cloud-key.json` to `.gitignore`

## Fallback Behavior:

If Google Cloud Vision is not configured, the system will:
- Use basic text extraction (placeholder)
- Still process the receipt image
- Indicate OCR configuration is needed
- Continue with the workflow

## Alternative OCR Services:

You can also use:
- **AWS Textract**: More expensive but very accurate
- **Azure Computer Vision**: Good alternative to Google
- **Tesseract.js**: Free, runs client-side, less accurate

Replace the OCR function in `/app/api/receipts/process/route.ts` with your preferred service.