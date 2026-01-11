import express from 'express';
import cors from 'cors';
import crypto from 'crypto';

const app = express();

// CORS configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'HTTP-Referer', 'X-Title', 'X-Metadata']
}));

// Parse JSON with large limit for image data
app.use(express.json({ limit: '50mb' }));

// Raw body parser for file uploads
app.use('/api/storage/upload', express.raw({ type: '*/*', limit: '50mb' }));

// Environment variables
const PORT = process.env.PROXY_PORT || 3001;

// AI Service Tokens
const HF_TOKEN = process.env.HF_TOKEN || '';
const GITEE_TOKEN = process.env.GITEE_TOKEN || '';
const MS_TOKEN = process.env.MS_TOKEN || '';
const OPENROUTER_API_URL = process.env.OPENROUTER_API_URL || 'https://openrouter.ai/api/v1';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENAI_COMPAT_API_URL = process.env.OPENAI_COMPAT_API_URL || '';
const OPENAI_COMPAT_API_KEY = process.env.OPENAI_COMPAT_API_KEY || '';

// Storage Configuration
const STORAGE_TYPE = process.env.STORAGE_TYPE || 'off';
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || '';
const S3_SECRET_KEY = process.env.S3_SECRET_KEY || '';
const S3_REGION = process.env.S3_REGION || 'us-east-1';
const S3_ENDPOINT = process.env.S3_ENDPOINT || '';
const S3_BUCKET = process.env.S3_BUCKET || '';
const S3_PUBLIC_DOMAIN = process.env.S3_PUBLIC_DOMAIN || '';
const S3_PREFIX = process.env.S3_PREFIX || 'peinture/';

const WEBDAV_URL = process.env.WEBDAV_URL || '';
const WEBDAV_USER = process.env.WEBDAV_USER || '';
const WEBDAV_PASSWORD = process.env.WEBDAV_PASSWORD || '';
const WEBDAV_DIRECTORY = process.env.WEBDAV_DIRECTORY || 'peinture';

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// Configuration Query Endpoint
// ============================================
app.get('/api/config', (req, res) => {
  res.json({
    providers: {
      huggingface: !!HF_TOKEN,
      gitee: !!GITEE_TOKEN,
      modelscope: !!MS_TOKEN,
      openrouter: !!OPENROUTER_API_KEY,
      'openai-compat': !!(OPENAI_COMPAT_API_URL && OPENAI_COMPAT_API_KEY)
    },
    storage: {
      type: STORAGE_TYPE,
      configured: (STORAGE_TYPE === 's3' && !!S3_ACCESS_KEY && !!S3_SECRET_KEY && !!S3_BUCKET) ||
        (STORAGE_TYPE === 'webdav' && !!WEBDAV_URL && !!WEBDAV_USER)
    }
  });
});

// ============================================
// HuggingFace Proxy
// ============================================
app.all('/api/proxy/hf/*', async (req, res) => {
  const targetPath = req.params[0];

  if (!HF_TOKEN) {
    return res.status(500).json({ error: 'HF_TOKEN is not configured on the server' });
  }

  // Select token (support multiple tokens)
  const tokens = HF_TOKEN.split(',').map(t => t.trim()).filter(t => t);
  const token = tokens[Math.floor(Math.random() * tokens.length)];

  try {
    const targetUrl = `https://router.huggingface.co/${targetPath}`;
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': req.headers['content-type'] || 'application/json',
    };

    const fetchOptions = {
      method: req.method,
      headers,
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      fetchOptions.body = JSON.stringify(req.body);
    }

    console.log(`[Proxy HF] ${req.method} ${targetUrl}`);
    const response = await fetch(targetUrl, fetchOptions);

    // Handle binary responses (images)
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('image') || contentType.includes('octet-stream')) {
      const buffer = await response.arrayBuffer();
      res.set('Content-Type', contentType);
      res.status(response.status).send(Buffer.from(buffer));
    } else {
      const data = await response.json();
      res.status(response.status).json(data);
    }
  } catch (error) {
    console.error('[Proxy HF Error]', error);
    res.status(500).json({ error: 'Proxy request failed', message: error.message });
  }
});

// ============================================
// Gitee AI Proxy
// ============================================
app.all('/api/proxy/gitee/*', async (req, res) => {
  const targetPath = req.params[0];

  if (!GITEE_TOKEN) {
    return res.status(500).json({ error: 'GITEE_TOKEN is not configured on the server' });
  }

  const tokens = GITEE_TOKEN.split(',').map(t => t.trim()).filter(t => t);
  const token = tokens[Math.floor(Math.random() * tokens.length)];

  try {
    const targetUrl = `https://ai.gitee.com/${targetPath}`;
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': req.headers['content-type'] || 'application/json',
    };

    const fetchOptions = {
      method: req.method,
      headers,
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      fetchOptions.body = JSON.stringify(req.body);
    }

    console.log(`[Proxy Gitee] ${req.method} ${targetUrl}`);
    const response = await fetch(targetUrl, fetchOptions);

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('image') || contentType.includes('octet-stream')) {
      const buffer = await response.arrayBuffer();
      res.set('Content-Type', contentType);
      res.status(response.status).send(Buffer.from(buffer));
    } else {
      const data = await response.json();
      res.status(response.status).json(data);
    }
  } catch (error) {
    console.error('[Proxy Gitee Error]', error);
    res.status(500).json({ error: 'Proxy request failed', message: error.message });
  }
});

// ============================================
// ModelScope Proxy
// ============================================
app.all('/api/proxy/ms/*', async (req, res) => {
  const targetPath = req.params[0];

  if (!MS_TOKEN) {
    return res.status(500).json({ error: 'MS_TOKEN is not configured on the server' });
  }

  const tokens = MS_TOKEN.split(',').map(t => t.trim()).filter(t => t);
  const token = tokens[Math.floor(Math.random() * tokens.length)];

  try {
    const targetUrl = `https://dashscope.aliyuncs.com/${targetPath}`;
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': req.headers['content-type'] || 'application/json',
    };

    const fetchOptions = {
      method: req.method,
      headers,
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      fetchOptions.body = JSON.stringify(req.body);
    }

    console.log(`[Proxy MS] ${req.method} ${targetUrl}`);
    const response = await fetch(targetUrl, fetchOptions);

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('image') || contentType.includes('octet-stream')) {
      const buffer = await response.arrayBuffer();
      res.set('Content-Type', contentType);
      res.status(response.status).send(Buffer.from(buffer));
    } else {
      const data = await response.json();
      res.status(response.status).json(data);
    }
  } catch (error) {
    console.error('[Proxy MS Error]', error);
    res.status(500).json({ error: 'Proxy request failed', message: error.message });
  }
});

// ============================================
// OpenRouter Proxy
// ============================================
app.all('/api/proxy/openrouter/*', async (req, res) => {
  const targetPath = req.params[0];
  const targetUrl = `${OPENROUTER_API_URL}/${targetPath}`;

  if (!OPENROUTER_API_KEY) {
    return res.status(500).json({ error: 'OPENROUTER_API_KEY is not configured on the server' });
  }

  try {
    const headers = {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    };

    if (req.headers['http-referer']) headers['HTTP-Referer'] = req.headers['http-referer'];
    if (req.headers['x-title']) headers['X-Title'] = req.headers['x-title'];

    const fetchOptions = { method: req.method, headers };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      fetchOptions.body = JSON.stringify(req.body);
    }

    console.log(`[Proxy OpenRouter] ${req.method} ${targetUrl}`);
    const response = await fetch(targetUrl, fetchOptions);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('[Proxy OpenRouter Error]', error);
    res.status(500).json({ error: 'Proxy request failed', message: error.message });
  }
});

// ============================================
// OpenAI Compatible Proxy
// ============================================
app.all('/api/proxy/openai-compat/*', async (req, res) => {
  const targetPath = req.params[0];

  if (!OPENAI_COMPAT_API_URL) {
    return res.status(500).json({ error: 'OPENAI_COMPAT_API_URL is not configured on the server' });
  }
  if (!OPENAI_COMPAT_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_COMPAT_API_KEY is not configured on the server' });
  }

  const targetUrl = `${OPENAI_COMPAT_API_URL.replace(/\/+$/, '')}/${targetPath}`;

  try {
    const headers = {
      'Authorization': `Bearer ${OPENAI_COMPAT_API_KEY}`,
      'Content-Type': 'application/json',
    };

    const fetchOptions = { method: req.method, headers };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      fetchOptions.body = JSON.stringify(req.body);
    }

    console.log(`[Proxy OpenAI-Compat] ${req.method} ${targetUrl}`);
    const response = await fetch(targetUrl, fetchOptions);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('[Proxy OpenAI-Compat Error]', error);
    res.status(500).json({ error: 'Proxy request failed', message: error.message });
  }
});

// ============================================
// S3 Storage Proxy Helper Functions
// ============================================

function getS3SignatureKey(key, dateStamp, regionName, serviceName) {
  const kDate = crypto.createHmac('sha256', 'AWS4' + key).update(dateStamp).digest();
  const kRegion = crypto.createHmac('sha256', kDate).update(regionName).digest();
  const kService = crypto.createHmac('sha256', kRegion).update(serviceName).digest();
  const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
  return kSigning;
}

function signS3Request(method, url, headers, payload, config) {
  const parsedUrl = new URL(url);
  const host = parsedUrl.host;
  const path = parsedUrl.pathname + parsedUrl.search;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = crypto.createHash('sha256').update(payload || '').digest('hex');

  headers['host'] = host;
  headers['x-amz-date'] = amzDate;
  headers['x-amz-content-sha256'] = payloadHash;

  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers).sort().map(k => `${k}:${headers[k]}\n`).join('');

  const canonicalRequest = [method, path, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, crypto.createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');

  const signingKey = getS3SignatureKey(config.secretKey, dateStamp, config.region, 's3');
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  headers['Authorization'] = `AWS4-HMAC-SHA256 Credential=${config.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return headers;
}

// ============================================
// S3 Storage Proxy Endpoints
// ============================================

// Upload file to S3
app.post('/api/storage/upload', async (req, res) => {
  if (STORAGE_TYPE !== 's3' || !S3_ACCESS_KEY || !S3_SECRET_KEY || !S3_BUCKET) {
    return res.status(500).json({ error: 'S3 storage is not configured on the server' });
  }

  try {
    const filename = req.headers['x-filename'] || `${Date.now()}.png`;
    const contentType = req.headers['content-type'] || 'image/png';
    const metadata = req.headers['x-metadata'] ? JSON.parse(req.headers['x-metadata']) : {};

    const key = S3_PREFIX + filename;
    const endpoint = S3_ENDPOINT.replace(/\/+$/, '');
    const url = `${endpoint}/${S3_BUCKET}/${key}`;

    const headers = { 'content-type': contentType };
    const signedHeaders = signS3Request('PUT', url, headers, req.body, {
      accessKey: S3_ACCESS_KEY,
      secretKey: S3_SECRET_KEY,
      region: S3_REGION
    });

    const response = await fetch(url, {
      method: 'PUT',
      headers: signedHeaders,
      body: req.body
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`S3 upload failed: ${response.status} ${text}`);
    }

    const publicUrl = S3_PUBLIC_DOMAIN
      ? `${S3_PUBLIC_DOMAIN.replace(/\/+$/, '')}/${key}`
      : url;

    res.json({ success: true, url: publicUrl, key });
  } catch (error) {
    console.error('[S3 Upload Error]', error);
    res.status(500).json({ error: 'S3 upload failed', message: error.message });
  }
});

// List S3 files
app.get('/api/storage/list', async (req, res) => {
  if (STORAGE_TYPE !== 's3' || !S3_ACCESS_KEY || !S3_SECRET_KEY || !S3_BUCKET) {
    return res.status(500).json({ error: 'S3 storage is not configured on the server' });
  }

  try {
    const endpoint = S3_ENDPOINT.replace(/\/+$/, '');
    const url = `${endpoint}/${S3_BUCKET}?list-type=2&prefix=${encodeURIComponent(S3_PREFIX)}`;

    const headers = {};
    const signedHeaders = signS3Request('GET', url, headers, '', {
      accessKey: S3_ACCESS_KEY,
      secretKey: S3_SECRET_KEY,
      region: S3_REGION
    });

    const response = await fetch(url, { method: 'GET', headers: signedHeaders });
    if (!response.ok) throw new Error(`S3 list failed: ${response.status}`);

    const xml = await response.text();
    // Parse XML to extract file list (simplified)
    const files = [];
    const keyRegex = /<Key>([^<]+)<\/Key>/g;
    const sizeRegex = /<Size>(\d+)<\/Size>/g;
    const modifiedRegex = /<LastModified>([^<]+)<\/LastModified>/g;

    let keyMatch, sizeMatch, modifiedMatch;
    const keys = [], sizes = [], modifieds = [];
    while ((keyMatch = keyRegex.exec(xml))) keys.push(keyMatch[1]);
    while ((sizeMatch = sizeRegex.exec(xml))) sizes.push(parseInt(sizeMatch[1]));
    while ((modifiedMatch = modifiedRegex.exec(xml))) modifieds.push(modifiedMatch[1]);

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (key.endsWith('/')) continue;
      const publicUrl = S3_PUBLIC_DOMAIN
        ? `${S3_PUBLIC_DOMAIN.replace(/\/+$/, '')}/${key}`
        : `${endpoint}/${S3_BUCKET}/${key}`;
      files.push({
        key,
        url: publicUrl,
        size: sizes[i] || 0,
        lastModified: modifieds[i] || ''
      });
    }

    res.json({ files });
  } catch (error) {
    console.error('[S3 List Error]', error);
    res.status(500).json({ error: 'S3 list failed', message: error.message });
  }
});

// Delete S3 file
app.delete('/api/storage/delete', async (req, res) => {
  if (STORAGE_TYPE !== 's3' || !S3_ACCESS_KEY || !S3_SECRET_KEY || !S3_BUCKET) {
    return res.status(500).json({ error: 'S3 storage is not configured on the server' });
  }

  try {
    const { key } = req.body;
    if (!key) return res.status(400).json({ error: 'Missing key parameter' });

    const endpoint = S3_ENDPOINT.replace(/\/+$/, '');
    const url = `${endpoint}/${S3_BUCKET}/${key}`;

    const headers = {};
    const signedHeaders = signS3Request('DELETE', url, headers, '', {
      accessKey: S3_ACCESS_KEY,
      secretKey: S3_SECRET_KEY,
      region: S3_REGION
    });

    const response = await fetch(url, { method: 'DELETE', headers: signedHeaders });
    if (!response.ok && response.status !== 204) {
      throw new Error(`S3 delete failed: ${response.status}`);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[S3 Delete Error]', error);
    res.status(500).json({ error: 'S3 delete failed', message: error.message });
  }
});

// ============================================
// Start Server
// ============================================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Proxy Server] Running on port ${PORT}`);
  console.log(`[Proxy Server] --- AI Services ---`);
  console.log(`[Proxy Server] HuggingFace: ${HF_TOKEN ? '***configured***' : '(not set)'}`);
  console.log(`[Proxy Server] Gitee AI: ${GITEE_TOKEN ? '***configured***' : '(not set)'}`);
  console.log(`[Proxy Server] ModelScope: ${MS_TOKEN ? '***configured***' : '(not set)'}`);
  console.log(`[Proxy Server] OpenRouter: ${OPENROUTER_API_KEY ? '***configured***' : '(not set)'}`);
  console.log(`[Proxy Server] OpenAI Compat: ${OPENAI_COMPAT_API_KEY ? '***configured***' : '(not set)'}`);
  console.log(`[Proxy Server] --- Storage ---`);
  console.log(`[Proxy Server] Type: ${STORAGE_TYPE}`);
  if (STORAGE_TYPE === 's3') {
    console.log(`[Proxy Server] S3 Bucket: ${S3_BUCKET || '(not set)'}`);
    console.log(`[Proxy Server] S3 Endpoint: ${S3_ENDPOINT || '(not set)'}`);
  }
});
