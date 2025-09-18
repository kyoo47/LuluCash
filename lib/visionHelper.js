// lib/visionHelper.js
// Tiny helper around Google Cloud Vision to read ONLY digits from an image.
// Assumes GOOGLE_APPLICATION_CREDENTIALS env var is already set to your JSON key.

const fs = require("fs/promises");
const vision = require("@google-cloud/vision");

// If the env var is set, Vision will auto-pick it. Keeping an explicit
// client creation so we can log a friendly message.
const creds = process.env.GOOGLE_APPLICATION_CREDENTIALS || "(env not set)";
const client = new vision.ImageAnnotatorClient();

console.log(`[visionHelper] Using credentials: ${creds}`);

/**
 * Pulls all numeric digits (0-9) from Vision's OCR result.
 * Optionally enforces an expected length (e.g., 2 for Pick2, 3 for Pick3).
 *
 * @param {Buffer} imageBuffer - Raw image bytes
 * @param {{ expectedLength?: number, languageHints?: string[] }} [opts]
 * @returns {Promise<{ ok: boolean, digits: string, rawText: string, confidence?: number }>}
 */
async function readDigitsFromBuffer(imageBuffer, opts = {}) {
  const { expectedLength, languageHints } = opts;

  // Run OCR
  const [result] = await client.textDetection({
    image: { content: imageBuffer },
    imageContext: languageHints?.length ? { languageHints } : undefined,
  });

  // Pull text out of either fullTextAnnotation or the first textAnnotation
  const rawText =
    result?.fullTextAnnotation?.text ??
    (result?.textAnnotations && result.textAnnotations[0]?.description) ??
    "";

  // Keep ONLY digits
  const digits = (rawText.match(/\d/g) || []).join("");

  // Try to compute a simple average confidence (if Vision returned it)
  let confidence;
  try {
    const pages = result?.fullTextAnnotation?.pages || [];
    let sum = 0;
    let count = 0;
    for (const p of pages) {
      for (const b of p.blocks || []) {
        if (typeof b.confidence === "number") {
          sum += b.confidence;
          count++;
        }
        for (const par of b.paragraphs || []) {
          if (typeof par.confidence === "number") {
            sum += par.confidence;
            count++;
          }
          for (const w of par.words || []) {
            if (typeof w.confidence === "number") {
              sum += w.confidence;
              count++;
            }
          }
        }
      }
    }
    if (count > 0) confidence = +(sum / count).toFixed(3);
  } catch {
    // ignore confidence if shape not present
  }

  // Validate length if caller asked for it
  const ok =
    typeof expectedLength === "number"
      ? digits.length === expectedLength
      : digits.length > 0;

  return { ok, digits, rawText: rawText.trim(), confidence };
}

/**
 * Convenience wrapper to read digits from a file path.
 *
 * @param {string} filePath
 * @param {{ expectedLength?: number, languageHints?: string[] }} [opts]
 * @returns {Promise<{ ok: boolean, digits: string, rawText: string, confidence?: number }>}
 */
async function readDigitsFromFile(filePath, opts = {}) {
  const buf = await fs.readFile(filePath);
  return readDigitsFromBuffer(buf, opts);
}

module.exports = {
  readDigitsFromBuffer,
  readDigitsFromFile,
};
