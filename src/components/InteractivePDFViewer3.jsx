import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'

// 使用与现有组件一致的 worker 路径
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf-worker/pdf.worker.min.js'

// 工具函数
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

// 颜色映射（按块类型）
const colorOf = (t) => {
  const s = String(t || '').toLowerCase()
  if (s.includes('table')) return { stroke: '#28a745', fill: 'rgba(40,167,69,0.18)' }
  if (s.includes('figure') || s.includes('image') || s.includes('img')) return { stroke: '#0d6efd', fill: 'rgba(13,110,253,0.16)' }
  if (s.includes('formula') || s.includes('equation') || s.includes('latex')) return { stroke: '#fd7e14', fill: 'rgba(253,126,20,0.16)' }
  if (s.includes('code')) return { stroke: '#6f42c1', fill: 'rgba(111,66,193,0.16)' }
  return { stroke: '#6c757d', fill: 'rgba(108,117,125,0.12)' }
}

// 规范化 PP-Structure V2 输出为 { [page]: Block[] }
const normalizeBlocks = (raw) => {
  if (!raw) return {}
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw
  if (Array.isArray(raw)) {
    const out = {}
    raw.forEach(b => {
      const p = Number(b.page || b.page_num || 1)
      if (!out[p]) out[p] = []
      out[p].push(b)
    })
    return out
  }
  return {}
}

// 新组件：Interactive 3.0（两层渲染 + PP 块框覆盖）
// props:
// - file: File | URL
// - ppBlocksUrl?: string  // 每页块框 JSON 的 URL（同源）
// - ppBlocksData?: object // 直接传入的块框数据 { [pageNumber]: Block[] }
// - ppCoordType?: 'image' | 'pdf' // JSON 坐标类型（默认 'image'）
// - page?: number // 初始页
// - filterTypes?: string[] // 仅渲染这些类型（缺省排除 text）
const InteractivePDFViewer3 = ({
  file,
  ppBlocksUrl,
  ppBlocksData,
  ppCoordType = 'image',
  page: initialPage = 1,
  filterTypes
}) => {
  const [pdfDoc, setPdfDoc] = useState(null)
  const [numPages, setNumPages] = useState(0)
  const [pageNumber, setPageNumber] = useState(initialPage)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [scale, setScale] = useState(1)
  const [showOverlay, setShowOverlay] = useState(true)

  const [basePageSize, setBasePageSize] = useState({}) // { [page]: {width,height} }
  const [blocksByPage, setBlocksByPage] = useState({}) // { [page]: Block[] }

  const pageWrapperRef = useRef(null)
  const overlayCanvasRef = useRef(null)

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

  // 加载/更新 PP JSON
  useEffect(() => {
    let cancelled = false
    const apply = (raw) => { if (!cancelled) setBlocksByPage(normalizeBlocks(raw)) }
    const run = async () => {
      if (!ppBlocksUrl) return
      try {
        const res = await fetch(ppBlocksUrl)
        const j = await res.json()
        apply(j)
      } catch (e) { /* eslint-disable-next-line no-console */ console.warn('加载 PP JSON 失败:', e) }
    }
    if (ppBlocksData) apply(ppBlocksData)
    else if (ppBlocksUrl) run()
    return () => { cancelled = true }
  }, [ppBlocksUrl, ppBlocksData, file])

  // 页面加载成功：自适应缩放并记录基础尺寸
  const onPageLoad = (page) => {
    const viewport = page.getViewport({ scale: 1, useCropBox: true })
    setBasePageSize(prev => ({ ...prev, [pageNumber]: { width: viewport.width, height: viewport.height } }))
    const availableWidth = window.innerWidth - 80
    const availableHeight = window.innerHeight - 200
    const s = Math.min(1.4, Math.max(0.5, Math.min(availableWidth / viewport.width, availableHeight / viewport.height) * 1.2))
    setScale(s)
  }

  // 绘制覆盖层：将 JSON 中的 bbox 投影到渲染 canvas
  const drawOverlay = () => {
    try {
      const wrapper = pageWrapperRef.current
      const overlay = overlayCanvasRef.current
      if (!wrapper || !overlay) return
      const pdfCanvas = wrapper.querySelector('canvas')
      if (!pdfCanvas) return
      const rect = pdfCanvas.getBoundingClientRect()

      // 同步 CSS 与像素尺寸
      overlay.style.position = 'absolute'
      overlay.style.left = '0px'
      overlay.style.top = '0px'
      overlay.style.width = `${Math.max(1, rect.width)}px`
      overlay.style.height = `${Math.max(1, rect.height)}px`
      overlay.style.pointerEvents = 'none'
      overlay.style.zIndex = 14

      const dpr = window.devicePixelRatio || 1
      const pixelW = Math.max(1, Math.round(rect.width * dpr))
      const pixelH = Math.max(1, Math.round(rect.height * dpr))
      if (overlay.width !== pixelW) overlay.width = pixelW
      if (overlay.height !== pixelH) overlay.height = pixelH

      const ctx = overlay.getContext('2d')
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, overlay.width, overlay.height)
      ctx.scale(dpr, dpr)

      const blocks = blocksByPage[pageNumber] || []
      if (!blocks.length) return

      const pageBase = basePageSize[pageNumber] || { width: rect.width / scale, height: rect.height / scale }

      // 推断 image 尺寸（若需要）
      let imgW = null, imgH = null
      if (ppCoordType === 'image') {
        for (const b of blocks) {
          if (Array.isArray(b.img_size) && b.img_size.length >= 2) { imgW = b.img_size[0]; imgH = b.img_size[1]; break }
          if (Array.isArray(b.page_size) && b.page_size.length >= 2) { imgW = b.page_size[0]; imgH = b.page_size[1]; break }
        }
        if (!imgW || !imgH) {
          const maxX = Math.max(...blocks.map(b => Array.isArray(b.bbox) ? (b.bbox[2] || 0) : 0), 0)
          const maxY = Math.max(...blocks.map(b => Array.isArray(b.bbox) ? (b.bbox[3] || 0) : 0), 0)
          imgW = maxX || pageBase.width
          imgH = maxY || pageBase.height
        }
      }

      const scaleX = ppCoordType === 'pdf' ? (rect.width / Math.max(1, pageBase.width)) : (rect.width / Math.max(1, imgW || rect.width))
      const scaleY = ppCoordType === 'pdf' ? (rect.height / Math.max(1, pageBase.height)) : (rect.height / Math.max(1, imgH || rect.height))

      const allowType = (t) => {
        if (Array.isArray(filterTypes) && filterTypes.length > 0) {
          return filterTypes.map(s => String(s).toLowerCase()).includes(String(t || '').toLowerCase())
        }
        const s = String(t || '').toLowerCase()
        return !(s === 'text' || s === 'paragraph' || s === 'title' || s === 'section' || s === 'header')
      }

      ctx.lineWidth = 2
      blocks.forEach((b) => {
        if (!b || !Array.isArray(b.bbox) || b.bbox.length < 4) return
        if (!allowType(b.type)) return
        const [x1, y1, x2, y2] = b.bbox
        const x = Math.round(x1 * scaleX)
        const y = Math.round(y1 * scaleY)
        const w = Math.max(1, Math.round((x2 - x1) * scaleX))
        const h = Math.max(1, Math.round((y2 - y1) * scaleY))
        const col = colorOf(b.type)
        ctx.fillStyle = col.fill
        ctx.strokeStyle = col.stroke
        ctx.beginPath()
        ctx.rect(x, y, w, h)
        ctx.fill()
        ctx.stroke()
        const label = (b.type || '').toString()
        if (label) {
          ctx.save()
          ctx.fillStyle = col.stroke
          ctx.globalAlpha = 0.9
          ctx.font = '12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Arial'
          ctx.fillText(label, x + 6, y + Math.min(h - 4, 14))
          ctx.restore()
        }
      })
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('绘制覆盖层失败:', e)
    }
  }

  // 页面渲染完成后绘制
  const onPageRender = () => { if (showOverlay) drawOverlay() }

  // 缩放/页码变化时尝试重绘
  useEffect(() => { if (showOverlay) requestAnimationFrame(drawOverlay) }, [scale, pageNumber, blocksByPage, showOverlay])

  // 窗口 resize 时重绘
  useEffect(() => {
    const handler = () => { if (showOverlay) requestAnimationFrame(drawOverlay) }
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [showOverlay])

  return (
    <div style={styles.container}>
      {!file && <div style={styles.noFile}>请选择 PDF 文件</div>}
      {error && <div style={styles.error}>{String(error)}</div>}

      {/* 控件区 */}
      <div style={styles.controls}>
        <button style={styles.button} onClick={() => setPageNumber(p => Math.max(1, p - 1))} disabled={pageNumber <= 1}>上一页</button>
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
        <button style={styles.button} onClick={() => setPageNumber(p => Math.min(numPages, p + 1))} disabled={pageNumber >= numPages}>下一页</button>
        <button style={{ ...styles.button, backgroundColor: showOverlay ? '#198754' : '#6c757d' }} onClick={() => setShowOverlay(s => !s)}>{showOverlay ? '隐藏PP覆盖' : '显示PP覆盖'}</button>
      </div>

      {/* 状态栏 */}
      <div style={styles.statusBar}>
        <span>缩放: {scale.toFixed(2)}x</span>
        <span>覆盖: {showOverlay ? '开' : '关'}</span>
        <span>块框: {(blocksByPage[pageNumber] || []).length} 个</span>
      </div>

      {/* 可滚动页面容器 */}
      <div style={{ padding: '20px', margin: '0 auto', maxWidth: '100%', boxSizing: 'border-box', maxHeight: 'calc(100vh - 200px)', overflow: 'auto' }}>
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
                onRenderSuccess={onPageRender}
                className="interactive-page"
              />
            </Document>
            {showOverlay && <canvas ref={overlayCanvasRef} />}
          </div>
        </div>
      </div>
    </div>
  )
}

export default InteractivePDFViewer3

// 统一样式（与 2.0 保持接近）
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

