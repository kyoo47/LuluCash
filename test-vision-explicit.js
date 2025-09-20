/**
 * More detailed test script for the Google Vision API
 */
const fs = require('fs');
const path = require('path');

// Try a more direct approach using the key file explicitly
async function testVisionWithExplicitAuth() {
  try {
    const keyFile = path.join(process.cwd(), 'secrets', 'gcp-vision-key.json');
    console.log('Using key file:', keyFile);
    console.log('File exists:', fs.existsSync(keyFile));
    
    // Try to read and parse the key file
    const keyContent = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
    console.log('Project ID:', keyContent.project_id);
    console.log('Client Email:', keyContent.client_email);
    
    // Import the vision library with explicit credentials
    const { ImageAnnotatorClient } = require('@google-cloud/vision');
    const client = new ImageAnnotatorClient({
      keyFilename: keyFile
    });
    
    console.log('Vision client initialized with explicit credentials');
    
    // Test with a sample image
    const imagePath = path.join(process.cwd(), 'public', 'capture.png');
    
    if (!fs.existsSync(imagePath)) {
      console.error(`Test image not found at ${imagePath}`);
      return;
    }
    
    console.log(`Testing OCR with image: ${imagePath}`);
    console.log('Beginning API request...');
    
    const [result] = await client.textDetection(imagePath);
    console.log('API request completed successfully!');
    
    const detections = result?.textAnnotations || [];
    const fullText = detections.length ? detections[0].description : '';
    
    console.log('OCR Successful!');
    console.log('Text found (first 200 chars):');
    console.log(fullText.slice(0, 200));
    console.log(fullText.length > 200 ? '...' : '');
    
  } catch (error) {
    console.error('Error during Vision API test with explicit auth:');
    console.error(error.message);
    if (error.details) {
      console.error('Details:', error.details);
    }
  }
}

testVisionWithExplicitAuth();