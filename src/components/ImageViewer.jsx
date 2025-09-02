import React, { useState, useEffect } from 'react'

const ImageViewer = ({ file }) => {
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [showInfo, setShowInfo] = useState(true)
  const [dimensions, setDimensions] = useState(null)

  const resetView = () => {
    setZoom(1)
    setRotation(0)
  }

  const zoomIn = () => setZoom(prev => Math.min(prev * 1.2, 5))
  const zoomOut = () => setZoom(prev => Math.max(prev / 1.2, 0.1))
  const rotateLeft = () => setRotation(prev => prev - 90)
  const rotateRight = () => setRotation(prev => prev + 90)

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getImageDimensions = () => {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        resolve({ width: img.naturalWidth, height: img.naturalHeight })
      }
      img.src = URL.createObjectURL(file)
    })
  }

  useEffect(() => {
    getImageDimensions().then(setDimensions)
  }, [file])

  return (
    <div className="image-viewer">
      <div className="image-viewer-header">
        <h2>图片查看器</h2>
        <div className="image-controls">
          <button onClick={zoomOut} disabled={zoom <= 0.1}>🔍-</button>
          <button onClick={resetView}>🔄</button>
          <button onClick={zoomIn} disabled={zoom >= 5}>🔍+</button>
          <button onClick={rotateLeft}>↶</button>
          <button onClick={rotateRight}>↷</button>
          <button onClick={() => setShowInfo(!showInfo)}>
            {showInfo ? '📋' : '📋'}
          </button>
        </div>
      </div>

      <div className="image-container">
        <div 
          className="image-wrapper"
          style={{
            transform: `scale(${zoom}) rotate(${rotation}deg)`,
            transition: 'transform 0.3s ease'
          }}
        >
          <img 
            src={URL.createObjectURL(file)} 
            alt={file.name}
            style={{ 
              maxWidth: '100%', 
              height: 'auto',
              display: 'block'
            }}
          />
        </div>
      </div>

      {showInfo && (
        <div className="image-info">
          <h3>图片信息</h3>
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">文件名:</span>
              <span className="info-value">{file.name}</span>
            </div>
            <div className="info-item">
              <span className="info-label">文件大小:</span>
              <span className="info-value">{formatFileSize(file.size)}</span>
            </div>
            <div className="info-item">
              <span className="info-label">文件类型:</span>
              <span className="info-value">{file.type}</span>
            </div>
            <div className="info-item">
              <span className="info-label">最后修改:</span>
              <span className="info-value">
                {new Date(file.lastModified).toLocaleString('zh-CN')}
              </span>
            </div>
            {dimensions && (
              <>
                <div className="info-item">
                  <span className="info-label">原始尺寸:</span>
                  <span className="info-value">
                    {dimensions.width} × {dimensions.height} 像素
                  </span>
                </div>
                <div className="info-item">
                  <span className="info-label">当前缩放:</span>
                  <span className="info-value">{(zoom * 100).toFixed(0)}%</span>
                </div>
                <div className="info-item">
                  <span className="info-label">当前旋转:</span>
                  <span className="info-value">{rotation}°</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default ImageViewer
