import express from 'express';
import cors from 'cors';

const app = express();

// CORS configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'HTTP-Referer', 'X-Title']
}));

// Parse JSON with large limit for image data
app.use(express.json({ limit: '50mb' }));

// Environment variables
const PORT = process.env.PROXY_PORT || 3001;
const OPENROUTER_API_URL = process.env.OPENROUTER_API_URL || 'https://openrouter.ai/api/v1';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// OpenRouter proxy endpoint
app.all('/api/proxy/openrouter/*', async (req, res) => {
  const targetPath = req.params[0];
  const targetUrl = `${OPENROUTER_API_URL}/${targetPath}`;

  if (!OPENROUTER_API_KEY) {
    return res.status(500).json({
      error: 'OPENROUTER_API_KEY is not configured on the server'
    });
  }

  try {
    const headers = {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    };

    // Forward optional headers from client
    if (req.headers['http-referer']) {
      headers['HTTP-Referer'] = req.headers['http-referer'];
    }
    if (req.headers['x-title']) {
      headers['X-Title'] = req.headers['x-title'];
    }

    const fetchOptions = {
      method: req.method,
      headers,
    };

    // Add body for non-GET requests
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      fetchOptions.body = JSON.stringify(req.body);
    }

    console.log(`[Proxy] ${req.method} ${targetUrl}`);

    const response = await fetch(targetUrl, fetchOptions);
    const data = await response.json();

    // Forward status code from upstream
    res.status(response.status).json(data);
  } catch (error) {
    console.error('[Proxy Error]', error);
    res.status(500).json({
      error: 'Proxy request failed',
      message: error.message
    });
  }
});

// Environment variables for OpenAI Compatible
const OPENAI_COMPAT_API_URL = process.env.OPENAI_COMPAT_API_URL || '';
const OPENAI_COMPAT_API_KEY = process.env.OPENAI_COMPAT_API_KEY || '';

// OpenAI Compatible proxy endpoint
app.all('/api/proxy/openai-compat/*', async (req, res) => {
  const targetPath = req.params[0];

  if (!OPENAI_COMPAT_API_URL) {
    return res.status(500).json({
      error: 'OPENAI_COMPAT_API_URL is not configured on the server'
    });
  }

  const targetUrl = `${OPENAI_COMPAT_API_URL.replace(/\/+$/, '')}/${targetPath}`;

  if (!OPENAI_COMPAT_API_KEY) {
    return res.status(500).json({
      error: 'OPENAI_COMPAT_API_KEY is not configured on the server'
    });
  }

  try {
    const headers = {
      'Authorization': `Bearer ${OPENAI_COMPAT_API_KEY}`,
      'Content-Type': 'application/json',
    };

    const fetchOptions = {
      method: req.method,
      headers,
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      fetchOptions.body = JSON.stringify(req.body);
    }

    console.log(`[Proxy] ${req.method} ${targetUrl}`);

    const response = await fetch(targetUrl, fetchOptions);
    const data = await response.json();

    res.status(response.status).json(data);
  } catch (error) {
    console.error('[Proxy Error]', error);
    res.status(500).json({
      error: 'Proxy request failed',
      message: error.message
    });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Proxy Server] Running on port ${PORT}`);
  console.log(`[Proxy Server] OpenRouter API URL: ${OPENROUTER_API_URL}`);
  console.log(`[Proxy Server] OpenRouter API Key: ${OPENROUTER_API_KEY ? '***configured***' : '(not set)'}`);
  console.log(`[Proxy Server] OpenAI Compat API URL: ${OPENAI_COMPAT_API_URL || '(not set)'}`);
  console.log(`[Proxy Server] OpenAI Compat API Key: ${OPENAI_COMPAT_API_KEY ? '***configured***' : '(not set)'}`);
});
