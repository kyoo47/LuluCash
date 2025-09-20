/**
 * Test script to verify Google Cloud Vision API is working
 */
const fs = require('fs');
const path = require('path');
const { ImageAnnotatorClient } = require('@google-cloud/vision');

async function testVision() {
  try {
    console.log('Google Application Credentials:', process.env.GOOGLE_APPLICATION_CREDENTIALS);
    console.log('File exists:', fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS));
    
    // Create client
    const client = new ImageAnnotatorClient();
    console.log('Vision client initialized successfully');
    
    // Test with a sample image
    const imagePath = path.join(process.cwd(), 'public', 'capture.png');
    
    if (!fs.existsSync(imagePath)) {
      console.error(`Test image not found at ${imagePath}`);
      return;
    }
    
    console.log(`Testing OCR with image: ${imagePath}`);
    const [result] = await client.textDetection(imagePath);
    const detections = result?.textAnnotations || [];
    const fullText = detections.length ? detections[0].description : '';
    
    console.log('OCR Successful!');
    console.log('Text found (first 200 chars):');
    console.log(fullText.slice(0, 200));
    console.log(fullText.length > 200 ? '...' : '');
    
  } catch (error) {
    console.error('Error during Vision API test:');
    console.error(error);
  }
}

testVision();