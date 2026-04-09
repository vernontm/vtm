export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { imageUrl, hexColor } = req.body;

    if (!imageUrl || !hexColor) {
      return res.status(400).json({ error: 'imageUrl and hexColor are required' });
    }

    if (!/^#[0-9A-Fa-f]{6}$/.test(hexColor)) {
      return res.status(400).json({ error: 'Invalid hex color format (use #RRGGBB)' });
    }

    const apiKey = process.env.NANOBANANA_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'NanoBanana API key not configured' });
    }

    const prompt = `Change the wall color to ${hexColor}. Paint only the walls this exact color. Keep all furniture, decorations, windows, doors, flooring, ceiling, and other elements exactly the same. Maintain the same lighting, shadows, and perspective.`;

    const response = await fetch('https://api.nanobananaapi.ai/api/v1/nanobanana/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        prompt,
        type: 'IMAGETOIAMGE',
        imageUrls: [imageUrl],
        numImages: 1,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('NanoBanana API error:', err);
      return res.status(502).json({ error: 'Image generation request failed' });
    }

    const data = await response.json();
    const taskId = data.data?.taskId || data.taskId;

    if (!taskId) {
      console.error('No taskId returned:', JSON.stringify(data));
      return res.status(502).json({ error: 'No task ID returned from API' });
    }

    return res.status(200).json({ taskId });
  } catch (err) {
    console.error('Generate handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
