import { useState } from 'react'
import PDFViewer from './components/PDFViewer'
import PDFParser from './components/PDFParser'
import InteractivePDFViewer from './components/InteractivePDFViewer'
import InteractivePDFViewer2 from './components/InteractivePDFViewer2'
import InteractivePDFViewer3 from './components/InteractivePDFViewer3'
import InteractivePDFViewer4 from './components/InteractivePDFViewer4'
import './App.css'
// 修复 react-pdf 的 TextLayer 与 AnnotationLayer 警告，并确保层叠关系正确显示
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

function App() {
  const [pdfFile, setPdfFile] = useState(null)
  const [activeTab, setActiveTab] = useState('viewer') // 'viewer' | 'parser' | 'editor' | 'editor2' | 'editor3' | 'editor4'
  const [ppBlocks3, setPpBlocks3] = useState(null)
  const [ppJobId3, setPpJobId3] = useState(null)
  const [ppLoading, setPpLoading] = useState(false)

  const handleFileChange = (event) => {
    const file = event.target.files[0]
    if (file && file.type === 'application/pdf') {
      setPdfFile(file)
    } else {
      alert('请选择一个PDF文件')
    }
  }

  return (
    <div className="App">
      {/* 左侧标签栏 */}
      <div className="sidebar">
        <div className="sidebar-header">
          <h1 className="brand">PDF 工具</h1>
        </div>
        
        <div className="tab-buttons">
          <button
            className={`tab-button ${activeTab === 'viewer' ? 'active' : ''}`}
            onClick={() => setActiveTab('viewer')}
          >
            📖 查看器
          </button>
          <button
            className={`tab-button ${activeTab === 'editor' ? 'active' : ''}`}
            onClick={() => setActiveTab('editor')}
          >
            ✏️ 编辑器
          </button>
          <button
            className={`tab-button ${activeTab === 'editor2' ? 'active' : ''}`}
            onClick={() => setActiveTab('editor2')}
          >
            🧪 编辑器 2.0
          </button>
          <button
            className={`tab-button ${activeTab === 'editor3' ? 'active' : ''}`}
            onClick={() => setActiveTab('editor3')}
          >
            🧩 编辑器 3.0
          </button>
          <button
            className={`tab-button ${activeTab === 'parser' ? 'active' : ''}`}
            onClick={() => setActiveTab('parser')}
          >
            🔍 解析器
          </button>
          <button
            className={`tab-button ${activeTab === 'editor4' ? 'active' : ''}`}
            onClick={() => setActiveTab('editor4')}
          >
            🧱 编辑器 4.0
          </button>
        </div>

        {/* 文件上传区域 */}
        <div className="file-upload-section">
          <h3>文件上传</h3>
          <div className="file-input-container">
            <label htmlFor="pdf-upload" className="upload-label">
              📄 PDF文件
            </label>
            <input 
              id="pdf-upload"
              type="file" 
              accept=".pdf" 
              onChange={handleFileChange}
              className="file-input"
            />
          </div>

          {/* 当前文件信息 */}
          {pdfFile && (
            <div className="current-file-info">
              <h4>当前PDF:</h4>
              <p>{pdfFile.name}</p>
              <p>{(pdfFile.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          )}
        </div>
      </div>

      {/* 右侧内容区域 */}
      <div className="main-content">
        {!pdfFile ? (
          <div className="empty-state">
            <div className="empty-icon">📁</div>
            <h2>欢迎使用 PDF 工具</h2>
            <p>请从左侧上传一个 PDF 文件开始使用</p>
            <div className="upload-tips">
              <div className="tip">
                <span className="tip-icon">📖</span>
                <div>
                  <strong>查看器:</strong> 浏览和查看PDF文档
                </div>
              </div>
              <div className="tip">
                <span className="tip-icon">✏️</span>
                <div>
                  <strong>编辑器:</strong> 交互式编辑，添加高亮和附件
                </div>
              </div>
              <div className="tip">
                <span className="tip-icon">🔍</span>
                <div>
                  <strong>解析器:</strong> 分析PDF结构，提取文本和图片信息
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="tab-content">
            {activeTab === 'viewer' && <PDFViewer file={pdfFile} />}
            {activeTab === 'editor' && <InteractivePDFViewer file={pdfFile} />}
            {activeTab === 'editor2' && <InteractivePDFViewer2 file={pdfFile} />}
            {activeTab === 'editor3' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    className="tab-button"
                    disabled={!pdfFile || ppLoading}
                    onClick={async () => {
                      if (!pdfFile) return
                      try {
                        setPpLoading(true)
                        const fd = new FormData()
                        fd.append('file', pdfFile)
                    const res = await fetch('/api/pp-parse', { method: 'POST', body: fd })
                    if (!res.ok) {
                      let detail = ''
                      try { const err = await res.json(); detail = err?.detail || err?.error || '' } catch(_) {}
                      throw new Error('解析请求失败' + (detail ? `：${String(detail).slice(0,300)}` : ''))
                    }
                    const data = await res.json()
                        setPpBlocks3(data.blocksByPage || {})
                        setPpJobId3(data.jobId || null)
                      } catch (e) {
                        alert('触发解析失败：' + (e?.message || e))
                      } finally {
                        setPpLoading(false)
                      }
                    }}
                  >{ppLoading ? '解析中…' : '⚙️ 使用LayoutParser PubLayNet 解析'}</button>
                  <button
                    className="tab-button"
                    disabled={!ppJobId3}
                    onClick={() => {
                      if (!ppJobId3) return
                      window.open(`/api/pp-parse/${ppJobId3}.json`, '_blank')
                    }}
                  >⬇️ 下载 JSON</button>
                </div>
                <InteractivePDFViewer3 file={pdfFile} ppBlocksData={ppBlocks3} ppCoordType="image" />
              </div>
            )}
            {activeTab === 'parser' && <PDFParser file={pdfFile} />}
            {activeTab === 'editor4' && <InteractivePDFViewer4 file={pdfFile} />}
          </div>
        )}
      </div>
    </div>
  )
}

export default App
