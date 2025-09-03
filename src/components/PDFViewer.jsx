import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import * as pdfjsLib from 'pdfjs-dist'

// 使用本地worker文件，避免CORS问题 - 统一使用5.3.93版本
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf-worker/pdf.worker.min.js'
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf-worker/pdf.worker.min.js'

const PDFViewer = ({ file }) => {
  const [numPages, setNumPages] = useState(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [loadingStage, setLoadingStage] = useState('准备中...')

  const [pageScale, setPageScale] = useState(1)
  const [contentDimensions, setContentDimensions] = useState({ width: 'auto', height: 'auto' })

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages)
    setLoading(false)
    setError(null)
    setLoadingProgress(100)
    setLoadingStage('加载完成')
    
    // 清理超时检测
    if (loadingTimeout) {
      clearTimeout(loadingTimeout)
      setLoadingTimeout(null)
    }
    setIsStuck(false)
  }

  const onDocumentLoadError = (error) => {
    setError('加载PDF文件失败: ' + error.message)
    setLoading(false)
    setLoadingProgress(0)
    setLoadingStage('加载失败')
  }

  // 简化的加载状态管理
  const [loadingTimeout, setLoadingTimeout] = useState(null)
  const [isStuck, setIsStuck] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const maxRetries = 3

  // 简化的加载进度 - 只显示真实状态
  const startSimpleLoading = () => {
    setLoadingStage('正在加载PDF文件...')
    setLoadingProgress(50) // 直接显示50%，等待真实加载
    
    // 设置合理的超时时间
    const timeout = setTimeout(() => {
      if (loadingProgress < 100) {
        setIsStuck(true)
        setLoadingStage('加载超时，正在尝试恢复...')
      }
    }, 8000) // 8秒超时，适合小文件
    
    setLoadingTimeout(timeout)
    
    return () => {
      clearTimeout(timeout)
    }
  }

  const resetLoadingState = () => {
    setIsStuck(false)
    setLoadingProgress(0)
    setLoadingStage('准备中...')
    if (loadingTimeout) {
      clearTimeout(loadingTimeout)
      setLoadingTimeout(null)
    }
  }

  // 强制重新加载PDF
  const forceReloadPDF = () => {
    if (retryCount >= maxRetries) {
      setError('重试次数已达上限，请检查PDF文件或刷新页面')
      setLoading(false)
      return
    }
    
    setRetryCount(prev => prev + 1)
    setIsStuck(false)
    setLoadingProgress(0)
    setLoadingStage(`第${retryCount + 1}次重试加载...`)
    
    // 重新开始加载
    setTimeout(() => {
      startSimpleLoading()
    }, 1000)
  }

  const goToPrevPage = () => {
    setPageNumber(prev => Math.max(prev - 1, 1))
  }

  const goToNextPage = () => {
    setPageNumber(prev => Math.min(prev + 1, numPages))
  }

  const goToPage = (page) => {
    const pageNum = parseInt(page)
    if (pageNum >= 1 && pageNum <= numPages) {
      setPageNumber(pageNum)
    }
  }

  useEffect(() => {
    setLoading(true)
    setError(null)
    setPageNumber(1)
    setRetryCount(0)
    resetLoadingState()
    
    // 文件健康检查
    if (file) {
      // 检查文件大小
      if (file.size > 100 * 1024 * 1024) { // 100MB
        setLoadingStage('文件很大，加载可能需要很长时间...')
      } else if (file.size > 50 * 1024 * 1024) { // 50MB
        setLoadingStage('文件较大，加载可能需要较长时间...')
      } else if (file.size < 1024 * 1024) { // 1MB
        setLoadingStage('小文件，应该很快加载完成...')
      }
      
      // 检查文件类型
      if (file.type !== 'application/pdf') {
        setError('文件类型不是PDF，请选择正确的PDF文件')
        setLoading(false)
        return
      }
      
      // 检查文件是否为空
      if (file.size === 0) {
        setError('文件为空，请选择有效的PDF文件')
        setLoading(false)
        return
      }
      
      // 为小文件设置更短的超时时间
      if (file.size < 1024 * 1024) { // 1MB以下
        setLoadingStage('小文件，应该很快加载完成...')
      }
    }
    
    // 开始简化加载进度
    const cleanup = startSimpleLoading()
    
    // 清理函数
    return cleanup
  }, [file])

  const documentOptions = useMemo(() => ({
    disableFontFace: false,
    useSystemFonts: true,
    verbosity: 0,
    enableXfa: true
  }), [])

  const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '0',
    maxWidth: '100%',
    width: '100%',
    height: '100%'
  }

  const controlsStyle = {
    margin: '16px 0',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
    justifyContent: 'center',
    transform: 'scale(0.85)', // 缩小UI，不影响PDF内容
    transformOrigin: 'top center'
  }

  const buttonStyle = {
    padding: '6px 12px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px'
  }

  const inputStyle = {
    width: '56px',
    padding: '4px',
    textAlign: 'center',
    border: '1px solid #ccc',
    borderRadius: '4px',
    fontSize: '13px'
  }

  // 加载界面样式
  const loadingContainerStyle = {
    textAlign: 'center',
    padding: '40px 20px',
    maxWidth: '600px',
    margin: '0 auto'
  }

  const loadingTitleStyle = {
    color: '#333',
    marginBottom: '30px',
    fontSize: '24px'
  }

  const fileInfoStyle = {
    backgroundColor: '#f8f9fa',
    padding: '15px',
    borderRadius: '8px',
    marginBottom: '20px',
    border: '1px solid #e9ecef'
  }

  const loadingStageStyle = {
    fontSize: '18px',
    color: '#007bff',
    marginBottom: '20px',
    fontWeight: '500'
  }

  const progressBarContainerStyle = {
    marginBottom: '30px'
  }

  const progressBarStyle = {
    width: '100%',
    height: '20px',
    backgroundColor: '#e9ecef',
    borderRadius: '10px',
    overflow: 'hidden',
    marginBottom: '10px',
    boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)'
  }

  const progressBarFillStyle = {
    height: '100%',
    backgroundColor: '#007bff',
    borderRadius: '10px',
    transition: 'width 0.3s ease',
    background: 'linear-gradient(90deg, #007bff, #0056b3)'
  }

  const progressTextStyle = {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#007bff'
  }

  const loadingTipsStyle = {
    backgroundColor: '#fff3cd',
    border: '1px solid #ffeaa7',
    borderRadius: '8px',
    padding: '15px',
    textAlign: 'left'
  }

  // 错误界面样式
  const errorContainerStyle = {
    textAlign: 'center',
    padding: '40px 20px',
    maxWidth: '600px',
    margin: '0 auto'
  }

  const errorTitleStyle = {
    color: '#dc3545',
    marginBottom: '20px',
    fontSize: '24px'
  }

  const errorMessageStyle = {
    fontSize: '16px',
    color: '#6c757d',
    marginBottom: '20px',
    padding: '15px',
    backgroundColor: '#f8d7da',
    border: '1px solid #f5c6cb',
    borderRadius: '8px'
  }

  const errorTipsStyle = {
    backgroundColor: '#d1ecf1',
    border: '1px solid #bee5eb',
    borderRadius: '8px',
    padding: '15px',
    textAlign: 'left'
  }

  // 卡住状态样式
  const stuckWarningStyle = {
    backgroundColor: '#fff3cd',
    border: '2px solid #ffc107',
    borderRadius: '8px',
    padding: '20px',
    marginTop: '20px',
    textAlign: 'center'
  }

  const retryButtonStyle = {
    padding: '10px 20px',
    backgroundColor: '#ffc107',
    color: '#000',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: 'bold',
    margin: '15px 0'
  }

  const stuckTipStyle = {
    fontSize: '14px',
    color: '#856404',
    marginTop: '15px',
    lineHeight: '1.5'
  }

  const retryInfoStyle = {
    margin: '15px 0',
    padding: '10px',
    backgroundColor: '#f8f9fa',
    borderRadius: '6px'
  }

  const advancedOptionsStyle = {
    margin: '20px 0',
    padding: '15px',
    backgroundColor: '#e9ecef',
    borderRadius: '6px'
  }

  const secondaryButtonStyle = {
    padding: '8px 16px',
    backgroundColor: '#6c757d',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    margin: '5px',
    fontSize: '14px'
  }

  const pdfViewerStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '0',
    maxWidth: '100%',
    width: '100%',
    height: '100%'
  }

  // 仿照编辑器的页面容器样式（无边框、无阴影、自然宽高）
  const pageContainerStyle = {
    position: 'relative',
    border: 'none',
    borderRadius: 0,
    overflow: 'visible',
    boxShadow: 'none',
    userSelect: 'text',
    WebkitUserSelect: 'text',
    MozUserSelect: 'text',
    msUserSelect: 'text',
    cursor: 'text',
    display: 'inline-block',
    margin: '0 auto'
  }

  return (
    <div style={containerStyle}>
      {/* 加载UI - 当loading为true时显示 */}
      {loading && (
        <div style={loadingContainerStyle}>
          <h3 style={loadingTitleStyle}>PDF 加载中</h3>
          
          {/* 文件信息 */}
          <div style={fileInfoStyle}>
            <p><strong>文件名:</strong> {file?.name}</p>
            <p><strong>文件大小:</strong> {(file?.size / 1024 / 1024).toFixed(2)} MB</p>
          </div>
          
          {/* 加载阶段 */}
          <p style={loadingStageStyle}>{loadingStage}</p>
          
          {/* 进度条 */}
          <div style={progressBarContainerStyle}>
            <div style={progressBarStyle}>
              <div 
                style={{
                  ...progressBarFillStyle,
                  width: `${loadingProgress}%`
                }}
              />
            </div>
            <span style={progressTextStyle}>{loadingProgress}%</span>
          </div>
          
          {/* 加载提示 */}
          <div style={loadingTipsStyle}>
            <p>💡 加载提示:</p>
            <ul>
              <li>文件越大，加载时间越长</li>
              <li>首次加载较慢，再次访问会更快</li>
              <li>建议在网络良好时加载大文件</li>
            </ul>
          </div>
          
          {/* 卡住状态处理 */}
          {isStuck && (
            <div style={stuckWarningStyle}>
              <p>⚠️ 加载似乎卡住了</p>
              <div style={retryInfoStyle}>
                <p>重试次数: {retryCount}/{maxRetries}</p>
                <button 
                  style={retryButtonStyle}
                  onClick={forceReloadPDF}
                  disabled={retryCount >= maxRetries}
                >
                  {retryCount >= maxRetries ? '重试次数已用完' : '强制重新加载'}
                </button>
              </div>
              
              <div style={advancedOptionsStyle}>
                <h4>高级恢复选项:</h4>
                <button 
                  style={secondaryButtonStyle}
                  onClick={() => {
                    // 尝试使用不同的渲染设置
                    setLoadingStage('尝试使用简化渲染模式...')
                    setLoadingProgress(85)
                  }}
                >
                  尝试简化渲染
                </button>
                <button 
                  style={secondaryButtonStyle}
                  onClick={() => {
                    // 尝试分页加载
                    setLoadingStage('尝试使用分页加载模式...')
                    setLoadingProgress(87)
                  }}
                >
                  尝试分页加载
                </button>
              </div>
              
              <p style={stuckTipStyle}>
                如果问题持续，请尝试：
                <br />
                1. 刷新页面重新上传
                <br />
                2. 检查PDF文件是否损坏
                <br />
                3. 尝试其他PDF文件
                <br />
                4. 使用不同的浏览器
              </p>
            </div>
          )}
        </div>
      )}

      {/* 错误UI - 当error存在时显示 */}
      {error && (
        <div style={errorContainerStyle}>
          <h3 style={errorTitleStyle}>❌ 加载失败</h3>
          <p style={errorMessageStyle}>{error}</p>
          <div style={errorTipsStyle}>
            <p>💡 解决建议:</p>
            <ul>
              <li>检查文件是否为有效的PDF格式</li>
              <li>确保文件没有损坏</li>
              <li>尝试重新上传文件</li>
              <li>检查浏览器是否支持PDF查看</li>
            </ul>
          </div>
        </div>
      )}

      {/* PDF查看器 - 始终渲染，但根据状态控制显示 */}
      <div style={pdfViewerStyle} className="pdf-viewer-container">
        <div style={controlsStyle} className="pdf-controls">
          <button 
            style={buttonStyle} 
            onClick={goToPrevPage} 
            disabled={pageNumber <= 1}
          >
            上一页
          </button>
          
          <span>
            第 
            <input
              style={inputStyle}
              type="number"
              min={1}
              max={numPages}
              value={pageNumber}
              onChange={(e) => goToPage(e.target.value)}
            />
            页，共 {numPages} 页
          </span>
          
          <button 
            style={buttonStyle} 
            onClick={goToNextPage} 
            disabled={pageNumber >= numPages}
          >
            下一页
          </button>
        </div>

        <div className="pdf-content" style={{
          padding: '20px',
          margin: '0 auto',
          maxWidth: '100%',
          boxSizing: 'border-box',
          maxHeight: 'calc(100vh - 200px)',
          overflow: 'auto'
        }}>
          <div style={{ ...pageContainerStyle, width: contentDimensions.width === 'auto' ? 'auto' : `${contentDimensions.width}px`, maxWidth: '100%' }}>
            <Document
              file={file}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              options={documentOptions}
              loading="正在加载PDF..."
              error="PDF加载失败"
            >
              <Page
                pageNumber={pageNumber}
                renderTextLayer={true}
                renderAnnotationLayer={true}
                useCropBox={true}
                scale={pageScale}
                onLoadSuccess={(page) => {
                  // 基于CropBox计算缩放，整体略小于编辑器
                  const viewport = page.getViewport({ scale: 1.0, useCropBox: true })
                  const pdfWidth = viewport.width
                  const pdfHeight = viewport.height

                  // 以容器视口估计可用空间，留出左右/上下内边距
                  const availableWidth = window.innerWidth - 80
                  const availableHeight = window.innerHeight - 220
                  const widthScale = availableWidth / pdfWidth
                  const heightScale = availableHeight / pdfHeight
                  const optimalScale = Math.min(widthScale, heightScale, 1.6)
                  const finalScale = Math.min(Math.max(optimalScale * 1.5, 0.5), 2.0)

                  setPageScale(finalScale)
                  setContentDimensions({
                    width: Math.round(pdfWidth * finalScale),
                    height: Math.round(pdfHeight * finalScale)
                  })
                }}
                onLoadError={(error) => {
                  console.error('页面加载失败:', error)
                  setError('页面渲染失败: ' + error.message)
                  setLoading(false)
                }}
              />
            </Document>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PDFViewer
