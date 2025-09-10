// Simple Express backend for PP-Structure integration
// - POST /api/pp-parse : accept PDF upload, run external parser (if configured), return JSON
// - GET  /api/pp-parse/:id.json : return stored JSON by job id
// Configure external command via env PP_STRUCTURE_CMD, e.g.:
//   PP_STRUCTURE_CMD="python server/pp_structure_runner.py" npm run server

import express from 'express'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'
import cors from 'cors'
import crypto from 'crypto'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
app.use(cors())
app.use(express.json({ limit: '25mb' }))

const uploadDir = path.join(__dirname, 'uploads')
const dataDir = path.join(__dirname, 'data')
fs.mkdirSync(uploadDir, { recursive: true })
fs.mkdirSync(dataDir, { recursive: true })

const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, uploadDir) },
  filename: function (req, file, cb) {
    const ts = Date.now()
    const safe = file.originalname.replace(/[^A-Za-z0-9_.-]+/g, '_')
    cb(null, `${ts}_${safe}`)
  }
})
const upload = multer({ storage })

const genId = () => crypto.randomBytes(8).toString('hex')

// 简易内存状态：记录最后一条进度、是否仍在运行等
const jobStatus = new Map()

function updateJob(id, patch) {
  const prev = jobStatus.get(id) || {}
  const next = { ...prev, ...patch, ts: Date.now() }
  jobStatus.set(id, next)
  return next
}

app.get('/api/health', (_req, res) => res.json({ ok: true }))

  // 解析 Python 解释器可执行文件
function resolvePythonBin() {
  const candidates = []
  if (process.env.PP_PY_BIN && process.env.PP_PY_BIN.trim()) {
    candidates.push(process.env.PP_PY_BIN.trim())
  }
  // 固定绝对路径（按你最新截图首选此解释器）
  //candidates.push("E:\\\\conda_envs\\\\pytorch_env\\\\python.exe")
  // 兼容正斜杠写法
  //candidates.push('E:/conda_envs/pytorch_env/python.exe')
  // 历史候选：旧 anaco 解释器（保留以便 fallback）
  candidates.push('E:\\anaco\\python.exe')
  candidates.push('E:/anaco/python.exe')
  // PATH 中的命令名
  candidates.push('py', 'python', 'python3')

  for (const c of candidates) {
    try {
      // 绝对路径检查；命令名交给 PATH
      if (c.includes(':') || c.startsWith('/') || c.startsWith('\\\\')) {
        if (fs.existsSync(c)) return c
      } else {
        return c
      }
    } catch (_) { /* ignore */ }
  }
  return 'python'
}

// 解析命令构建：优先环境变量，其次使用内置默认命令
function buildParseCommand(pdfPath, outPath) {
  const envCmd = process.env.PP_STRUCTURE_CMD && process.env.PP_STRUCTURE_CMD.trim()
  if (envCmd) {
    // 简易 token 化，支持引号
    const tokens = envCmd.match(/(?:[^\s"']+|"(?:\\.|[^"])*"|'(?:\\.|[^'])*')+/g) || []
    const unquote = (s) => s.replace(/^"|"$/g, '').replace(/^'|'$/g, '')
    const parts = tokens.map(unquote)
    const bin = parts[0]
    const baseArgs = parts.slice(1)
    // 为诊断追加 debug 目录
    const debugDir = path.join(dataDir, path.basename(outPath, '.json') + '_debug')
    fs.mkdirSync(debugDir, { recursive: true })
    const args = [...baseArgs, '--input', pdfPath, '--output', outPath, '--debug-dir', debugDir]
    const useShell = false
    return { bin, args, shell: useShell, info: `env:${envCmd}` }
  }
  // 默认命令：无需配置环境变量
  const bin = resolvePythonBin()
  // 使用绝对路径，避免 cwd 变化导致找不到脚本
  const scriptPath = path.join(__dirname, 'pp_structure_runner.py')
  const debugDir = path.join(dataDir, path.basename(outPath, '.json') + '_debug')
  fs.mkdirSync(debugDir, { recursive: true })
  const args = [scriptPath, '--input', pdfPath, '--output', outPath, '--debug-dir', debugDir]
  return { bin, args, shell: false, info: `default:${bin} ${scriptPath} debug:${debugDir}` }
}

app.post('/api/pp-parse', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'no_file' })
    const pdfPath = req.file.path
    const jobId = genId()
    const outPath = path.join(dataDir, `${jobId}.json`)

    const { bin, args, shell, info } = buildParseCommand(pdfPath, outPath)
    console.log(`[server] run parser -> ${info}`, bin, args.join(' '))
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], shell })
    updateJob(jobId, { status: 'spawned', running: true, stderr: '', stdout: '' })
    let stdout = ''
    let stderr = ''
    child.on('error', (err) => {
      console.error('[server] spawn error', err)
      updateJob(jobId, { status: 'spawn_error', detail: String(err), running: false })
      return res.status(500).json({ error: 'spawn_error', detail: String(err), hint: '请确认已安装 Python，并可通过命令行调用。必要时设置环境变量 PP_PY_BIN=py 或 python 的绝对路径。', jobId })
    })
    const sanitize = (s) => (s ? s.toString().replace(/[^\x00-\x7F]/g, '?') : '')
    child.stdout.on('data', d => { const s = sanitize(d); stdout += s; updateJob(jobId, { stdout: (updateJob(jobId, {}).stdout || '') + s }) })
    child.stderr.on('data', d => {
      const s = sanitize(d)
      stderr += s
      updateJob(jobId, { stderr: (updateJob(jobId, {}).stderr || '') + s })
      // 捕获 Python 侧的进度行
      const lines = s.split(/\r?\n/).filter(Boolean)
      for (const line of lines) {
        if (line.startsWith('[pp-progress] ')) {
          const msg = line.replace('[pp-progress] ', '')
          updateJob(jobId, { status: msg, running: true })
          // 同时打印到后端控制台便于观察
          console.log(`[job:${jobId}] ${msg}`)
        }
      }
    })
    child.on('close', (code) => {
      try {
        const done = { running: false, exitCode: code }
        if (fs.existsSync(outPath)) {
          const jsonStr = fs.readFileSync(outPath, 'utf-8')
          const json = jsonStr ? JSON.parse(jsonStr) : {}
          updateJob(jobId, { ...done, status: 'completed' })
          return res.json({ jobId, blocksByPage: json })
        }
        if (code === 0 && stdout.trim().startsWith('{')) {
          const json = JSON.parse(stdout)
          fs.writeFileSync(outPath, JSON.stringify(json))
          updateJob(jobId, { ...done, status: 'completed' })
          return res.json({ jobId, blocksByPage: json })
        }
        console.error('[server] PP parser failed', { code, stderr: stderr?.slice(0, 2000) })
        updateJob(jobId, { ...done, status: 'failed', detail: (stderr || `exit ${code}`) })
        return res.status(500).json({ error: 'parse_failed', detail: (stderr || `exit ${code}`), jobId })
      } catch (e) {
        console.error('[server] PP parse error', e)
        updateJob(jobId, { status: 'parse_error', running: false, detail: String(e) })
        return res.status(500).json({ error: 'parse_error', detail: String(e), jobId })
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'server_error', detail: String(e) })
  }
})

// 异步版本：立即返回 jobId，前端可轮询 /api/jobs/:id 获取进度
app.post('/api/pp-parse-async', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'no_file' })
    const pdfPath = req.file.path
    const jobId = genId()
    const outPath = path.join(dataDir, `${jobId}.json`)

    const { bin, args, shell, info } = buildParseCommand(pdfPath, outPath)
    console.log(`[server] run parser (async) -> ${info}`, bin, args.join(' '))
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], shell })
    updateJob(jobId, { status: 'spawned', running: true, stderr: '', stdout: '' })

    const sanitize = (s) => (s ? s.toString().replace(/[^\x00-\x7F]/g, '?') : '')
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', d => { const s = sanitize(d); stdout += s; updateJob(jobId, { stdout: (updateJob(jobId, {}).stdout || '') + s }) })
    child.stderr.on('data', d => {
      const s = sanitize(d)
      stderr += s
      updateJob(jobId, { stderr: (updateJob(jobId, {}).stderr || '') + s })
      const lines = s.split(/\r?\n/).filter(Boolean)
      for (const line of lines) {
        if (line.startsWith('[pp-progress] ')) {
          const msg = line.replace('[pp-progress] ', '')
          updateJob(jobId, { status: msg, running: true })
          console.log(`[job:${jobId}] ${msg}`)
        }
      }
    })
    child.on('close', (code) => {
      try {
        const done = { running: false, exitCode: code }
        if (fs.existsSync(outPath)) {
          updateJob(jobId, { ...done, status: 'completed' })
          return
        }
        if (code === 0 && stdout.trim().startsWith('{')) {
          fs.writeFileSync(outPath, stdout)
          updateJob(jobId, { ...done, status: 'completed' })
          return
        }
        updateJob(jobId, { ...done, status: 'failed', detail: (stderr || `exit ${code}`) })
      } catch (e) {
        updateJob(jobId, { status: 'parse_error', running: false, detail: String(e) })
      }
    })

    return res.status(202).json({ jobId })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'server_error', detail: String(e) })
  }
})

app.get('/api/pp-parse/:id.json', (req, res) => {
  const id = (req.params.id || '').replace(/[^A-Za-z0-9]/g, '')
  const p = path.join(dataDir, `${id}.json`)
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'not_found' })
  res.setHeader('Content-Type', 'application/json')
  fs.createReadStream(p).pipe(res)
})

// 轮询查询作业状态（便于前端显示当前阶段/是否下载模型等）
app.get('/api/jobs/:id', (req, res) => {
  const id = (req.params.id || '').replace(/[^A-Za-z0-9]/g, '')
  const st = jobStatus.get(id)
  if (!st) return res.status(404).json({ error: 'not_found' })
  res.json({ jobId: id, ...st })
})

// 简单日志获取（截断到 4000 字符）
app.get('/api/jobs/:id/log', (req, res) => {
  const id = (req.params.id || '').replace(/[^A-Za-z0-9]/g, '')
  const st = jobStatus.get(id)
  if (!st) return res.status(404).json({ error: 'not_found' })
  const clip = (s) => (s || '').slice(-4000)
  res.json({ jobId: id, status: st.status, running: st.running, exitCode: st.exitCode, stdout: clip(st.stdout), stderr: clip(st.stderr), ts: st.ts })
})

const port = process.env.PORT || 8787
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] listening on http://localhost:${port}`)
})
