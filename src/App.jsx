import { useState } from 'react'
import PDFViewer from './components/PDFViewer'
import PDFParser from './components/PDFParser'
import InteractivePDFViewer from './components/InteractivePDFViewer'
import './App.css'
// 修复 react-pdf 的 TextLayer 与 AnnotationLayer 警告，并确保层叠关系正确显示
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

function App() {
  const [pdfFile, setPdfFile] = useState(null)
  const [activeTab, setActiveTab] = useState('viewer') // 'viewer', 'parser', 或 'editor'

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
            className={`tab-button ${activeTab === 'parser' ? 'active' : ''}`}
            onClick={() => setActiveTab('parser')}
          >
            🔍 解析器
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
            {activeTab === 'parser' && <PDFParser file={pdfFile} />}
          </div>
        )}
      </div>
    </div>
  )
}

export default App
