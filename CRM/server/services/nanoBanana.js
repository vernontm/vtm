/**
 * nanoBanana.js
 * Integration with NanoBanana API (nanobananaapi.ai) for AI image generation.
 * Handles image generation requests via async task flow and saves output to the correct brand folder.
 *
 * Flow: POST generate → receive taskId → poll record-info until completed → download image
 */

const fs = require('fs');
const path = require('path');
const { db } = require('../db');

function getSetting(key) {
  return db.get('app_settings').find({ key }).value()?.value || '';
}

// ── Brand folder mapping ────────────────────────────────────────────────────
const BRAND_FOLDERS = {
  kara: 'kara-content',
  ray:  'ray-content',
  vtm:  'vtm-content',
};

// ── Brand-specific image sizes ──────────────────────────────────────────────
const CONTENT_TYPE_SIZES = {
  reel:         '9:16',
  story:        '9:16',
  youtube_short:'9:16',
  talking_head: '9:16',
  carousel:     '1:1',
  static_post:  '1:1',
  case_study:   '4:3',
};

/**
 * Ensure the output folder exists for a given brand.
 */
function ensureBrandFolder(brandSlug) {
  const basePath = getSetting('content_output_base') || path.join(__dirname, '..', '..', 'content-output');
  const brandFolder = path.join(basePath, BRAND_FOLDERS[brandSlug] || brandSlug);
  if (!fs.existsSync(brandFolder)) {
    fs.mkdirSync(brandFolder, { recursive: true });
  }
  return brandFolder;
}

/**
 * Sleep helper for polling
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Poll NanoBanana API for task completion.
 * Polls every 3 seconds, up to maxAttempts times.
 *
 * @param {string} taskId - The task ID returned from the generate endpoint
 * @param {string} apiKey - Bearer token
 * @param {number} maxAttempts - Max polling attempts (default 40 = ~2 minutes)
 * @returns {Promise<object>} The completed task data with image URLs
 */
async function pollTaskStatus(taskId, apiKey, maxAttempts = 40) {
  const pollUrl = `https://api.nanobananaapi.ai/api/v1/nanobanana/record-info?taskId=${taskId}`;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await sleep(3000); // Wait 3 seconds between polls

    const response = await fetch(pollUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`NanoBanana poll error (${response.status}): ${errBody}`);
    }

    const result = await response.json();
    const status = result.data?.status || result.status;

    console.log(`[NanoBanana] Poll attempt ${attempt}/${maxAttempts} — status: ${status}`);

    if (status === 'completed' || status === 'COMPLETED') {
      return result.data || result;
    }

    if (status === 'failed' || status === 'FAILED') {
      throw new Error(`NanoBanana generation failed: ${result.data?.error || result.msg || 'Unknown error'}`);
    }

    // Still processing — continue polling
  }

  throw new Error(`NanoBanana generation timed out after ${maxAttempts * 3} seconds`);
}

/**
 * Generate an image using NanoBanana API.
 *
 * @param {string} prompt - The image generation prompt
 * @param {string} brandSlug - kara | ray | vtm
 * @param {string} contentId - The content item ID (for naming the file)
 * @param {string} [contentType] - Content type for aspect ratio selection
 * @returns {Promise<object>} { success, asset_path, error }
 */
async function generateImage(prompt, brandSlug, contentId, contentType = null) {
  const apiKey = getSetting('nanobanana_api_key') || process.env.NANOBANANA_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      asset_path: null,
      error: 'NanoBanana API key not configured. Add it in Settings or set NANOBANANA_API_KEY in .env',
    };
  }

  const brandFolder = ensureBrandFolder(brandSlug);
  const imageSize = CONTENT_TYPE_SIZES[contentType] || '1:1';

  try {
    // ── Step 1: Submit generation request ────────────────────────────────────
    console.log(`[NanoBanana] Submitting generation for ${brandSlug}/${contentId} (${imageSize})`);

    const response = await fetch('https://api.nanobananaapi.ai/api/v1/nanobanana/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        prompt: prompt,
        numImages: 1,
        type: 'TEXTTOIAMGE',
        image_size: imageSize,
        // No callBackUrl — we poll instead
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`NanoBanana API error (${response.status}): ${errBody}`);
    }

    const data = await response.json();
    const taskId = data.data?.taskId || data.taskId;

    if (!taskId) {
      throw new Error(`No taskId returned from NanoBanana: ${JSON.stringify(data)}`);
    }

    console.log(`[NanoBanana] Task submitted: ${taskId}`);

    // ── Step 2: Poll for completion ──────────────────────────────────────────
    const taskResult = await pollTaskStatus(taskId, apiKey);

    // ── Step 3: Extract image URL from result ────────────────────────────────
    // Try common response shapes
    const imageUrl =
      taskResult.imageUrl ||
      taskResult.image_url ||
      taskResult.images?.[0]?.url ||
      taskResult.images?.[0] ||
      taskResult.output?.[0]?.url ||
      taskResult.output?.[0] ||
      taskResult.url;

    if (!imageUrl) {
      console.error('[NanoBanana] Unexpected task result shape:', JSON.stringify(taskResult).slice(0, 500));
      throw new Error('No image URL found in completed task result');
    }

    console.log(`[NanoBanana] Image ready: ${imageUrl}`);

    // ── Step 4: Download and save the image ──────────────────────────────────
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to download image (${imageResponse.status})`);
    }

    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    const timestamp = Date.now();
    const filename = `${brandSlug}_${contentId}_${timestamp}.png`;
    const filePath = path.join(brandFolder, filename);

    fs.writeFileSync(filePath, imageBuffer);
    console.log(`[NanoBanana] Saved: ${filePath}`);

    return {
      success: true,
      asset_path: filePath,
      filename: filename,
      error: null,
    };
  } catch (err) {
    console.error(`[NanoBanana] Generation failed for ${contentId}:`, err.message);
    return {
      success: false,
      asset_path: null,
      error: err.message,
    };
  }
}

module.exports = { generateImage, ensureBrandFolder, BRAND_FOLDERS };
