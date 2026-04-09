export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { taskId } = req.query;

  if (!taskId) {
    return res.status(400).json({ error: 'taskId query parameter is required' });
  }

  const apiKey = process.env.NANOBANANA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'NanoBanana API key not configured' });
  }

  try {
    const response = await fetch(
      `https://api.nanobananaapi.ai/api/v1/nanobanana/record-info?taskId=${taskId}`,
      {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${apiKey}` },
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error('NanoBanana poll error:', err);
      return res.status(502).json({ error: 'Failed to check task status' });
    }

    const result = await response.json();
    const taskData = result.data || result;
    const status = taskData.status?.toLowerCase() || 'processing';

    if (status === 'completed') {
      // Extract image URL from various possible response shapes
      const resultUrl =
        taskData.imageUrl ||
        taskData.image_url ||
        taskData.images?.[0]?.url ||
        taskData.images?.[0] ||
        taskData.output?.[0]?.url ||
        taskData.output?.[0] ||
        taskData.url;

      if (!resultUrl) {
        console.error('No image URL in completed result:', JSON.stringify(taskData).slice(0, 500));
        return res.status(200).json({ status: 'processing' });
      }

      return res.status(200).json({ status: 'completed', resultUrl });
    }

    if (status === 'failed') {
      return res.status(200).json({
        status: 'failed',
        error: taskData.error || taskData.msg || 'Generation failed',
      });
    }

    return res.status(200).json({ status: 'processing' });
  } catch (err) {
    console.error('Status handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
