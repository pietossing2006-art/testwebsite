import express from 'express'
import multer from 'multer'

const router = express.Router()
const FASTAPI_BASE = process.env.MANGAOCR_API_URL || 'http://127.0.0.1:9444'
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024
const JOB_ID = /^job_\d+_[a-f0-9]{8}$/
const IMAGE_TYPES = new Set(['original', 'cleaned', 'final'])

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!file.mimetype?.startsWith('image/')) return callback(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'file'))
    callback(null, true)
  },
})

async function upstream(path, options = {}) {
  try {
    return await fetch(`${FASTAPI_BASE}${path}`, options)
  } catch {
    const error = new Error('MangaOCR service is unavailable. Start the OCR backend and try again.')
    error.status = 503
    throw error
  }
}

async function sendJson(response, res) {
  const contentType = response.headers.get('content-type') || ''
  const data = contentType.includes('application/json') ? await response.json() : { detail: await response.text() }
  if (!response.ok) return res.status(response.status).json({ error: data.detail || data.error || 'MangaOCR request failed.' })
  return res.json(data)
}

function validJob(res, jobId) {
  if (JOB_ID.test(jobId)) return true
  res.status(404).json({ error: 'Job not found.' })
  return false
}

router.get('/api/mangaocr/health', async (_req, res) => {
  try {
    const response = await upstream('/health')
    return sendJson(response, res)
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message })
  }
})

router.get('/api/mangaocr/capabilities', async (_req, res) => {
  try {
    const response = await upstream('/api/capabilities')
    return sendJson(response, res)
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message })
  }
})

router.post('/api/mangaocr/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Choose an image to upload.' })
    const form = new FormData()
    form.append('file', new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname)
    return sendJson(await upstream('/api/upload', { method: 'POST', body: form }), res)
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Could not upload the image.' })
  }
})

router.post('/api/mangaocr/detect-language', async (req, res) => {
  const jobId = String(req.body?.job_id || '')
  if (!validJob(res, jobId)) return
  try {
    return sendJson(await upstream('/api/detect-language', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId }),
    }), res)
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message })
  }
})

router.post('/api/mangaocr/process', async (req, res) => {
  const {
    job_id: jobId,
    source_lang: sourceLang,
    target_lang: targetLang,
    font_style: fontStyle,
    translation_provider: translationProvider,
  } = req.body || {}
  if (!validJob(res, String(jobId || ''))) return
  try {
    return sendJson(await upstream('/api/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_id: jobId,
        source_lang: sourceLang,
        target_lang: targetLang,
        font_style: fontStyle,
        translation_provider: translationProvider,
      }),
    }), res)
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message })
  }
})

router.get('/api/mangaocr/status/:jobId', async (req, res) => {
  if (!validJob(res, req.params.jobId)) return
  try {
    return sendJson(await upstream(`/api/status/${req.params.jobId}`), res)
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message })
  }
})

router.post('/api/mangaocr/retypeset', async (req, res) => {
  if (!validJob(res, String(req.body?.job_id || ''))) return
  try {
    return sendJson(await upstream('/api/retypeset', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body),
    }), res)
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message })
  }
})

router.get('/api/mangaocr/image/:jobId/:imageType', async (req, res) => {
  const { jobId, imageType } = req.params
  if (!validJob(res, jobId) || !IMAGE_TYPES.has(imageType)) return
  try {
    const response = await upstream(`/api/image/${jobId}/${imageType}`)
    if (!response.ok) return sendJson(response, res)
    res.setHeader('Content-Type', response.headers.get('content-type') || 'image/png')
    res.setHeader('Cache-Control', 'private, no-store')
    return res.send(Buffer.from(await response.arrayBuffer()))
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message })
  }
})

router.get('/api/mangaocr/download/:jobId', async (req, res) => {
  if (!validJob(res, req.params.jobId)) return
  try {
    const response = await upstream(`/api/download/${req.params.jobId}`)
    if (!response.ok) return sendJson(response, res)
    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Content-Disposition', `attachment; filename="mangaocr-${req.params.jobId}.png"`)
    return res.send(Buffer.from(await response.arrayBuffer()))
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message })
  }
})

router.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE' ? 'Image exceeds the 25 MB upload limit.' : 'Upload one PNG, JPG, or WEBP image.'
    return res.status(400).json({ error: message })
  }
  return res.status(500).json({ error: 'MangaOCR request could not be completed.' })
})

export default router
