import React, { useEffect, useMemo, useState } from 'react'
import { Document, pdfjs } from 'react-pdf'
import * as pdfjsLib from 'pdfjs-dist'
import { PDFPageView } from './pdf/BBoxOverlay'

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf-worker/pdf.worker.min.js'
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf-worker/pdf.worker.min.js'

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    width: '100%',
    padding: '16px',
    boxSizing: 'border-box'
  },
  controls: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '16px',
    alignItems: 'center',
    backgroundColor: '#f7f7f7',
    padding: '12px 16px',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
  },
  viewer: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '24px'
  },
  placeholder: {
    width: '100%',
    minHeight: '240px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#666',
    backgroundColor: '#fafafa',
    border: '1px dashed #ddd',
    borderRadius: '8px'
  },
  infoBadge: {
    backgroundColor: '#eef',
    color: '#223',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px'
  },
  errorText: {
    color: '#d9534f',
    fontSize: '13px'
  }
}


const KDFTester = () => {
  const [pdfFile, setPdfFile] = useState(null)
  const [layoutData, setLayoutData] = useState(null)
  const [pdfError, setPdfError] = useState(null)
  const [jsonError, setJsonError] = useState(null)
  const [numPages, setNumPages] = useState(0)
  const [viewerWidth, setViewerWidth] = useState(900)

  useEffect(() => {
    const updateWidth = () => {
      const width = Math.max(480, Math.min(window.innerWidth - 80, 1080))
      setViewerWidth(width)
    }
    updateWidth()
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  const documentOptions = useMemo(() => ({
    disableFontFace: false,
    useSystemFonts: true,
    verbosity: 0,
    enableXfa: true
  }), [])

  const handlePdfUpload = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setPdfFile(file)
    setPdfError(null)
  }

  const handleJsonUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const raw = await file.text()
      const parsed = JSON.parse(raw)
      const blocksByPage = parsed?.blocksByPage || {}
      const normalized = Object.entries(blocksByPage).reduce((acc, [pageId, blocks]) => {
        if (!Array.isArray(blocks)) return acc
        acc[String(pageId)] = blocks.map((block) => ({
          ...block,
          bbox: Array.isArray(block?.bbox) ? block.bbox : []
        }))
        return acc
      }, {})

      setLayoutData({
        jobId: parsed?.jobId || '',
        blocksByPage: normalized
      })
      setJsonError(null)
    } catch (error) {
      console.error('解析JSON失败', error)
      setJsonError(`解析JSON失败: ${error.message}`)
    }
  }

  const handleDocumentLoadSuccess = (pdf) => {
    setNumPages(pdf?.numPages || 0)
    setPdfError(null)
  }

  const handleDocumentLoadError = (error) => {
    console.error('加载PDF失败', error)
    setPdfError(`加载PDF失败: ${error.message}`)
  }

  const blocksByPage = layoutData?.blocksByPage || {}

  return (
    <div style={styles.container}>
      <div style={styles.controls}>
        <label>
          PDF 文件:
          <input type="file" accept="application/pdf" onChange={handlePdfUpload} style={{ marginLeft: '8px' }} />
        </label>
        <label>
          布局 JSON:
          <input type="file" accept="application/json" onChange={handleJsonUpload} style={{ marginLeft: '8px' }} />
        </label>
        {layoutData?.jobId && (
          <span style={styles.infoBadge}>jobId: {layoutData.jobId}</span>
        )}
        {pdfError && <span style={styles.errorText}>{pdfError}</span>}
        {jsonError && <span style={styles.errorText}>{jsonError}</span>}
      </div>

      <div style={styles.viewer}>
        {!pdfFile && (
          <div style={styles.placeholder}>请先上传 PDF 文件</div>
        )}
        {pdfFile && (
          <Document
            file={pdfFile}
            onLoadSuccess={handleDocumentLoadSuccess}
            onLoadError={handleDocumentLoadError}
            options={documentOptions}
            loading={<div style={styles.placeholder}>正在加载 PDF…</div>}
          >
            {numPages === 0 && (
              <div style={styles.placeholder}>PDF 加载中…</div>
            )}
            {Array.from({ length: numPages }, (_, index) => {
              const pageNumber = index + 1
              const blocks = blocksByPage[String(pageNumber)] || blocksByPage[pageNumber] || []
              return (
                <PDFPageView
                  key={`page_${pageNumber}`}
                  pageNumber={pageNumber}
                  width={viewerWidth}
                  blocks={blocks}
                />
              )
            })}
          </Document>
        )}
        {pdfFile && !layoutData && (
          <div style={styles.infoBadge}>尚未上传布局 JSON，暂不显示标注框</div>
        )}
      </div>
    </div>
  )
}

export default KDFTester
