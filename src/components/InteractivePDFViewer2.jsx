import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'

// 统一 worker
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf-worker/pdf.worker.min.js'

// 工具函数
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

// 计算 Otsu 二值阈值（0-255）
function otsuThreshold(hist, total) {
  let sum = 0
  for (let t = 0; t < 256; t++) sum += t * hist[t]
  let sumB = 0
  let wB = 0
  let wF = 0
  let varMax = 0
  let threshold = 127
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (wB === 0) continue
    wF = total - wB
    if (wF === 0) break
    sumB += t * hist[t]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) * (mB - mF)
    if (between > varMax) { varMax = between; threshold = t }
  }
  return threshold
}

// 把 canvas 像素转灰度（0-255），同时计算“与白色的差值”（Ink 强度）
function buildInkMaskFromCanvas(ctx, w, h, sampleStep = 1) {
  const img = ctx.getImageData(0, 0, w, h)
  const data = img.data
  const len = w * h
  const ink = new Uint8ClampedArray(len)
  const hist = new Uint32Array(256)
  // 使用“白色差值”= 255 - 亮度
  for (let y = 0; y < h; y += sampleStep) {
    for (let x = 0; x < w; x += sampleStep) {
      const i = (y * w + x) * 4
      const a = data[i + 3]
      if (a === 0) { ink[y * w + x] = 0; continue }
      const r = data[i], g = data[i + 1], b = data[i + 2]
      // ITU-R BT.601 luma
      const Y = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
      const v = 255 - Y
      ink[y * w + x] = v
      hist[v]++
    }
  }
  // Otsu 求阈值，限制在较保守区间
  const thr = clamp(otsuThreshold(hist, len), 16, 220)
  return { ink, thr }
}

// 生成 TextMask：将 textLayer 的 span 的 CSS 位置映射到 offscreen canvas
// 将 TextLayer 的文字区域在“同一张画布”上擦除，避免坐标失配
async function eraseTextOnWorkCanvas(baseCanvas, textLayer, padCss = 3) {
  if (!baseCanvas || !textLayer) return baseCanvas
  const work = document.createElement('canvas')
  work.width = baseCanvas.width
  work.height = baseCanvas.height
  const wctx = work.getContext('2d')
  // 复制整页
  wctx.drawImage(baseCanvas, 0, 0)

  // 等待 TextLayer 基本渲染完成
  const waitForText = async () => {
    const start = performance.now()
    let lastCount = -1
    while (performance.now() - start < 1200) {
      const spans = textLayer.querySelectorAll('span')
      if (spans.length > 0 && spans.length === lastCount) break
      lastCount = spans.length
      await new Promise(r => setTimeout(r, 50))
    }
  }
  await waitForText()

  const canvasRect = baseCanvas.getBoundingClientRect()
  const scaleX = baseCanvas.width / canvasRect.width
  const scaleY = baseCanvas.height / canvasRect.height
  const padX = padCss * scaleX
  const padY = padCss * scaleY

  // 在同一张画布上 destination-out 擦除文字矩形
  const ctx = wctx
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = 'rgba(0,0,0,1)'
  // 轻微模糊，吃掉抗锯齿边缘
  ctx.filter = 'blur(0.7px)'
  const spans = Array.from(textLayer.querySelectorAll('span'))
  spans.forEach(sp => {
    const r = sp.getBoundingClientRect()
    const x = (r.left - canvasRect.left) * scaleX
    const y = (r.top - canvasRect.top) * scaleY
    const w = r.width * scaleX
    const h = r.height * scaleY
    // 用浮点坐标绘制，避免向下取整造成右侧/下侧漏 1px
    ctx.fillRect(x - padX, y - padY, w + padX * 2, h + padY * 2)
  })
  ctx.filter = 'none'
  ctx.restore()
  return work
}

// 从 InkMask 与 TextMask 构建 ImageMask，并做连通域，返回 bbox（CSS 像素）
function detectImageRegions({ canvas, textLayer, minSizeCss = 12, dprScale }) {
  const cssW = canvas.clientWidth || canvas.width
  const cssH = canvas.clientHeight || canvas.height
  const scale = dprScale || (canvas.width / cssW)

  // 更稳的同画布相减：复制一份 canvas，然后把 TextLayer 的 span 在其上 destination-out 擦除
  // 注意：调用方已等待 onRenderSuccess，仍可能需要等待 textLayer 完全渲染，eraseTextOnWorkCanvas 内部会轮询
  // 这里同步调用，但内部使用了微等待（不阻塞 UI 太久）
  // 为简化，这里使用 then 模式以兼容非 async 调用
  // 由于 detectImageRegions 在同步流程中调用，此处不 await；上层 onRenderSuccess 已是 UI 事件，允许微等待

  // 由于我们不能在纯函数里 await，改为在 caller 中已确保 textLayer 基本就绪
  const workCanvasRef = { current: null }
  // eslint-disable-next-line no-console
  // 直接同步创建副本，不擦除文字，随后由 caller 替换（为兼容老浏览器）。
  const tmp = document.createElement('canvas')
  tmp.width = canvas.width; tmp.height = canvas.height
  tmp.getContext('2d').drawImage(canvas, 0, 0)
  workCanvasRef.current = tmp

  // 由于本文件为纯函数，实际擦除已在 handlePageRender 中完成（传入的 canvas 已作为 base）。
  // 如果未来需要在此处完成擦除，可将本函数改为 async 并传入 awaitEraseWorkCanvas。

  const { ink, thr } = buildInkMaskFromCanvas(workCanvasRef.current.getContext('2d'), workCanvasRef.current.width, workCanvasRef.current.height)

  const bin = new Uint8Array(workCanvasRef.current.width * workCanvasRef.current.height)
  for (let i = 0; i < bin.length; i++) {
    bin[i] = ink[i] > thr ? 1 : 0
  }

  // 下采样加速（2x）
  const sx = 2, sy = 2
  const dw = Math.floor(workCanvasRef.current.width / sx)
  const dh = Math.floor(workCanvasRef.current.height / sy)
  const small = new Uint8Array(dw * dh)
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      // 2x2 block OR
      const i0 = (y * sy) * workCanvasRef.current.width + (x * sx)
      const v = bin[i0] | bin[i0 + 1] | bin[i0 + workCanvasRef.current.width] | bin[i0 + workCanvasRef.current.width + 1]
      small[y * dw + x] = v
    }
  }

  // 3×3 开运算（先腐蚀后膨胀），去掉细小残留（文本/网格线）
  const erode = (src, w, h) => {
    const out = new Uint8Array(w * h)
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        let ok = 1
        for (let dy = -1; dy <= 1 && ok; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!src[(y + dy) * w + (x + dx)]) { ok = 0; break }
          }
        }
        out[y * w + x] = ok
      }
    }
    return out
  }
  const dilate = (src, w, h) => {
    const out = new Uint8Array(w * h)
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        let any = 0
        for (let dy = -1; dy <= 1 && !any; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (src[(y + dy) * w + (x + dx)]) { any = 1; break }
          }
        }
        out[y * w + x] = any
      }
    }
    return out
  }
  const smallOpened = dilate(erode(small, dw, dh), dw, dh)

  // 连通域（8 邻域）
  const visited = new Uint8Array(dw * dh)
  const regions = []
  const qx = new Int32Array(dw * dh)
  const qy = new Int32Array(dw * dh)
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const idx = y * dw + x
      if (!smallOpened[idx] || visited[idx]) continue
      let head = 0, tail = 0
      qx[tail] = x; qy[tail] = y; tail++
      visited[idx] = 1
      let minX = x, minY = y, maxX = x, maxY = y, count = 0
      while (head < tail) {
        const cx = qx[head], cy = qy[head]; head++
        count++
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue
            const nx = cx + dx, ny = cy + dy
            if (nx < 0 || ny < 0 || nx >= dw || ny >= dh) continue
            const nidx = ny * dw + nx
            if (!smallOpened[nidx] || visited[nidx]) continue
            visited[nidx] = 1
            qx[tail] = nx; qy[tail] = ny; tail++
            if (nx < minX) minX = nx
            if (ny < minY) minY = ny
            if (nx > maxX) maxX = nx
            if (ny > maxY) maxY = ny
          }
        }
      }
      // 过滤太小/太细
      const bw = (maxX - minX + 1) * sx
      const bh = (maxY - minY + 1) * sy
      if (bw < 8 || bh < 8) continue
      const cssX = minX * sx / scale
      const cssY = minY * sy / scale
      const cssW2 = bw / scale
      const cssH2 = bh / scale
      if (cssW2 < minSizeCss || cssH2 < minSizeCss) continue
      // 极端细长排除
      const ar = cssW2 / cssH2
      if (ar > 12 || ar < 1 / 12) continue
      regions.push({ x: Math.round(cssX), y: Math.round(cssY), width: Math.round(cssW2), height: Math.round(cssH2) })
    }
  }
  return regions
}

const InteractivePDFViewer2 = ({ file }) => {
  const [pdfDoc, setPdfDoc] = useState(null)
  const [numPages, setNumPages] = useState(0)
  const [pageNumber, setPageNumber] = useState(1)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [regionsByPage, setRegionsByPage] = useState({})
  const [showDebug, setShowDebug] = useState(true)

  const pageWrapperRef = useRef(null)
  const [scale, setScale] = useState(1)

  const documentOptions = useMemo(() => ({
    disableFontFace: false,
    useSystemFonts: true,
    verbosity: 0,
    enableXfa: true
  }), [])

  const onDocumentLoadSuccess = (pdf) => {
    setPdfDoc(pdf)
    setNumPages(pdf?.numPages || 0)
    setLoading(false)
  }
  const onDocumentLoadError = (e) => { setError(e?.message || '加载失败'); setLoading(false) }

  // 页面渲染成功后，运行 2.0 的图片检测
  const handlePageRender = async (page) => {
    try {
      const container = pageWrapperRef.current
      if (!container) return
      const canvas = container.querySelector('canvas')
      const textLayer = container.querySelector('.react-pdf__Page__textContent')
      if (!canvas) return
      // 统一在同画布上擦除文字，避免坐标/DPR问题
      const work = await eraseTextOnWorkCanvas(canvas, textLayer, 3)
      const canvasRect = canvas.getBoundingClientRect()
      const dprScale = canvas.width / (canvasRect.width || canvas.width)
      // 用 work 替代 canvas 进行检测
      const regions = detectImageRegions({ canvas: work, textLayer, minSizeCss: 14, dprScale })

      // 行级合并（横向拉通一行），得到更直观的“行块”
      const pageCssWidth = canvasRect.width || (canvas.width / dprScale)
      const mergeRows = (regs, pageW) => {
        if (!regs || regs.length === 0) return []
        const rs = regs.map(r => ({ ...r }))
        const median = arr => { const s=[...arr].sort((a,b)=>a-b); const m=Math.floor(s.length/2); return s.length? (s.length%2?s[m]:(s[m-1]+s[m])/2):0 }
        const hMed = median(rs.map(r => r.height)) || 20
        const bandTol = Math.max(14, hMed * 0.6)
        // 按 y 聚类为行
        const sorted = rs.map(r=>({ ...r, cy: r.y + r.height/2 })).sort((a,b)=>a.cy-b.cy)
        const rows = []
        let cur = []
        sorted.forEach(it => {
          if (cur.length === 0) { cur = [it]; return }
          const avg = cur.reduce((s,i)=>s+i.cy,0)/cur.length
          if (Math.abs(it.cy - avg) <= bandTol) cur.push(it)
          else { rows.push(cur); cur = [it] }
        })
        if (cur.length) rows.push(cur)
        // 行内按 x 合并；遇到列间大间隙先断开
        const columnGap = pageW * 0.12
        const joinGap = Math.max(10, hMed * 0.8)
        const segments = []
        rows.forEach(items => {
          const xs = items.sort((a,b)=>a.x-b.x)
          let seg = null
          xs.forEach(r => {
            if (!seg) { seg = { minX: r.x, minY: r.y, maxX: r.x + r.width, maxY: r.y + r.height } }
            else {
              const gap = r.x - seg.maxX
              const vOverlap = Math.max(0, Math.min(seg.maxY, r.y + r.height) - Math.max(seg.minY, r.y))
              const minH = Math.min(seg.maxY - seg.minY, r.height)
              const overlapRatio = minH > 0 ? vOverlap / minH : 0
              if (gap > columnGap || overlapRatio < 0.4) {
                segments.push(seg)
                seg = { minX: r.x, minY: r.y, maxX: r.x + r.width, maxY: r.y + r.height }
              } else {
                if (gap > joinGap) seg.maxX = r.x + r.width
                else seg.maxX = Math.max(seg.maxX, r.x + r.width)
                seg.minY = Math.min(seg.minY, r.y)
                seg.maxY = Math.max(seg.maxY, r.y + r.height)
              }
            }
          })
          if (seg) segments.push(seg)
        })
        const results = segments.map(s => ({
          x: Math.round(s.minX),
          y: Math.round(s.minY),
          width: Math.round(s.maxX - s.minX),
          height: Math.round(s.maxY - s.minY)
        })).filter(r => (r.width >= Math.max(180, pageW * 0.3) || (r.width / Math.max(1, r.height) >= 2.4)))
        return results
      }

      const mergedRows = mergeRows(regions, pageCssWidth)
      let finalRegions = mergedRows.length >= 2 ? mergedRows : regions

      // 小面积/细长块过滤 + 小块“字符级重扣”
      const textRects = (() => {
        const spans = Array.from(textLayer?.querySelectorAll('span') || [])
        return spans.map(sp => {
          const r = sp.getBoundingClientRect()
          return {
            x: r.left - canvasRect.left,
            y: r.top - canvasRect.top,
            width: r.width,
            height: r.height
          }
        })
      })()
      const pageCssHeight = canvasRect.height || (canvas.height / dprScale)
      const pageArea = Math.max(1, pageCssWidth * pageCssHeight)
      const minArea = Math.max(900, pageArea * 0.001) // 0.1% 页面积或 900px^2
      const smallReCutArea = pageArea * 0.006 // 0.6% 页面积以内的小块启用更强重扣
      const overlapArea = (a, b) => {
        const x1 = Math.max(a.x, b.x)
        const y1 = Math.max(a.y, b.y)
        const x2 = Math.min(a.x + a.width, b.x + b.width)
        const y2 = Math.min(a.y + a.height, b.y + b.height)
        return Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
      }
      finalRegions = finalRegions.filter(r => {
        const area = r.width * r.height
        // 1) 小面积直接过滤
        if (area < minArea) return false
        // 2) 极端细长
        const ar = r.width / Math.max(1, r.height)
        if (ar > 14 || ar < 1 / 14) return false
        // 3) 小块字符级重扣：与文字重叠比高则剔除
        if (area <= smallReCutArea) {
          let cover = 0
          for (let i = 0; i < textRects.length; i++) {
            const t = textRects[i]
            // 粗过滤：快速排除远离的文字
            if (t.x > r.x + r.width || t.x + t.width < r.x || t.y > r.y + r.height || t.y + t.height < r.y) continue
            cover += overlapArea(r, t)
            if (cover / area > 0.35) return false
          }
        }
        return true
      })

      // 纵向合并：将同一列上下相邻、水平重叠高的行块合并为“列块/整块”
      const mergeColumns = (regs) => {
        if (!regs || regs.length <= 1) return regs
        let cur = regs.map(r => ({ ...r }))
        const canMerge = (a, b) => {
          const ax2 = a.x + a.width, ay2 = a.y + a.height
          const bx2 = b.x + b.width, by2 = b.y + b.height
          const overlapX = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x))
          const minW = Math.min(a.width, b.width)
          const hOverlap = minW > 0 ? (overlapX / minW) : 0
          const gapY = Math.max(0, Math.max(a.y, b.y) - Math.min(ay2, by2))
          const minH = Math.min(a.height, b.height)
          return hOverlap >= 0.65 && gapY <= Math.max(12, minH * 0.35)
        }
        const unite = (a, b) => ({
          x: Math.min(a.x, b.x),
          y: Math.min(a.y, b.y),
          width: Math.max(a.x + a.width, b.x + b.width) - Math.min(a.x, b.x),
          height: Math.max(a.y + a.height, b.y + b.height) - Math.min(a.y, b.y)
        })
        for (let it = 0; it < 3; it++) {
          const used = new Array(cur.length).fill(false)
          const next = []
          for (let i = 0; i < cur.length; i++) {
            if (used[i]) continue
            let acc = cur[i]
            for (let j = i + 1; j < cur.length; j++) {
              if (used[j]) continue
              if (canMerge(acc, cur[j])) { acc = unite(acc, cur[j]); used[j] = true }
            }
            next.push(acc)
          }
          if (next.length === cur.length) { cur = next; break }
          cur = next
        }
        return cur
      }
      finalRegions = mergeColumns(finalRegions)

      setRegionsByPage(prev => ({ ...prev, [pageNumber]: finalRegions }))
    } catch (e) {
      console.warn('2.0 检测失败:', e)
    }
  }

  // 自适应缩放
  const onPageLoad = (page) => {
    const viewport = page.getViewport({ scale: 1, useCropBox: true })
    const availableWidth = window.innerWidth - 80
    const availableHeight = window.innerHeight - 200
    // 略微缩小整体显示比例（从 1.4 降到 1.2，并降低上限）
    const s = Math.min(1.4, Math.max(0.5, Math.min(availableWidth / viewport.width, availableHeight / viewport.height) * 1.2))
    setScale(s)
  }

  return (
    <div style={styles.container}>
      {!file && <div style={styles.noFile}>请选择 PDF 文件</div>}
      {error && <div style={styles.error}>{String(error)}</div>}

      {/* 控件区（照搬 1.0 风格） */}
      <div style={styles.controls}>
        <button style={styles.button} onClick={() => setPageNumber(p => Math.max(1, p - 1))}>上一页</button>
        <span style={styles.pageInfo}>第</span>
        <input
          style={styles.pageInput}
          value={pageNumber}
          onChange={e => {
            const v = parseInt(e.target.value || '1', 10)
            if (!Number.isNaN(v)) setPageNumber(clamp(v, 1, numPages || 1))
          }}
        />
        <span style={styles.pageInfo}>/ {numPages || '?'}</span>
        <button style={styles.button} onClick={() => setPageNumber(p => Math.min(numPages, p + 1))}>下一页</button>
        <button style={{ ...styles.button, backgroundColor: '#6c757d' }} onClick={() => setShowDebug(s => !s)}>{showDebug ? '隐藏边框' : '显示边框'}</button>
      </div>

      {/* 状态栏 */}
      <div style={styles.statusBar}>
        <span>检测到图片: {(regionsByPage[pageNumber] || []).length} 个</span>
        <span>缩放: {scale.toFixed(2)}x</span>
      </div>

      {/* 可滚动页面容器 */}
      <div style={{
        padding: '20px', margin: '0 auto', maxWidth: '100%', boxSizing: 'border-box',
        maxHeight: 'calc(100vh - 200px)', overflow: 'auto'
      }}>
        <div style={styles.pageContainer}>
          <div ref={pageWrapperRef} style={styles.pageWrapper}>
            <Document file={file} onLoadSuccess={onDocumentLoadSuccess} onLoadError={onDocumentLoadError} options={documentOptions}>
              <Page
                pageNumber={pageNumber}
                scale={scale}
                renderTextLayer
                renderAnnotationLayer
                useCropBox
                onLoadSuccess={onPageLoad}
                onRenderSuccess={handlePageRender}
                className="interactive-page"
              />
            </Document>

            {/* 2.0 检测到的图片区域 */}
            {showDebug && (regionsByPage[pageNumber] || []).map((r, idx) => (
              <div key={`img20_${idx}`} style={{
                position: 'absolute',
                left: r.x, top: r.y, width: r.width, height: r.height,
                border: '3px solid #0d6efd',
                background: 'rgba(13,110,253,0.08)',
                pointerEvents: 'none', zIndex: 15,
                boxShadow: '0 2px 8px rgba(13,110,253,0.15)'
              }} title={`img20_${idx+1}`} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default InteractivePDFViewer2

// 选自 1.0 的 UI 风格（精简版）
const styles = {
  container: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 20,
    maxWidth: '100%', position: 'relative', boxSizing: 'border-box'
  },
  noFile: {
    padding: '60px 20px', textAlign: 'center', color: '#666', fontSize: 16,
    backgroundColor: '#f8f9fa', borderRadius: 8, border: '2px dashed #dee2e6'
  },
  error: { padding: 20, background: '#f8d7da', color: '#721c24', borderRadius: 6, margin: '20px 0' },
  controls: {
    margin: '16px 0', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
    transform: 'scale(0.85)', transformOrigin: 'top center'
  },
  button: {
    padding: '8px 16px', backgroundColor: '#0d6efd', color: '#fff', border: 'none', borderRadius: 6,
    cursor: 'pointer', fontSize: 14
  },
  pageInfo: { margin: '0 6px', fontSize: 16, fontWeight: 500 },
  pageInput: { width: 60, padding: 5, textAlign: 'center', border: '1px solid #ccc', borderRadius: 4, margin: '0 5px' },
  statusBar: { display: 'flex', gap: 20, marginBottom: 10, fontSize: 14, color: '#666' },
  pageContainer: {
    position: 'relative', border: 'none', borderRadius: 0, overflow: 'visible', boxShadow: 'none', userSelect: 'text',
    display: 'inline-block', margin: '0 auto'
  },
  pageWrapper: { position: 'relative' }
}
