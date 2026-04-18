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

    // Actual API response format (verified):
    // Success: { code: 200, data: { taskId, successFlag: 1, response: { resultImageUrl: "..." } } }
    // Failed:  { code: 200, data: { successFlag: 0, errorMessage: "..." } }
    // Processing: code !== 200 or response missing

    const code = result.code;
    const taskData = result.data || {};
    const responseObj = taskData.response || {};
    const info = taskData.info || {};

    // Primary path: data.response.resultImageUrl (actual API shape)
    if (code === 200 && taskData.successFlag === 1 && responseObj.resultImageUrl) {
      return res.status(200).json({
        status: 'completed',
        resultUrl: responseObj.resultImageUrl,
      });
    }

    // Fallback: data.info.resultImageUrl (per docs)
    if (code === 200 && info.resultImageUrl) {
      return res.status(200).json({
        status: 'completed',
        resultUrl: info.resultImageUrl,
      });
    }

    // Explicit failure — only if there's an actual error message/code
    // successFlag: 0 just means "not completed yet", not necessarily failed
    if (taskData.errorMessage || taskData.errorCode) {
      return res.status(200).json({
        status: 'failed',
        error: taskData.errorMessage || 'Generation failed',
      });
    }

    if (code === 400 || code === 500 || code === 501) {
      return res.status(200).json({
        status: 'failed',
        error: result.msg || 'Generation failed',
      });
    }

    // Also check legacy/alternative response shapes just in case
    const status = taskData.status?.toLowerCase();
    if (status === 'completed') {
      const resultUrl =
        taskData.result_urls?.[0] ||
        taskData.imageUrl ||
        taskData.image_url ||
        taskData.images?.[0]?.url ||
        taskData.images?.[0] ||
        taskData.output?.[0]?.url ||
        taskData.output?.[0] ||
        taskData.url ||
        info.resultImageUrl;

      if (resultUrl && typeof resultUrl === 'string') {
        return res.status(200).json({ status: 'completed', resultUrl });
      }
    }

    if (status === 'failed') {
      return res.status(200).json({
        status: 'failed',
        error: taskData.error || result.msg || 'Generation failed',
      });
    }

    return res.status(200).json({ status: 'processing' });
  } catch (err) {
    console.error('Status handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
