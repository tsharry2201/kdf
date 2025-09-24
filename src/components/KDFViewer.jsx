import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import * as pdfjsLib from 'pdfjs-dist'
// CSS样式已在App.css中定义

// 上传文件组件
const UploadFileButton = ({ 
  position, 
  showFileTypeMenu, 
  setShowFileTypeMenu, 
  fileTypes, 
  selectedFileType, 
  setSelectedFileType,
  uploadForAnnotation,
  ann,
  onMenuToggle // 新增：菜单切换回调
}) => {
  return (
    <div
      style={{ 
        ...styles.hoverBadge,
        left: position.left,
        top: position.top,
        right: 'auto'
      }}
      onClick={(e) => { 
        e.stopPropagation(); 
        const newShowState = !showFileTypeMenu
        setShowFileTypeMenu(newShowState)
        // 通知父组件菜单状态变化，传递菜单位置信息
        onMenuToggle && onMenuToggle({
          show: newShowState,
          position: {
            left: position.menuLeft,
            top: position.menuTop
          },
          type: 'upload',
          ann: ann,
          fileTypes: fileTypes,
          selectedFileType: selectedFileType,
          setSelectedFileType: setSelectedFileType,
          uploadForAnnotation: uploadForAnnotation
        })
      }}
    >
      📎 上传文件
    </div>
  )
}

// 显示/隐藏按钮组件
const VisibilityButton = ({ 
  position, 
  ann,
  attachments,
  pageNumber,
  toggleAttachmentVisibility
}) => {
  // 只在有附件时显示
  const attachment = attachments.find(att => att.pageNumber === pageNumber && att.targetId === ann.id)
  if (!attachment) return null
  
  const isHidden = attachment.hidden
  const buttonText = isHidden ? '👁️ 显示' : '🙈 隐藏'
  
  return (
    <div
      style={{ 
        ...styles.hoverBadge,
        left: position.left,
        top: position.top,
        right: 'auto',
        backgroundColor: isHidden ? '#6c757d' : '#17a2b8',
        color: 'white'
      }}
      onClick={(e) => { 
        e.stopPropagation()
        toggleAttachmentVisibility(attachment.id)
      }}
      title={isHidden ? '显示附件' : '隐藏附件'}
    >
      {buttonText}
    </div>
  )
}

// 删除按钮组件
const DeleteButton = ({ 
  position, 
  ann,
  attachments,
  pageNumber,
  deleteAttachment
}) => {
  // 只在有附件时显示
  const attachment = attachments.find(att => att.pageNumber === pageNumber && att.targetId === ann.id)
  if (!attachment) return null
  
  return (
    <div
      style={{ 
        ...styles.hoverBadge,
        left: position.left,
        top: position.top,
        right: 'auto',
        backgroundColor: '#dc3545',
        color: 'white'
      }}
      onClick={(e) => { 
        e.stopPropagation()
        if (confirm('确定要删除这个附件吗？')) {
          deleteAttachment(attachment.id)
        }
      }}
      title="删除附件"
    >
      🗑️ 删除
    </div>
  )
}

// 视频进度条组件
const VideoProgressBar = ({ 
  attachment, 
  videoStates, 
  handleVideoProgressChange, 
  formatTime,
  onPlayPause,
  onSpeedChange,
  onFullscreen
}) => {
  const hasStartedPlaying = videoStates[attachment.id]?.hasStarted
  const duration = videoStates[attachment.id]?.duration
  const isPlaying = videoStates[attachment.id]?.playing
  const playbackRate = videoStates[attachment.id]?.playbackRate || 1
  
  if (!hasStartedPlaying || !duration || duration <= 0) return null
  
  return (
    <div
      style={{
        position: 'absolute',
        left: attachment.area.x,
        top: attachment.area.y + attachment.area.height + 8,
        width: attachment.area.width,
        background: 'rgba(0,0,0,0.9)',
        borderRadius: 4,
        padding: '8px',
        zIndex: 1000,
        border: '1px solid rgba(255,255,255,0.2)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.5)'
      }}
    >
      {/* 进度条 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <span style={{ color: 'white', fontSize: '12px', minWidth: '35px' }}>
          {formatTime(videoStates[attachment.id]?.currentTime || 0)}
        </span>
        <input
          type="range"
          min="0"
          max={duration}
          value={videoStates[attachment.id]?.currentTime || 0}
          onChange={(e) => handleVideoProgressChange(attachment.id, parseFloat(e.target.value))}
          style={{
            flex: 1,
            height: '6px',
            outline: 'none',
            cursor: 'pointer'
          }}
          className="video-progress-slider"
        />
        <span style={{ color: 'white', fontSize: '12px', minWidth: '35px' }}>
          {formatTime(duration)}
        </span>
      </div>
      
      {/* 控制按钮 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* 播放/暂停按钮 */}
          <button
            onClick={() => onPlayPause(attachment.id)}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: '4px',
              color: 'white',
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
            onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.3)'}
            onMouseLeave={(e) => e.target.style.background = 'rgba(255,255,255,0.2)'}
          >
            {isPlaying ? '⏸️' : '▶️'}
            {isPlaying ? '暂停' : '播放'}
          </button>
          
          {/* 倍速选择 */}
          <select
            value={playbackRate}
            onChange={(e) => onSpeedChange(attachment.id, parseFloat(e.target.value))}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: '4px',
              color: 'white',
              padding: '6px 8px',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            <option value={0.5} style={{ background: '#333', color: 'white' }}>0.5x</option>
            <option value={0.75} style={{ background: '#333', color: 'white' }}>0.75x</option>
            <option value={1} style={{ background: '#333', color: 'white' }}>1x</option>
            <option value={1.25} style={{ background: '#333', color: 'white' }}>1.25x</option>
            <option value={1.5} style={{ background: '#333', color: 'white' }}>1.5x</option>
            <option value={2} style={{ background: '#333', color: 'white' }}>2x</option>
          </select>
        </div>
        
        {/* 全屏按钮 */}
        <button
          onClick={() => onFullscreen(attachment.id)}
          style={{
            background: 'rgba(255,255,255,0.2)',
            border: 'none',
            borderRadius: '4px',
            color: 'white',
            padding: '6px 12px',
            cursor: 'pointer',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
          onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.3)'}
          onMouseLeave={(e) => e.target.style.background = 'rgba(255,255,255,0.2)'}
        >
          ⛶ 全屏
        </button>
      </div>
    </div>
  )
}

// 音频进度条组件
const AudioProgressBar = ({ 
  attachment, 
  audioStates, 
  handleAudioProgressChange, 
  formatTime 
}) => {
  const hasStartedPlaying = audioStates[attachment.id]?.hasStarted
  const duration = audioStates[attachment.id]?.duration
  
  if (!hasStartedPlaying || !duration || duration <= 0) return null
  
  return (
    <div
      style={{
        position: 'absolute',
        left: attachment.area.x,
        top: attachment.area.y + attachment.area.height + 8,
        width: attachment.area.width,
        background: 'rgba(0,0,0,0.9)',
        borderRadius: 4,
        padding: '8px',
        zIndex: 1000,
        border: '1px solid rgba(255,255,255,0.2)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.5)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ color: 'white', fontSize: '12px', minWidth: '35px' }}>
          {formatTime(audioStates[attachment.id]?.currentTime || 0)}
        </span>
        <input
          type="range"
          min="0"
          max={duration}
          value={audioStates[attachment.id]?.currentTime || 0}
          onChange={(e) => handleAudioProgressChange(attachment.id, parseFloat(e.target.value))}
          style={{
            flex: 1,
            height: '6px',
            outline: 'none',
            cursor: 'pointer'
          }}
          className="video-progress-slider"
        />
        <span style={{ color: 'white', fontSize: '12px', minWidth: '35px' }}>
          {formatTime(duration)}
        </span>
      </div>
    </div>
  )
}

// 使用本地worker文件，避免CORS问题 - 统一使用5.3.93版本
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf-worker/pdf.worker.min.js'
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf-worker/pdf.worker.min.js'

const toPositiveNumber = (value) => {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : null
}

const clampNumber = (value, min, max) => {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

const adjustRectWithTuning = (rect, tuning) => {
  if (!rect) return rect
  const scaleX = Number.isFinite(tuning?.scaleX) ? tuning.scaleX : 1
  const scaleY = Number.isFinite(tuning?.scaleY) ? tuning.scaleY : 1
  const expandX = Number.isFinite(tuning?.expandX) ? tuning.expandX : 0
  const expandY = Number.isFinite(tuning?.expandY) ? tuning.expandY : 0
  const offsetX = Number.isFinite(tuning?.offsetX) ? tuning.offsetX : 0
  const offsetY = Number.isFinite(tuning?.offsetY) ? tuning.offsetY : 0
  const anchorX = Number.isFinite(tuning?.anchorX) ? tuning.anchorX : 0
  const anchorY = Number.isFinite(tuning?.anchorY) ? tuning.anchorY : 0

  let sx = scaleX
  let sy = scaleY
  if (tuning?.uniform) {
    const uniformScale = Math.min(sx, sy)
    sx = uniformScale
    sy = uniformScale
  }

  const baseWidth = rect.width ?? 0
  const baseHeight = rect.height ?? 0
  const scaledWidth = Math.max(1, baseWidth * sx + expandX)
  const scaledHeight = Math.max(1, baseHeight * sy + expandY)
  const absWidth = Number.isFinite(tuning?.absWidth) && tuning.absWidth > 0 ? tuning.absWidth : null
  const absHeight = Number.isFinite(tuning?.absHeight) && tuning.absHeight > 0 ? tuning.absHeight : null
  const finalWidth = tuning?.useAbsWidth && absWidth ? absWidth : scaledWidth
  const finalHeight = tuning?.useAbsHeight && absHeight ? absHeight : scaledHeight
  const rawX = rect.x ?? 0
  const rawY = rect.y ?? 0
  const scaledX = anchorX + (rawX - anchorX) * sx
  const scaledY = anchorY + (rawY - anchorY) * sy

  return {
    x: scaledX + offsetX,
    y: scaledY + offsetY,
    width: finalWidth,
    height: finalHeight
  }
}

const pickSizeFromBlocks = (blocks, field) => {
  if (!Array.isArray(blocks)) return null
  for (const block of blocks) {
    const raw = block?.[field]
    if (!Array.isArray(raw) || raw.length < 2) continue
    const width = toPositiveNumber(raw[0])
    const height = toPositiveNumber(raw[1])
    if (width && height) {
      return { width, height, basis: field }
    }
  }
  return null
}

const measureBBoxExtent = (blocks) => {
  if (!Array.isArray(blocks)) return null
  let maxX = 0
  let maxY = 0
  let found = false
  blocks.forEach(block => {
    const bbox = Array.isArray(block?.bbox) && block.bbox.length >= 4 ? block.bbox : null
    if (!bbox) return
    const x2 = toPositiveNumber(bbox[2])
    const y2 = toPositiveNumber(bbox[3])
    if (x2 && y2) {
      maxX = Math.max(maxX, x2)
      maxY = Math.max(maxY, y2)
      found = true
    }
  })
  return found ? { width: maxX, height: maxY, basis: 'bbox_extents' } : null
}

const resolveSourceSize = ({ blocks, viewport, method }) => {
  const fallback = {
    width: viewport?.width || 0,
    height: viewport?.height || 0,
    basis: 'viewport'
  }

  if (method === 'direct') {
    return { ...fallback, basis: 'direct' }
  }

  if (!Array.isArray(blocks) || !blocks.length) {
    return fallback
  }

  const preferred = pickSizeFromBlocks(blocks, 'img_size')
    || pickSizeFromBlocks(blocks, 'page_size')
    || pickSizeFromBlocks(blocks, 'pageSize')
    || pickSizeFromBlocks(blocks, 'page_dimensions')

  const bboxExtent = measureBBoxExtent(blocks)

  if (method === 'dpi') {
    return bboxExtent || preferred || fallback
  }

  if (preferred) {
    return preferred
  }

  if (bboxExtent) {
    return bboxExtent
  }

  return fallback
}

const KDFViewer = ({ file }) => {
  // 添加视频进度条样式
  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = `
      .video-progress-slider {
        -webkit-appearance: none;
        appearance: none;
        background: transparent;
        cursor: pointer;
      }
      
      .video-progress-slider::-webkit-slider-track {
        background: #333;
        height: 6px;
        border-radius: 3px;
      }
      
      .video-progress-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #007bff;
        cursor: pointer;
        border: 2px solid white;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        margin-top: -5px;
      }
      
      .video-progress-slider::-moz-range-track {
        background: #333;
        height: 6px;
        border-radius: 3px;
        border: none;
      }
      
      .video-progress-slider::-moz-range-thumb {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #007bff;
        cursor: pointer;
        border: 2px solid white;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      }
    `
    document.head.appendChild(style)
    
    return () => {
      document.head.removeChild(style)
    }
  }, [])
  const [numPages, setNumPages] = useState(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [currentTargetBlock, setCurrentTargetBlock] = useState(null) // { type: 'text'|'image', area, text? }
  const [selectedFileType, setSelectedFileType] = useState('image') // 默认选择图片
  const [showFileTypeMenu, setShowFileTypeMenu] = useState(false) // 控制悬浮按钮的文件类型菜单显示
  // 操作菜单相关状态已移除，现在使用直接的显示/隐藏和删除按钮
  const [currentMenu, setCurrentMenu] = useState(null) // 当前显示的菜单信息
  

  const [pdfFile, setPdfFile] = useState(null) // 当前PDF文件

  // 多媒体保存状态
  const [savingMultimedias, setSavingMultimedias] = useState(false) // 保存多媒体状态
  const [loadingMultimedias, setLoadingMultimedias] = useState(false) // 加载多媒体状态
  
  // 文件类型配置
  const fileTypes = [
    { id: 'image', name: '图片', icon: '🖼️', accept: 'image/*' },
    { id: 'video', name: '视频', icon: '🎥', accept: 'video/*' },
    { id: 'audio', name: '音频', icon: '🎵', accept: 'audio/*' },
    { id: '3d', name: '3D模型', icon: '🎲', accept: '.obj,.fbx,.gltf,.glb,.dae,.ply,.stl' }
  ]
  
  // 操作类型配置函数已移除，现在使用直接的显示/隐藏和删除按钮
  const [pdfDoc, setPdfDoc] = useState(null)
  const [parsedByPage, setParsedByPage] = useState({}) // { [pageNumber]: Annotation[] }
  const [lpBlocksByPage, setLpBlocksByPage] = useState(null) // 后端(LP+PubLayNet)返回的原始结果
  const [lpParsing, setLpParsing] = useState(false)
  const [lpError, setLpError] = useState(null)
  const [basePageSize, setBasePageSize] = useState({}) // { [pageNumber]: { width, height } }
  const [associatedImages, setAssociatedImages] = useState([]) // 新增：关联的图片
  const [showDebugBounds, setShowDebugBounds] = useState(false) // 调试：显示解析块边界
  const [pageScale, setPageScale] = useState(1) // PDF页面缩放比例
  const [coordinateMethod, setCoordinateMethod] = useState('auto') // 坐标转换方法：'auto', 'direct', 'dpi'
  const [manualOffset, setManualOffset] = useState({ x: -2, y: -1 }) // 手动调整偏移
  const [usePageScale, setUsePageScale] = useState(true) // 是否使用pageScale
  const [contentDimensions, setContentDimensions] = useState({ width: 'auto', height: 'auto' }) // 内容实际尺寸
  const [videoStates, setVideoStates] = useState({}) // { [attachmentId]: { playing: boolean, hasStarted: boolean, currentTime: number, duration: number, playbackRate: number, isFullscreen: boolean } }
  const videoRefs = useRef({}) // 保持每个视频的ref
  const [audioStates, setAudioStates] = useState({}) // { [attachmentId]: { playing: boolean, hasStarted: boolean, currentTime: number, duration: number } }
  const audioRefs = useRef({}) // 保持每个音频的ref
  const [imageStates, setImageStates] = useState({}) // { [attachmentId]: { fit: 'cover'|'contain' } }
  const [attachments, setAttachments] = useState([]) // 附件列表
  const [uploadStatus, setUploadStatus] = useState(null) // 上传状态
  const [showContextMenu, setShowContextMenu] = useState(false) // 上下文菜单显示状态
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 }) // 上下文菜单位置
  const [hoveredAnnId, setHoveredAnnId] = useState(null) // 悬浮中的图/表块
  const [bboxTuning, setBBoxTuning] = useState({
    scaleX: 0.91,
    scaleY: 1.18,
    offsetX: 0,
    offsetY: 0,
    expandX: 0,
    expandY: 0,
    uniform: false,
    anchorX: 0,
    anchorY: 0,
    useAbsWidth: false,
    useAbsHeight: false,
    absWidth: null,
    absHeight: null
  })
  const attachmentsRef = useRef([])

  const pageRef = useRef(null) // 保留：外层容器
  const pageWrapperRef = useRef(null) // 新增：实际页面包裹层（与高亮同层）
  const fileInputRef = useRef(null)

  const documentOptions = useMemo(() => ({
    disableFontFace: false,
    useSystemFonts: true,
    verbosity: 0,
    enableXfa: true
  }), [])

  const onDocumentLoadSuccess = (pdf) => {
    console.log('交互式编辑器PDF加载成功，页数:', pdf?.numPages)
    setNumPages(pdf?.numPages || 0)
    setPdfDoc(pdf)
    setLoading(false)
    setError(null)
  }

  const onDocumentLoadError = (error) => {
    console.error('交互式编辑器PDF加载失败:', error)
    setError('加载PDF文件失败: ' + error.message)
    setLoading(false)
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
  
  // 移除手动缩放（按需可再开启）


  // 处理右键菜单
  const handleContextMenu = (event) => {
    console.log('右键菜单事件触发')
    event.preventDefault()
    event.stopPropagation()
    
    const menuPos = { x: event.clientX, y: event.clientY }
    setContextMenuPos(menuPos)

    const pageRect = pageWrapperRef.current?.getBoundingClientRect()
    if (pageRect) {
      const area = {
        x: Math.max(0, menuPos.x - pageRect.left - 40),
        y: Math.max(0, menuPos.y - pageRect.top - 20),
        width: 80,
        height: 40
      }
      setCurrentTargetBlock({ type: 'image', area })
    }

    setShowContextMenu(true)
  }

  // 关闭上下文菜单
  const closeContextMenu = () => {
    setShowContextMenu(false)
  }


  // 触发文件上传
  const triggerFileUpload = () => {
    // 在真正上传前，基于当前选择/点击，匹配解析块，记录到 currentTargetBlock
    const wrapperRect = pageWrapperRef.current?.getBoundingClientRect()
    let matched = null
    if (wrapperRect) {
      // 右键点击优先匹配图片
      matched = matchVisualAnnotation({ px: contextMenuPos.x - wrapperRect.left, py: contextMenuPos.y - wrapperRect.top })
      if (matched) setCurrentTargetBlock({ type: matched.type || 'image', area: matched.position, text: matched.content, targetId: matched.id, targetName: matched.name })
    }
    fileInputRef.current?.click()
    setShowContextMenu(false)
  }

  // 直接针对指定的图/表块触发上传（与右键一致）
  const uploadForAnnotation = (ann) => {
    if (!ann || !ann.position) return
    setCurrentTargetBlock({
      type: ann.type || 'image',
      area: ann.position,
      text: ann.content,
      targetId: ann.id,
      targetName: ann.name
    })
    fileInputRef.current?.click()
    setShowContextMenu(false)
  }

  // 处理文件上传
  const handleFileUpload = async (event) => {
    const uploadedFile = event.target.files[0]
    if (!uploadedFile) return

    setUploadStatus({ type: 'uploading', message: '正在上传文件...' })

    try {
      // 模拟文件上传过程
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      // 强制上传成功（取消失败的可能性）
      const isSuccess = true
      
      if (isSuccess) {
        const isVideo = (uploadedFile.type && uploadedFile.type.startsWith('video/')) || /\.(mp4|webm|ogg|mov|m4v)$/i.test(uploadedFile.name || '')
        const isImage = (uploadedFile.type && uploadedFile.type.startsWith('image/')) || /\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(uploadedFile.name || '')
        const isAudio = (uploadedFile.type && uploadedFile.type.startsWith('audio/')) || /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(uploadedFile.name || '')
        const is3DModel = /\.(obj|fbx|gltf|glb|dae|ply|stl)$/i.test(uploadedFile.name || '')
        
        console.log('文件类型检测结果:', {
          fileName: uploadedFile.name,
          fileType: uploadedFile.type,
          isVideo,
          isImage,
          isAudio,
          is3DModel
        })
        
        const newAttachment = {
          id: `attachment_${Date.now()}`,
          pageNumber,
          area: (currentTargetBlock?.area || selectedArea),
          fileName: uploadedFile.name,
          fileSize: uploadedFile.size,
          fileType: uploadedFile.type,
          file: uploadedFile, // 保存原始文件对象
          uploadedAt: new Date().toISOString(),
          targetType: currentTargetBlock?.type || 'image',
          targetText: currentTargetBlock?.text,
          targetId: currentTargetBlock?.targetId,
          targetName: currentTargetBlock?.targetName,
          selectedFileType, // 记录用户选择的文件类型
          isVideo,
          isImage,
          isAudio,
          is3DModel,
          videoUrl: isVideo ? URL.createObjectURL(uploadedFile) : undefined,
          imageUrl: isImage ? URL.createObjectURL(uploadedFile) : undefined,
          audioUrl: isAudio ? URL.createObjectURL(uploadedFile) : undefined,
          modelUrl: is3DModel ? URL.createObjectURL(uploadedFile) : undefined
        }
        
        setAttachments(prev => {
          const updated = [...prev, newAttachment]
          console.log('新附件已添加:', newAttachment)
          console.log('所有附件列表:', updated)
          return updated
        })
        setUploadStatus({ 
          type: 'success', 
          message: `文件 "${uploadedFile.name}" 上传成功！` 
        })
      } else {
        setUploadStatus({ 
          type: 'error', 
          message: '上传失败，请重试' 
        })
      }
    } catch (error) {
      setUploadStatus({ 
        type: 'error', 
        message: '上传过程中发生错误' 
      })
    }

    // 3秒后清除状态提示
    setTimeout(() => {
      setUploadStatus(null)
    }, 3000)

    // 重置文件输入
    event.target.value = ''
  }

  // 切换视频播放状态
  const toggleVideoPlay = (attId) => {
    const el = videoRefs.current[attId]
    if (!el) return
    if (el.paused) {
      // 暂停其它视频
      Object.entries(videoRefs.current).forEach(([id, v]) => {
        if (id !== attId && v && !v.paused) v.pause()
      })
      el.play()
      setVideoStates(prev => ({ 
        ...prev, 
        [attId]: { 
          ...prev[attId], 
          playing: true,
          hasStarted: true,
          playbackRate: prev[attId]?.playbackRate || 1,
          isFullscreen: prev[attId]?.isFullscreen || false
        } 
      }))
    } else {
      el.pause()
      setVideoStates(prev => ({ 
        ...prev, 
        [attId]: { 
          ...prev[attId], 
          playing: false
        } 
      }))
    }
  }

  // 播放/暂停视频（用于控制按钮）
  const handleVideoPlayPause = (attId) => {
    toggleVideoPlay(attId)
  }

  // 改变视频播放速度
  const handleVideoSpeedChange = (attId, speed) => {
    const el = videoRefs.current[attId]
    if (!el) return
    
    el.playbackRate = speed
    setVideoStates(prev => ({ 
      ...prev, 
      [attId]: { 
        ...prev[attId], 
        playbackRate: speed
      } 
    }))
  }

  // 全屏功能
  const handleVideoFullscreen = (attId) => {
    const el = videoRefs.current[attId]
    if (!el) return
    
    if (!document.fullscreenElement) {
      // 进入全屏
      el.requestFullscreen().then(() => {
        setVideoStates(prev => ({ 
          ...prev, 
          [attId]: { 
            ...prev[attId], 
            isFullscreen: true
          } 
        }))
      }).catch(err => {
        console.error('进入全屏失败:', err)
      })
    } else {
      // 退出全屏
      document.exitFullscreen().then(() => {
        setVideoStates(prev => ({ 
          ...prev, 
          [attId]: { 
            ...prev[attId], 
            isFullscreen: false
          } 
        }))
      }).catch(err => {
        console.error('退出全屏失败:', err)
      })
    }
  }

  // 切换音频播放状态
  const toggleAudioPlay = (attId) => {
    const el = audioRefs.current[attId]
    console.log('toggleAudioPlay 调用:', { attId, el, paused: el?.paused })
    if (!el) {
      console.error('音频元素不存在:', attId)
      return
    }
    if (el.paused) {
      // 暂停其它音频
      Object.entries(audioRefs.current).forEach(([id, a]) => {
        if (id !== attId && a && !a.paused) {
          console.log('暂停其他音频:', id)
          a.pause()
        }
      })
      console.log('播放音频:', attId)
      el.play().then(() => {
        console.log('音频播放成功:', attId)
        setAudioStates(prev => ({ 
          ...prev, 
          [attId]: { 
            ...prev[attId], 
            playing: true, 
            hasStarted: true 
          } 
        }))
      }).catch(e => {
        console.error('音频播放失败:', attId, e)
        setAudioStates(prev => ({ 
          ...prev, 
          [attId]: { 
            ...prev[attId], 
            playing: false 
          } 
        }))
      })
    } else {
      console.log('暂停音频:', attId)
      el.pause()
      setAudioStates(prev => ({ 
        ...prev, 
        [attId]: { 
          ...prev[attId], 
          playing: false 
        } 
      }))
    }
  }

  // 处理音频进度条拖拽
  const handleAudioProgressChange = (attId, newTime) => {
    const el = audioRefs.current[attId]
    if (el) {
      el.currentTime = newTime
      setAudioStates(prev => ({ 
        ...prev, 
        [attId]: { 
          ...prev[attId], 
          currentTime: newTime 
        } 
      }))
    }
  }

  // 处理视频进度条拖拽
  const handleVideoProgressChange = (attId, newTime) => {
    const video = videoRefs.current[attId]
    if (!video) return
    
    video.currentTime = newTime
    setVideoStates(prev => ({ 
      ...prev, 
      [attId]: { 
        ...prev[attId], 
        currentTime: newTime 
      } 
    }))
  }

  // 格式化时间显示
  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }


  // 切换图片铺放模式（cover/contain）
  const toggleImageFit = (attId) => {
    setImageStates(prev => ({
      ...prev,
      [attId]: { fit: prev[attId]?.fit === 'contain' ? 'cover' : 'contain' }
    }))
  }

  // 组件卸载时释放视频URL
  // 附件引用保存，用于卸载时释放URL
  useEffect(() => { attachmentsRef.current = attachments }, [attachments])
  useEffect(() => {
    return () => {
      try {
        (attachmentsRef.current || []).forEach(a => {
          if (a.videoUrl) URL.revokeObjectURL(a.videoUrl)
          if (a.imageUrl) URL.revokeObjectURL(a.imageUrl)
        })
      } catch (e) { /* noop */ }
    }
  }, [])

  // 关联图片到当前选择区域 - 已移除，不再需要
  const associateImage = () => {
    // 此功能已移除，不再需要单独的关联图片选项
    console.log('关联图片功能已移除')
  }

  // 移除关联的图片
  const removeAssociatedImage = (imageId) => {
    setAssociatedImages(prev => prev.filter(img => img.id !== imageId))
  }

  // 删除附件
  const deleteAttachment = (attachmentId) => {
    setAttachments(prev => {
      const att = prev.find(a => a.id === attachmentId)
      try {
        if (att?.videoUrl) URL.revokeObjectURL(att.videoUrl)
        if (att?.imageUrl) URL.revokeObjectURL(att.imageUrl)
      } catch (e) { /* noop */ }
      return prev.filter(a => a.id !== attachmentId)
    })
    setVideoStates(prev => { const { [attachmentId]: _omit, ...rest } = prev; return rest })
    setImageStates(prev => { const { [attachmentId]: _omit, ...rest } = prev; return rest })
  }

  // 隐藏/显示附件
  const toggleAttachmentVisibility = (attachmentId) => {
    setAttachments(prev => prev.map(a => a.id === attachmentId ? { ...a, hidden: !a.hidden } : a))
  }

  // 计算文件的SHA256校验值
  const calculateSHA256 = async (file) => {
    const buffer = await file.arrayBuffer()
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    return hashHex
  }

  // 根据targetId从lpBlocksByPage中查找对应的bboxid
  const findBboxIdByTargetId = (targetId, pageNumber) => {
    if (!lpBlocksByPage || !targetId) return null
    
    const pageKey = String(pageNumber)
    const pageBlocks = lpBlocksByPage[pageKey] || lpBlocksByPage[pageNumber]
    
    if (!pageBlocks || !Array.isArray(pageBlocks)) return null
    
    // 查找匹配的bbox
    const matchedBbox = pageBlocks.find(block => block.id === targetId)
    
    if (matchedBbox && matchedBbox.bboxid) {
      console.log('找到匹配的bbox:', { targetId, bboxid: matchedBbox.bboxid })
      return matchedBbox.bboxid
    }
    
    console.warn('未找到匹配的bboxid:', { targetId, pageNumber })
    return null
  }

  // 根据bbox ID加载多媒体文件
  const loadMultimediasByBboxId = async (bboxId) => {
    try {
      console.log('加载bbox多媒体文件，ID:', bboxId)
      const response = await fetch(`http://124.222.201.87:8080/api/v1/multimedias/bbox/${bboxId}`)
      
      if (!response.ok) {
        throw new Error(`获取多媒体文件失败: ${response.status}`)
      }
      
      const data = await response.json()
      const multimedias = data.data.filter(multimedia => multimedia.status === 'completed') || []

      
      console.log('获取到的多媒体文件:', multimedias)
      
      if (multimedias.length === 0) {
        console.log('该bbox没有多媒体文件')
        return []
      }
      
      // 为每个多媒体文件创建附件对象
      const newAttachments = []
      for (const multimedia of multimedias) {
        try {
          // 下载文件
          console.log('下载文件:', multimedia.path)
          const getBucketFromType = (fileType) => {
            if (fileType.includes('image')) {
              return 'images'
            } else if (fileType.includes('video')) {
              return 'videos'
            } else if (fileType.includes('audio')) {
              return 'audios'
            } else if (fileType.includes('3d')) {
              return 'models'
            } else {
              return 'others'
            }
          }
          const fileResponse = await fetch(`http://124.222.201.87:8080/api/v1/file-upload/download/${multimedia.path}?bucket=${getBucketFromType(multimedia.type)}`)
          
          if (!fileResponse.ok) {
            console.warn('文件下载失败:', multimedia.path)
            continue
          }
          
          const blob = await fileResponse.blob()
          const file = new File([blob], multimedia.path.split('/').pop() || 'multimedia', { type: multimedia.type })
          
          // 根据bbox_id找到对应的bbox信息来获取正确的位置和尺寸
          let bboxInfo = null
          if (lpBlocksByPage) {
            const pageKey = String(pageNumber)
            const pageBlocks = lpBlocksByPage[pageKey] || lpBlocksByPage[pageNumber]
            if (pageBlocks && Array.isArray(pageBlocks)) {
              console.log('查找bbox信息:', {
                multimedia_bbox_id: multimedia.bbox_id,
                pageBlocks: pageBlocks.map(block => ({ id: block.id, bboxid: block.bboxid, type: block.type }))
              })
              bboxInfo = pageBlocks.find(block => block.bboxid === multimedia.bbox_id)
              console.log('找到的bbox信息:', bboxInfo)
            } else {
              console.warn('页面blocks为空或不是数组:', pageBlocks)
            }
          } else {
            console.warn('lpBlocksByPage为空')
          }

          // 生成更友好的文件名
          const friendlyFileName = `multimedia_${multimedia.id}.${multimedia.type.includes('image') ? 'jpg' : 
                                 multimedia.type.includes('video') ? 'mp4' : 
                                 multimedia.type.includes('audio') ? 'mp3' : 'file'}`
          
          // 将PDF坐标转换为页面像素坐标
          let convertedArea = { x: 0, y: 0, width: 200, height: 150 } // 默认尺寸
          
          if (bboxInfo && bboxInfo.bbox && Array.isArray(bboxInfo.bbox) && bboxInfo.bbox.length >= 4) {
            // 使用与主坐标转换逻辑相同的参数
            // 这些参数应该与parsedByPage中使用的参数保持一致
            const sX = 0.86  // 与主逻辑保持一致
            const sY = 0.86  // 与主逻辑保持一致
            
            // 获取页面偏移量 - 需要从当前页面元素获取
            let offsetX = 0, offsetY = 0
            
            // 尝试从页面元素获取偏移量
            const pageElement = pageWrapperRef.current?.querySelector(`[data-page-number="${pageNumber}"]`)
            if (pageElement) {
              const pageRect = pageElement.getBoundingClientRect()
              const wrapperRect = pageWrapperRef.current?.getBoundingClientRect()
              if (pageRect && wrapperRect) {
                offsetX = pageRect.left - wrapperRect.left
                offsetY = pageRect.top - wrapperRect.top
              }
            }
            
            // PDF坐标 [x1, y1, x2, y2] 转换为页面像素坐标
            const x1 = bboxInfo.bbox[0] // Xmin
            const y1 = bboxInfo.bbox[1] // Ymin
            const x2 = bboxInfo.bbox[2] // Xmax
            const y2 = bboxInfo.bbox[3] // Ymax
            
            const pxX = offsetX + x1 * sX
            const pxY = offsetY + y1 * sY
            const pxW = Math.max(1, (x2 - x1) * sX)
            const pxH = Math.max(1, (y2 - y1) * sY)
            
            // 应用bbox调整参数
            const scaledPosition = adjustRectWithTuning({ x: pxX, y: pxY, width: pxW, height: pxH }, bboxTuning)
            
            convertedArea = {
              x: Math.round(scaledPosition.x),
              y: Math.round(scaledPosition.y),
              width: Math.round(scaledPosition.width),
              height: Math.round(scaledPosition.height)
            }
            
            console.log('坐标转换:', {
              originalBbox: bboxInfo.bbox,
              convertedArea: convertedArea,
              scale: { x: sX, y: sY },
              offset: { x: offsetX, y: offsetY }
            })
          }
          
          // 创建附件对象
          const attachment = {
            id: `loaded_${multimedia.id}_${Date.now()}`,
            pageNumber: pageNumber,
            area: convertedArea,
            fileName: friendlyFileName,
            fileSize: file.size,
            fileType: multimedia.type,
            file: file,
            uploadedAt: multimedia.created_at,
            targetType: bboxInfo?.type || 'image',
            targetId: bboxInfo?.id || multimedia.bbox_id.toString(),
            targetName: bboxInfo?.name || null,
            selectedFileType: multimedia.type.includes('image') ? 'image' : 
                            multimedia.type.includes('video') ? 'video' :
                            multimedia.type.includes('audio') ? 'audio' : 'image',
            isVideo: multimedia.type.includes('video'),
            isImage: multimedia.type.includes('image'),
            isAudio: multimedia.type.includes('audio'),
            is3DModel: multimedia.type.includes('3d') || multimedia.type.includes('model'),
            videoUrl: multimedia.type.includes('video') ? URL.createObjectURL(file) : undefined,
            imageUrl: multimedia.type.includes('image') ? URL.createObjectURL(file) : undefined,
            audioUrl: multimedia.type.includes('audio') ? URL.createObjectURL(file) : undefined,
            modelUrl: (multimedia.type.includes('3d') || multimedia.type.includes('model')) ? URL.createObjectURL(file) : undefined,
            loaded: true, // 标记为从服务器加载的
            multimediaId: multimedia.id
          }
          
          newAttachments.push(attachment)
          console.log('创建加载的附件:', attachment)
          
        } catch (error) {
          console.error('处理多媒体文件失败:', multimedia, error)
        }
      }
      
      return newAttachments
      
    } catch (error) {
      console.error('加载多媒体文件失败:', error)
      return []
    }
  }

  // 保存所有多媒体文件
  const saveMultimedias = async () => {
    if (attachments.length === 0) {
      alert('没有要保存的多媒体文件')
      return
    }

    setSavingMultimedias(true)
    try {
      console.log('开始保存多媒体文件，数量:', attachments.length)
      
      // 为每个附件创建多媒体记录并上传文件
      for (const attachment of attachments) {
        console.log('检查附件:', {
          id: attachment.id,
          targetId: attachment.targetId,
          hasFile: !!attachment.file,
          fileType: attachment.fileType,
          fileName: attachment.fileName
        })
        
        if (!attachment.file || !attachment.targetId) {
          console.warn('跳过无效附件:', {
            id: attachment.id,
            hasFile: !!attachment.file,
            targetId: attachment.targetId,
            fileName: attachment.fileName
          })
          continue
        }

        // 计算文件校验值
        const checksum = await calculateSHA256(attachment.file)
        
        // 查找对应的bboxid
        const bboxId = findBboxIdByTargetId(attachment.targetId, attachment.pageNumber)
        if (!bboxId) {
          console.warn('无法找到对应的bboxid，跳过附件:', attachment)
          continue
        }
        
        // 构建多媒体记录
        const multimediaData = {
          type: attachment.isVideo ? 'video' : attachment.isAudio ? 'audio' : attachment.is3D ? '3d' : 'image',
          path: `${checksum}/${attachment.fileName}`, 
          size: attachment.file.size,
          checksum: checksum,
          status: 'pending',
          user_id: 0,
          bbox_id: bboxId // 使用从API获取的bboxid
        }

        console.log('创建多媒体记录:', multimediaData)

        // 1. 创建多媒体记录
        const createResponse = await fetch('http://124.222.201.87:8080/api/v1/multimedias', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(multimediaData)
        })

        if (!createResponse.ok) {
          throw new Error(`创建多媒体记录失败: ${createResponse.status}`)
        }

        const createData = await createResponse.json()
        const multimediaId = createData.data.id

        console.log('多媒体记录创建成功，ID:', multimediaId)

        // 2. 上传文件到OSS
        const uploadFormData = new FormData()
        uploadFormData.append('file', attachment.file)
        uploadFormData.append('user_id', '0')
        uploadFormData.append('path', checksum)
        
        const getBucketFromType = (fileType) => {
          if (fileType.includes('image')) {
            return 'images'
          } else if (fileType.includes('video')) {
            return 'videos'
          } else if (fileType.includes('audio')) {
            return 'audios'
          } else if (fileType.includes('3d')) {
            return 'models'
          } else {
            return 'others'
          }
        }
        
        uploadFormData.append('bucket', getBucketFromType(attachment.fileType))

        const uploadResponse = await fetch('http://124.222.201.87:8080/api/v1/file-upload/from-form', {
          method: 'POST',
          body: uploadFormData
        })

        if (!uploadResponse.ok) {
          throw new Error(`文件上传失败: ${uploadResponse.status}`)
        }

        const uploadData = await uploadResponse.json()
        console.log('文件上传成功:', uploadData)

        // 3. 更新多媒体记录状态为completed
        const updateData = {
          ...multimediaData,
          path: multimediaData.path, // 保持原有的path格式：checksum/filename
          status: 'completed'
        }

        const updateResponse = await fetch(`http://124.222.201.87:8080/api/v1/multimedias/${multimediaId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(updateData)
        })

        if (!updateResponse.ok) {
          throw new Error(`更新多媒体记录失败: ${updateResponse.status}`)
        }

        console.log('多媒体记录更新成功:', multimediaId)
      }

      alert('所有多媒体文件保存成功！')
      console.log('所有多媒体文件保存完成')
      
      // 保存成功后，标记附件为已保存状态，而不是清除
      setAttachments(prev => prev.map(attachment => ({
        ...attachment,
        saved: true,
        savedAt: new Date().toISOString()
      })))

    } catch (error) {
      console.error('保存多媒体文件失败:', error)
      alert(`保存失败: ${error.message}`)
    } finally {
      setSavingMultimedias(false)
    }
  }

  // 清除所有多媒体文件（只清除未保存的）
  const clearAllMultimedias = () => {
    const unsavedAttachments = attachments.filter(att => !att.saved && !att.loaded)
    const savedAttachments = attachments.filter(att => att.saved || att.loaded)
    
    if (unsavedAttachments.length === 0) {
      alert('没有要清除的未保存多媒体文件')
      return
    }

    if (confirm(`确定要清除 ${unsavedAttachments.length} 个未保存的多媒体文件吗？\n（已保存的 ${savedAttachments.length} 个文件将保留）`)) {
      // 清理URL对象（只清理未保存的）
      unsavedAttachments.forEach(attachment => {
        if (attachment.videoUrl) URL.revokeObjectURL(attachment.videoUrl)
        if (attachment.imageUrl) URL.revokeObjectURL(attachment.imageUrl)
        if (attachment.audioUrl) URL.revokeObjectURL(attachment.audioUrl)
      })

      // 只保留已保存的附件
      setAttachments(savedAttachments)
      console.log(`已清除 ${unsavedAttachments.length} 个未保存的多媒体文件，保留了 ${savedAttachments.length} 个已保存的文件`)
    }
  }


  // 处理操作菜单点击函数已移除，现在使用直接的显示/隐藏和删除按钮

  // 点击页面其他地方关闭菜单
  useEffect(() => {
    const handleClickOutside = () => {
      closeContextMenu()
      setShowFileTypeMenu(false)
    }
    
    if (showContextMenu || showFileTypeMenu) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [showContextMenu, showFileTypeMenu])

  // 用于跟踪当前处理的文件，避免重复请求
  const currentProcessingFileRef = useRef(null)

  useEffect(() => {
    setPdfFile(file || null)
  }, [file])

    useEffect(() => {
    console.log('KDF Viewer useEffect触发，文件:', pdfFile?.name)
    setError(null)
    setPageNumber(1)
    setPageScale(1) // 重置缩放比例
    setContentDimensions({ width: 'auto', height: 'auto' }) // 重置内容尺寸
    setAttachments([])
    setAssociatedImages([]) // 重置关联图片
    setParsedByPage({})
    setLpBlocksByPage(null)
    setLpParsing(false)
    setLpError(null)

    if (!pdfFile) {
      setLoading(false)
      currentProcessingFileRef.current = null
      return
    }

    setLoading(true)

    console.log('文件检查 - PDF大小:', pdfFile.size, '类型:', pdfFile.type)

    if (pdfFile.type !== 'application/pdf') {
      setError('文件类型不是PDF，请选择正确的PDF文件')
      setLoading(false)
      return
    }

    if (pdfFile.size === 0) {
      setError('文件为空，请选择有效的PDF文件')
      setLoading(false)
      return
    }

    const fileId = `${pdfFile.name}-${pdfFile.size}-${pdfFile.lastModified ?? 'no-last-modified'}`

    if (currentProcessingFileRef.current === fileId) {
      console.log('文件已在处理中，跳过重复请求')
      setLoading(false)
      return
    }

    currentProcessingFileRef.current = fileId

    ;(async () => {
      try {
        setLpParsing(true)
        setLpError(null)
        const fd = new FormData()
        fd.append('files', pdfFile)
        fd.append('return_content_list', 'true')
        fd.append('return_md', 'false')
        fd.append('return_layout', 'false')
        fd.append('return_middle_json', 'false')
        fd.append('return_model_output', 'false')

        console.log('发送本地解析请求，文件ID:', fileId)
        const resp = await fetch('http://127.0.0.1:8081/api/file_parse', { method: 'POST', body: fd })

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}))
          throw new Error(err?.detail || `后端解析失败(${resp.status})`)
        }
        const data = await resp.json()
        console.log('本地解析请求成功，文件ID:', fileId, data)
        setLpBlocksByPage(data?.blocksByPage || {})
      } catch (e) {
        console.error('本地解析失败:', e)
        setLpError(String(e?.message || e))
      } finally {
        setLpParsing(false)
        if (currentProcessingFileRef.current === fileId) {
          currentProcessingFileRef.current = null
        }
      }
    })()
  }, [pdfFile])

  // 当页面改变时重置缩放比例和内容尺寸
  useEffect(() => {
    setPageScale(1)
    setContentDimensions({ width: 'auto', height: 'auto' })
  }, [pageNumber])

  // 当缩放变化时，根据基础尺寸更新内容尺寸
  useEffect(() => {
    const base = basePageSize[pageNumber]
    if (base?.width && base?.height) {
      setContentDimensions({
        width: Math.round(base.width * pageScale),
        height: Math.round(base.height * pageScale)
      })
    }
  }, [pageScale, pageNumber, basePageSize])

  // 当页面或bbox数据变化时，加载多媒体文件
  useEffect(() => {
    const loadPageMultimedias = async () => {
      if (!lpBlocksByPage || !pageNumber) return
      
      const pageKey = String(pageNumber)
      const pageBlocks = lpBlocksByPage[pageKey] || lpBlocksByPage[pageNumber]
      
      if (!pageBlocks || !Array.isArray(pageBlocks)) return
      
      setLoadingMultimedias(true)
      console.log('开始加载页面多媒体文件，页数:', pageNumber)
      
      try {
        // 获取当前页面的所有bbox ID
        const bboxIds = pageBlocks.map(block => block.bboxid).filter(id => id)
        
        if (bboxIds.length === 0) {
          console.log('当前页面没有bbox ID')
          return
        }
        
        console.log('当前页面的bbox IDs:', bboxIds)
        
        // 为每个bbox加载多媒体文件
        const allLoadedAttachments = []
        for (const bboxId of bboxIds) {
          const attachments = await loadMultimediasByBboxId(bboxId)
          allLoadedAttachments.push(...attachments)
        }
        
        // 过滤掉已经存在的附件（避免重复）
        setAttachments(prev => {
          const existingIds = new Set(prev.map(att => att.multimediaId).filter(id => id))
          const newAttachments = allLoadedAttachments.filter(att => !existingIds.has(att.multimediaId))
          
          if (newAttachments.length > 0) {
            console.log('添加新的加载附件:', newAttachments)
            return [...prev, ...newAttachments]
          }
          
          return prev
        })
        
      } catch (error) {
        console.error('加载页面多媒体文件失败:', error)
      } finally {
        setLoadingMultimedias(false)
      }
    }
    
    loadPageMultimedias()
  }, [pageNumber, lpBlocksByPage])

  // 解析当前页（优先使用后端 LayoutParser + PubLayNet 结果）
  useEffect(() => {
    const parseCurrentPage = async () => {
      if (!pdfDoc || !pageNumber) return
      try {
        const page = await pdfDoc.getPage(pageNumber)
        
        // 使用CropBox的viewport，确保坐标系一致
        const viewport = page.getViewport({ scale: 1.0, useCropBox: true })

        // 如果已有后端解析结果，则直接映射为容器像素坐标并返回
        const pageKey = String(pageNumber)
        const lpBlocks = lpBlocksByPage && (lpBlocksByPage[pageKey] || lpBlocksByPage[pageNumber])
        console.log('后端数据检查:', {
          lpBlocksByPage: lpBlocksByPage,
          pageKey,
          pageNumber,
          lpBlocks: lpBlocks,
          lpBlocksLength: lpBlocks ? lpBlocks.length : 'null'
        })
        if (lpBlocks && Array.isArray(lpBlocks)) {
          // 定位页面在容器内的偏移
          console.log("using backend results...")
          await new Promise(resolve => requestAnimationFrame(resolve))

          const wrapperRect = pageWrapperRef.current?.getBoundingClientRect()
          const pdfPageElement = pageWrapperRef.current?.querySelector('.react-pdf__Page')
          const canvasLayer = pdfPageElement?.querySelector('.react-pdf__Page__canvas')
          const canvasRect = canvasLayer?.getBoundingClientRect()
          const textLayer = pdfPageElement?.querySelector('.react-pdf__Page__textContent')
          const textRect = textLayer?.getBoundingClientRect()
          const annotationLayer = pdfPageElement?.querySelector('.react-pdf__Page__annotations')
          const annotationRect = annotationLayer?.getBoundingClientRect()
          const pageRect = pdfPageElement?.getBoundingClientRect()

          const contentRect = canvasRect || textRect || annotationRect || pageRect

          // 调试信息：显示偏移计算过程
          console.log('偏移计算调试:', {
            wrapperRect: wrapperRect ? { left: wrapperRect.left, top: wrapperRect.top, width: wrapperRect.width, height: wrapperRect.height } : 'null',
            pageRect: pageRect ? { left: pageRect.left, top: pageRect.top, width: pageRect.width, height: pageRect.height } : 'null',
            canvasRect: canvasRect ? { left: canvasRect.left, top: canvasRect.top, width: canvasRect.width, height: canvasRect.height } : 'null',
            textRect: textRect ? { left: textRect.left, top: textRect.top, width: textRect.width, height: textRect.height } : 'null',
            contentRect: contentRect ? { left: contentRect.left, top: contentRect.top, width: contentRect.width, height: contentRect.height } : 'null',
            calculatedOffset: { x: contentRect && wrapperRect ? (contentRect.left - wrapperRect.left) : 0, y: contentRect && wrapperRect ? (contentRect.top - wrapperRect.top) : 0 }
          })

          // 尝试多种偏移计算方法
          let offsetX = 0, offsetY = 0

          if (contentRect && wrapperRect) {
            // 方法1：使用getBoundingClientRect差值
            offsetX = contentRect.left - wrapperRect.left
            offsetY = contentRect.top - wrapperRect.top
            console.log('方法1 - getBoundingClientRect差值:', { offsetX, offsetY })
          }

          // 方法2：检查是否有CSS变换或边距影响
          const computedStyle = pdfPageElement ? window.getComputedStyle(pdfPageElement) : null
          if (computedStyle) {
            const marginLeft = parseFloat(computedStyle.marginLeft) || 0
            const marginTop = parseFloat(computedStyle.marginTop) || 0
            const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0
            const paddingTop = parseFloat(computedStyle.paddingTop) || 0
            
            console.log('CSS样式信息:', {
              marginLeft, marginTop, paddingLeft, paddingTop,
              transform: computedStyle.transform,
              position: computedStyle.position
            })
            
            // 如果偏移看起来异常，尝试使用CSS值
            if (Math.abs(offsetX) > 100 || Math.abs(offsetY) > 100) {
              offsetX = marginLeft + paddingLeft
              offsetY = marginTop + paddingTop
              console.log('方法2 - 使用CSS值:', { offsetX, offsetY })
            }
          }
          
          // 方法3：如果前两种方法都失败，使用0偏移
          if (isNaN(offsetX) || isNaN(offsetY)) {
            offsetX = 0
            offsetY = 0
            console.log('方法3 - 使用0偏移')
          }
          
          // 应用手动调整偏移
          const finalOffsetX = offsetX + manualOffset.x
          const finalOffsetY = offsetY + manualOffset.y
          
          console.log('偏移计算完成:', {
            calculatedOffset: { offsetX, offsetY },
            manualAdjustment: manualOffset,
            finalOffset: { x: finalOffsetX, y: finalOffsetY }
          })
          
          // 更新变量名以使用最终偏移值
          offsetX = finalOffsetX
          offsetY = finalOffsetY

          // 记录基础尺寸，便于调试边界框
          setBasePageSize(prev => ({ ...prev, [pageNumber]: { width: viewport.width, height: viewport.height } }))

          // 重新设计：以PDF页面实际渲染尺寸为基准
          const effectiveScale = usePageScale ? (pageScale || 1) : 1
          const pdfRenderWidth = contentRect?.width || (viewport.width * effectiveScale)
          const pdfRenderHeight = contentRect?.height || (viewport.height * effectiveScale)

          const targetWidth = Math.max(1, pdfRenderWidth)
          const targetHeight = Math.max(1, pdfRenderHeight)
          const sourceInfo = resolveSourceSize({
            blocks: lpBlocks,
            viewport,
            method: coordinateMethod
          })

          let sX = targetWidth / Math.max(1, sourceInfo.width)
          let sY = targetHeight / Math.max(1, sourceInfo.height)

          if (sourceInfo.basis === 'bbox_extents') {
            const ratio = Math.max(sX, sY) / Math.max(1e-6, Math.min(sX, sY))
            if (ratio > 1.2) {
              const uniformScale = Math.min(sX, sY)
              console.log('bbox尺度差异过大，采用统一缩放', { sX, sY, uniformScale, sourceInfo, targetSize: { width: targetWidth, height: targetHeight } })
              sX = uniformScale
              sY = uniformScale
            }
          }
          sX = sY = 0.86
          console.log('坐标转换准备:', {
            pageNumber,
            source: sourceInfo,
            targetSize: { width: targetWidth, height: targetHeight },
            scale: { x: sX, y: sY },
            offset: { x: offsetX, y: offsetY }
          })

          const mapType = (t) => {
            const k = (t || '').toLowerCase()
            if (k === 'table') return 'table'
            if (k === 'figure' || k === 'image' || k === 'graphic') return 'image'
            return 'text'
          }

          const annsRaw = (lpBlocks || []).map((b, idx) => {
            const [x1, y1, x2, y2] = b.bbox || [0, 0, 0, 0]
            const dx = (x2 - x1)
            const dy = (y2 - y1)
            // 坐标转换：bbox -> PDF渲染坐标
            // 直接映射到PDF页面的渲染坐标系统
            const pxX = offsetX + x1 * sX
            const pxY = offsetY + y1 * sY
            const pxW = Math.max(1, dx * sX)
            const pxH = Math.max(1, dy * sY)
            const scaledPosition = adjustRectWithTuning({ x: pxX, y: pxY, width: pxW, height: pxH }, bboxTuning)

            // 调试信息：显示前几个框的坐标转换过程
            if (idx < 3) {
              console.log(`框 ${idx + 1} 坐标转换:`, {
                originalBbox: [x1, y1, x2, y2],
                scale: { x: sX, y: sY },
                offset: { x: offsetX, y: offsetY },
                finalPosition: {
                  x: Math.round(scaledPosition.x),
                  y: Math.round(scaledPosition.y),
                  width: Math.round(scaledPosition.width),
                  height: Math.round(scaledPosition.height)
                },
                note: 'bbox -> PDF渲染坐标 (直接映射)'
              })
            }

            return {
              id: b.id || `${mapType(b.type)}_${pageNumber}_${idx + 1}`,
              type: mapType(b.type),
              page: pageNumber,
              score: typeof b.score === 'number' ? b.score : undefined,
              position: {
                x: Math.round(scaledPosition.x),
                y: Math.round(scaledPosition.y),
                width: Math.round(scaledPosition.width),
                height: Math.round(scaledPosition.height)
              }
            }
          })

          const anns = annsRaw.filter(a => !a.id.startsWith('text'))

          console.log('边界框渲染结果:', {
            pageNumber,
            annsCount: anns.length,
            firstFewAnns: anns.slice(0, 3).map(a => ({
              id: a.id,
              type: a.type,
              position: a.position
            }))
          })
          
          setParsedByPage(prev => ({ ...prev, [pageNumber]: anns }))
          return // 重要：已使用后端结果，跳过本地解析流程
        }

        // 尝试获取CropBox/MediaBox偏移（不同pdfjs版本可能没有这些API）
        let cropOffsetX = 0
        let cropOffsetY = 0
        try {
          // @ts-ignore 运行时检测
          if (typeof page.getCropBox === 'function' && typeof page.getMediaBox === 'function') {
            const cropBox = page.getCropBox()
            const mediaBox = page.getMediaBox()
            cropOffsetX = (cropBox?.x || 0) - (mediaBox?.x || 0)
            cropOffsetY = (cropBox?.y || 0) - (mediaBox?.y || 0)
            console.log('CropBox偏移:', { cropOffsetX, cropOffsetY })
            console.log('MediaBox尺寸:', mediaBox?.width, 'x', mediaBox?.height)
            console.log('CropBox尺寸:', cropBox?.width, 'x', cropBox?.height)
          } else {
            const view = page.view || [0, 0, viewport.width, viewport.height]
            console.log('PDF页面view(无getCropBox API):', view)
          }
        } catch (e) {
          console.warn('获取CropBox/MediaBox失败，使用偏移0:', e)
          cropOffsetX = 0
          cropOffsetY = 0
        }
        // 提前记录基础尺寸，避免后续步骤异常时影响调试边界显示
        setBasePageSize(prev => ({ ...prev, [pageNumber]: { width: viewport.width, height: viewport.height } }))

        // 文本收集（本地回退逻辑；默认不会走到这里）
        const textContent = await page.getTextContent()
        const textItems = []
        textContent.items.forEach((item, index) => {
          if (item.str !== undefined) {
            // 步骤1：将MediaBox坐标转换为CropBox坐标
            const mediaX = item.transform[4] || 0
            const mediaY = item.transform[5] || 0
            
            // 转换为CropBox坐标系
            const cropX = mediaX - cropOffsetX
            const cropY = mediaY - cropOffsetY
            
            // 转换为浏览器坐标系（Y轴翻转）
            const x = cropX
            const y = viewport.height - cropY
            
            textItems.push({
              index,
              content: item.str,
              x: Math.round(x * 100) / 100,
              y: Math.round(y * 100) / 100,
              width: Math.round((item.width || 0) * 100) / 100,
              height: Math.round((item.height || 0) * 100) / 100,
              fontSize: Math.round(Math.abs(item.height || 12) * 100) / 100,
              fontFamily: item.fontName || 'Arial'
            })
          }
        })
        // 排序 + 合并（与解析器相同阈值）
        textItems.sort((a, b) => {
          if (Math.abs(a.y - b.y) < 5) return a.x - b.x
          return a.y - b.y
        })
        const mergedTexts = []
        let currentGroup = null
        textItems.forEach((it) => {
          if (!currentGroup) {
            currentGroup = { ...it, items: [it] }
          } else {
            const yDiff = Math.abs(it.y - currentGroup.y)
            const xDiff = it.x - (currentGroup.x + currentGroup.width)
            if (yDiff < 10 && xDiff < 50 && xDiff > -10) {
              currentGroup.content += it.content
              currentGroup.width = Math.max(currentGroup.width, it.x + it.width - currentGroup.x)
              currentGroup.height = Math.max(currentGroup.height, it.height)
              currentGroup.items.push(it)
            } else {
              mergedTexts.push(currentGroup)
              currentGroup = { ...it, items: [it] }
            }
          }
        })
        if (currentGroup) mergedTexts.push(currentGroup)

        // 智能区域识别：仅识别图片等大区域（表格解析已禁用）
        const annotations = []
        // 统一坐标：把所有识别到的区域转换为“容器像素坐标”（相对于pageWrapperRef的绝对定位）
        const wrapperRect = pageWrapperRef.current?.getBoundingClientRect()
        const pdfPageElement = pageWrapperRef.current?.querySelector('.react-pdf__Page')
        const pageRect = pdfPageElement?.getBoundingClientRect()
        const offsetX = pageRect && wrapperRect ? (pageRect.left - wrapperRect.left) : 0
        const offsetY = pageRect && wrapperRect ? (pageRect.top - wrapperRect.top) : 0
        
        // 1. 检测表格区域（基于文本密度和布局）- 已按需求禁用，仅返回空数组
        const detectTables = (textItems) => {
          // 表格解析禁用：仅做图片定位
          return []
          const tables = []
          
          // 按Y坐标分组，识别表格行
          const rowGroups = []
          let currentRow = []
          
          textItems.forEach(item => {
            if (currentRow.length === 0) {
              currentRow = [item]
            } else {
              const avgY = currentRow.reduce((sum, i) => sum + i.y, 0) / currentRow.length
              if (Math.abs(item.y - avgY) < 15) { // 同一行
                currentRow.push(item)
              } else {
                if (currentRow.length > 2) { // 至少3个元素才算一行
                  rowGroups.push([...currentRow])
                }
                currentRow = [item]
              }
            }
          })
          if (currentRow.length > 2) {
            rowGroups.push(currentRow)
          }
          
          // 更严格的表格识别：需要规整的行列结构
          if (rowGroups.length >= 4) { // 至少4行
            const tableRows = []
            for (let i = 0; i < rowGroups.length; i++) {
              if (rowGroups[i].length >= 3) { // 放宽到每行至少3列，兼容表头
                tableRows.push(rowGroups[i])
              }
            }
            
            // 检查是否有足够多的连续表格行，且列数相对一致
            if (tableRows.length >= 3) { // 至少3行有效表格行
              const columnCounts = tableRows.map(row => row.length)
              const avgColumns = columnCounts.reduce((a, b) => a + b, 0) / columnCounts.length
              const columnVariance = columnCounts.every(count => Math.abs(count - avgColumns) <= 2) // 列数差异不超过2
              
              if (columnVariance) { // 只有列数相对一致才认为是表格
                // 计算表格边界，创建大的识别框（基于CropBox坐标系）
                const allItems = tableRows.flat()
                const minX = Math.min(...allItems.map(i => i.x))
                const maxX = Math.max(...allItems.map(i => i.x + i.width))
                const minY = Math.min(...allItems.map(i => i.y))
                const maxY = Math.max(...allItems.map(i => i.y + i.height))

                // 为表格创建更大的边距，并稍微向上扩展以纳入表头横线
                const tablePadding = 36
                let tableX = Math.max(0, minX - tablePadding)
                let tableY = Math.max(0, minY - tablePadding)
                let tableW = Math.min(viewport.width - tableX, maxX - minX + tablePadding * 2)
                let tableH = Math.min(viewport.height - tableY, maxY - minY + tablePadding * 2)
                // 基于行距的自适应外延：尽量包含上下边框
                const rowTops = tableRows.map(r => Math.min(...r.map(i => i.y))).sort((a,b)=>a-b)
                const gaps = []
                for (let k=1;k<rowTops.length;k++){ gaps.push(Math.abs(rowTops[k]-rowTops[k-1])) }
                const median = (arr)=>{ if(arr.length===0) return 0; const s=[...arr].sort((a,b)=>a-b); const m=Math.floor(s.length/2); return s.length%2?s[m]:(s[m-1]+s[m])/2 }
                const g = median(gaps) || 18
                const extendTop = Math.min(24, g)
                const extendBottom = Math.min(18, Math.round(g*0.6))
                tableY = Math.max(0, tableY - extendTop)
                tableH = Math.min(viewport.height - tableY, tableH + extendTop + extendBottom)

                // 分栏适配：判断是否位于左右某一栏
                let adjX = tableX
                let adjW = tableW
                let span = 'full'
                if (typeof colLayout !== 'undefined' && colLayout.type === 'double') {
                  const center = tableX + tableW / 2
                  const belongsRight = center > (colLayout.boundary || viewport.width / 2)
                  const [minXCol, maxXCol] = belongsRight ? colLayout.columns[1] : colLayout.columns[0]
                  const colW = Math.max(60, maxXCol - minXCol)
                  // 如果表格宽度与某列宽度相近，则认为是半页表
                  if (Math.abs(tableW - colW) < viewport.width * 0.12 || tableW < colW * 1.25) {
                    adjX = Math.max(0, minXCol - 10)
                    adjW = Math.min(viewport.width - adjX, colW + 20)
                    span = 'half'
                  }
                }
                
                // 转成容器像素坐标
                let pxX = offsetX + adjX * pageScale
                let pxY = offsetY + tableY * pageScale
                let pxW = adjW * pageScale
                let pxH = tableH * pageScale

                // 裁剪底部：若下方近邻存在以 Table/表 开头的说明行，则将底边裁到其上方
                const toPdfYLocal = (py) => (py - offsetY) / pageScale
                const toPdfXLocal = (px) => (px - offsetX) / pageScale
                const rTopPdf = toPdfYLocal(pxY)
                const rBottomPdf = toPdfYLocal(pxY + pxH)
                const rLeftPdf = toPdfXLocal(pxX)
                const rRightPdf = toPdfXLocal(pxX + pxW)
                const linesLocal = (() => {
                  const items = [...textItems].sort((a,b)=>a.y-b.y||a.x-b.x)
                  const lines = []
                  const yTol = 8
                  let cur = []
                  items.forEach(t=>{
                    if (cur.length===0) cur=[t]
                    else { const ay = cur.reduce((s,i)=>s+i.y,0)/cur.length; if (Math.abs(t.y-ay)<=yTol) cur.push(t); else {lines.push(cur); cur=[t]} }
                  })
                  if (cur.length) lines.push(cur)
                  return lines.map(items=>({ text: items.map(i=>i.content).join(''), x: Math.min(...items.map(i=>i.x)), y: Math.min(...items.map(i=>i.y)), width: Math.max(...items.map(i=>i.x+i.width)) - Math.min(...items.map(i=>i.x)), height: Math.max(...items.map(i=>i.height)) }))
                })()
                const tableRegex = /^\s*(Table|表)\s*\d+\s*[:：\.]?/i
                const cap = linesLocal.filter(l=>tableRegex.test(l.text))
                  .filter(l=> l.y >= rTopPdf && l.y <= rBottomPdf + viewport.height*0.25)
                  .filter(l=> !(l.x + l.width < rLeftPdf || l.x > rRightPdf))
                  .sort((a,b)=>a.y-b.y)
                  .reduce((best,l)=>{ if(!best) return l; return (Math.abs(l.y - rBottomPdf) < Math.abs(best.y - rBottomPdf)) ? l : best }, null)
                if (cap) {
                  const capTopPx = offsetY + cap.y * pageScale
                  pxH = Math.max(20, Math.min(pxH, capTopPx - pxY - 10))
                } else {
                  // 兜底：检测底部附近较长文本行，裁到其上方
                  const nearText = linesLocal
                    .filter(l => l.y >= rBottomPdf - viewport.height * 0.04 && l.y <= rBottomPdf + viewport.height * 0.25)
                    .filter(l => (l.text || '').trim().replace(/\s+/g,' ').length >= 16)
                    .filter(l => { const lx1=l.x,lx2=l.x+l.width; return !(lx2 < rLeftPdf || lx1 > rRightPdf) })
                    .sort((a,b)=>a.y-b.y)[0]
                  if (nearText) {
                    const tTopPx = offsetY + nearText.y * pageScale
                    pxH = Math.max(20, Math.min(pxH, tTopPx - pxY - 8))
                  }
                }
                const scaledRect = adjustRectWithTuning({ x: pxX, y: pxY, width: pxW, height: pxH }, bboxTuning)
                tables.push({
                  id: `table_${pageNumber}_0`,
                  type: 'table',
                  position: {
                    x: Math.round(scaledRect.x * 100) / 100,
                    y: Math.round(scaledRect.y * 100) / 100,
                    width: Math.round(scaledRect.width * 100) / 100,
                    height: Math.round(scaledRect.height * 100) / 100
                  },
                  content: `表格区域 (${tableRows.length}行 x ${Math.max(...tableRows.map(r => r.length))}列)`,
                  rows: tableRows.length,
                  cols: Math.max(...tableRows.map(r => r.length)),
                  span
                })
              }
            }
          }
          
          return tables
        }
        
        // 2. 检测图片区域（改进的算法：维护矩阵栈）
        const detectImages = async () => {
          const images = []
          
          try {
            const operatorList = await page.getOperatorList()
            let imageCount = 0
            let currentTransform = [1, 0, 0, 1, 0, 0]
            const transformStack = []
            // 追踪当前填充色，辅助识别“实心色块”（更稳）
            let currentFill = { space: 'unknown', value: [] }
            const fillStack = []
            // 暂存 constructPath 中的矩形，待遇到 fill/stroke 时确认
            let pendingRects = []
            
            // 简易IoU（局部使用，避免与下方全局工具耦合）
            const localIoU = (A, B) => {
              const ax2 = A.position.x + A.position.width
              const ay2 = A.position.y + A.position.height
              const bx2 = B.position.x + B.position.width
              const by2 = B.position.y + B.position.height
              const x1 = Math.max(A.position.x, B.position.x)
              const y1 = Math.max(A.position.y, B.position.y)
              const x2 = Math.min(ax2, bx2)
              const y2 = Math.min(ay2, by2)
              const w = Math.max(0, x2 - x1)
              const h = Math.max(0, y2 - y1)
              const inter = w * h
              const union = A.position.width * A.position.height + B.position.width * B.position.height - inter
              return union > 0 ? inter / union : 0
            }
            
            // 计算区域内文本覆盖度，帮助排除正文背景/大框
            const textCoverRatioInPxRect = (rx, ry, rw, rh) => {
              const items = textItems.filter(t => {
                const tx = t.x * pageScale + offsetX
                const ty = t.y * pageScale + offsetY
                const tw = (t.width || 0) * pageScale
                const th = Math.max(10, (t.height || 10) * pageScale)
                return tx + tw > rx && tx < rx + rw && ty + th > ry && ty < ry + rh
              })
              const cover = items.reduce((s, t) => s + Math.max(1, t.width) * Math.max(10, t.height), 0) * (pageScale * pageScale)
              const area = Math.max(1, rw * rh)
              return cover / area
            }
          
          for (let i = 0; i < operatorList.fnArray.length; i++) {
            const op = operatorList.fnArray[i]
            const args = operatorList.argsArray[i]
            
            if (op === pdfjs.OPS.save) {
              transformStack.push([...currentTransform])
              fillStack.push({ ...currentFill })
            } else if (op === pdfjs.OPS.restore) {
              const restored = transformStack.pop()
              if (restored) currentTransform = restored
              const f = fillStack.pop()
              if (f) currentFill = f
            } else if (op === pdfjs.OPS.transform) {
              const [a2, b2, c2, d2, e2, f2] = args
              const [a1, b1, c1, d1, e1, f1] = currentTransform
              currentTransform = [
                a1 * a2 + c1 * b2,
                b1 * a2 + d1 * b2,
                a1 * c2 + c1 * d2,
                b1 * c2 + d1 * d2,
                a1 * e2 + c1 * f2 + e1,
                b1 * e2 + d1 * f2 + f1
              ]
            } else if (op === pdfjs.OPS.setTransform) {
              const [a, b, c, d, e, f] = args
              currentTransform = [a, b, c, d, e, f]
            } else if (typeof pdfjs.OPS.setFillRGBColor !== 'undefined' && op === pdfjs.OPS.setFillRGBColor) {
              currentFill = { space: 'rgb', value: args }
            } else if (typeof pdfjs.OPS.setFillGray !== 'undefined' && op === pdfjs.OPS.setFillGray) {
              currentFill = { space: 'gray', value: args }
            } else if (typeof pdfjs.OPS.setFillCMYKColor !== 'undefined' && op === pdfjs.OPS.setFillCMYKColor) {
              currentFill = { space: 'cmyk', value: args }
            } else if (op === pdfjs.OPS.constructPath) {
              // 捕捉 constructPath 中的 rectangle；先暂存，待遇到填充/描边时确认
              try {
                const opsArr = Array.isArray(args?.[0]) ? args[0] : null
                const coordsArr = Array.isArray(args?.[1]) ? args[1] : null
                if (opsArr && coordsArr) {
                  const RECT = pdfjs.OPS.rectangle
                  const MOVE = pdfjs.OPS.moveTo
                  const LINE = pdfjs.OPS.lineTo
                  const CURV = pdfjs.OPS.curveTo
                  const CURV2 = pdfjs.OPS.curveTo2
                  const CURV3 = pdfjs.OPS.curveTo3
                  const CLOSE = pdfjs.OPS.closePath
                  // 每个操作的参数个数（其他类型不关心，仅推进下标）
                  const argCount = (k) => (k === RECT ? 4 : k === MOVE || k === LINE ? 2 : k === CURV ? 6 : (CURV2 && k === CURV2) || (CURV3 && k === CURV3) ? 4 : 0)
                  let p = 0
                  let sub = [] // 当前子路径点（未变换，PDF坐标）
                  const [a, b, c, d, e, f] = currentTransform
                  const apply = (px, py) => ({ x: a * px + c * py + e, y: b * px + d * py + f })
                  const toPxRect = (minX, minY, maxX, maxY) => {
                    let rx = offsetX + minX * pageScale
                    let ry = offsetY + (viewport.height - maxY) * pageScale
                    let rw = Math.abs((maxX - minX) * pageScale)
                    let rh = Math.abs((maxY - minY) * pageScale)
                    return { x: rx, y: ry, w: rw, h: rh }
                  }
                  const pushRectIfValid = (minX, minY, maxX, maxY) => {
                    const r = toPxRect(minX, minY, maxX, maxY)
                    if (r.w >= 20 && r.h >= 20) pendingRects.push(r)
                  }
                  const tryAxisAlignedRect = (pts /* transformed to CropBox space */) => {
                    if (pts.length < 4) return
                    const xs = pts.map(p0 => p0.x)
                    const ys = pts.map(p0 => p0.y)
                    const minX = Math.min(...xs), maxX = Math.max(...xs)
                    const minY = Math.min(...ys), maxY = Math.max(...ys)
                    const eps = 1e-3
                    const ok = pts.every(p0 => (Math.abs(p0.x - minX) < eps || Math.abs(p0.x - maxX) < eps) && (Math.abs(p0.y - minY) < eps || Math.abs(p0.y - maxY) < eps))
                    if (ok) pushRectIfValid(minX, minY, maxX, maxY)
                  }
                  for (let oi = 0; oi < opsArr.length; oi++) {
                    const kind = opsArr[oi]
                    const n = argCount(kind)
                    if (kind === RECT && p + 3 < coordsArr.length) {
                      const x = coordsArr[p]
                      const y = coordsArr[p + 1]
                      const w = coordsArr[p + 2]
                      const h = coordsArr[p + 3]
                      const pts = [apply(x, y), apply(x + w, y), apply(x + w, y + h), apply(x, y + h)]
                      const cropPts = pts.map(p0 => ({ x: p0.x - cropOffsetX, y: p0.y - cropOffsetY }))
                      const minX = Math.min(...cropPts.map(p0 => p0.x))
                      const maxX = Math.max(...cropPts.map(p0 => p0.x))
                      const minY = Math.min(...cropPts.map(p0 => p0.y))
                      const maxY = Math.max(...cropPts.map(p0 => p0.y))
                      pushRectIfValid(minX, minY, maxX, maxY)
                    } else if ((kind === MOVE || kind === LINE) && p + 1 < coordsArr.length) {
                      const x = coordsArr[p]
                      const y = coordsArr[p + 1]
                      // 转换到 CropBox 空间的点
                      const pt = apply(x, y)
                      sub.push({ x: pt.x - cropOffsetX, y: pt.y - cropOffsetY })
                    } else if (kind === CLOSE) {
                      // 尝试把当前子路径识别为矩形
                      tryAxisAlignedRect(sub)
                      sub = []
                    }
                    p += Math.max(0, n)
                  }
                }
              } catch (e) {
                console.warn('解析constructPath(暂存矩形)失败:', e)
              }
            }

            // 确认 pending 矩形（遇到绘制时）
            const confirmPending = (mode /* 'fill' | 'stroke' */) => {
              if (!pendingRects.length) return
              for (const pr of pendingRects) {
                const rw = pr.w, rh = pr.h
                if (rw < 30 || rh < 30) continue
                if (rw / rh < 0.05 || rh / rw < 0.05) continue
                const cover = textCoverRatioInPxRect(pr.x, pr.y, pr.w, pr.h)
                // 填充矩形通常为纯色占位，允许较低/中等文本覆盖；描边矩形倾向于空心框
                const threshold = mode === 'fill' ? 0.35 : 0.25
                if (cover <= threshold) {
                  const scaledRect = adjustRectWithTuning({ x: pr.x, y: pr.y, width: pr.w, height: pr.h }, bboxTuning)
                  const candidate = {
                    id: `vector_rect_${pageNumber}_${imageCount}`,
                    type: 'image',
                    position: {
                      x: Math.round(scaledRect.x),
                      y: Math.round(scaledRect.y),
                      width: Math.round(scaledRect.width),
                      height: Math.round(scaledRect.height)
                    },
                    content: '矩形占位',
                    description: mode === 'fill' ? '填充矩形占位' : '描边矩形占位',
                    fill: mode === 'fill' ? currentFill : undefined
                  }
                  const dup = images.some(img => localIoU(img, candidate) > 0.7)
                  if (!dup) {
                    images.push(candidate)
                    imageCount++
                  }
                }
              }
              pendingRects = []
            }

            // 根据绘制/裁剪操作确认或丢弃 pending 矩形
            if (
              op === pdfjs.OPS.fill ||
              op === pdfjs.OPS.fillStroke ||
              (typeof pdfjs.OPS.eoFill !== 'undefined' && op === pdfjs.OPS.eoFill) ||
              (typeof pdfjs.OPS.eoFillStroke !== 'undefined' && op === pdfjs.OPS.eoFillStroke) ||
              (typeof pdfjs.OPS.closeFillStroke !== 'undefined' && op === pdfjs.OPS.closeFillStroke)
            ) {
              confirmPending('fill')
            }
            if (
              op === pdfjs.OPS.stroke ||
              (typeof pdfjs.OPS.closeStroke !== 'undefined' && op === pdfjs.OPS.closeStroke)
            ) {
              confirmPending('stroke')
            }
            if (
              (typeof pdfjs.OPS.clip !== 'undefined' && op === pdfjs.OPS.clip) ||
              (typeof pdfjs.OPS.eoClip !== 'undefined' && op === pdfjs.OPS.eoClip) ||
              (typeof pdfjs.OPS.endPath !== 'undefined' && op === pdfjs.OPS.endPath)
            ) {
              // 被用于裁剪或明确结束不绘制
              pendingRects = []
            }
            
            if (
              op === pdfjs.OPS.paintInlineImageXObject ||
              op === pdfjs.OPS.paintImageXObject ||
              op === pdfjs.OPS.paintImageMaskXObject ||
              op === pdfjs.OPS.paintXObject ||
              op === pdfjs.OPS.paintFormXObject
            ) {
              
                // 精确计算最终变换距阵 - 根据您的建议
              const [a, b, c, d, e, f] = currentTransform
                
                console.log(`图片 ${imageCount} 变换矩阵:`, { a, b, c, d, e, f })
                
                // 计算图像的四个角点在PDF坐标系中的位置
                // 图像在单位坐标系中的四个角点: (0,0), (1,0), (1,1), (0,1)
                const corners = [
                  { x: 0, y: 0 }, // 左下角
                  { x: 1, y: 0 }, // 右下角  
                  { x: 1, y: 1 }, // 右上角
                  { x: 0, y: 1 }  // 左上角
                ]
                
                // 应用变换矩阵到每个角点（MediaBox坐标系）
                const transformedCorners = corners.map(corner => ({
                  x: a * corner.x + c * corner.y + e,
                  y: b * corner.x + d * corner.y + f
                }))
                
                // 转换为CropBox坐标系
                const cropTransformedCorners = transformedCorners.map(corner => ({
                  x: corner.x - cropOffsetX,
                  y: corner.y - cropOffsetY
                }))
                
                console.log(`图片 ${imageCount} 变换后角点:`, transformedCorners)
                console.log(`图片 ${imageCount} CropBox角点:`, cropTransformedCorners)
                
                // 计算边界框（使用CropBox坐标系）
                const xCoords = cropTransformedCorners.map(p => p.x)
                const yCoords = cropTransformedCorners.map(p => p.y)
                
                const minX = Math.min(...xCoords)
                const maxX = Math.max(...xCoords)
                const minY = Math.min(...yCoords)
                const maxY = Math.max(...yCoords)
                
                // 转换为浏览器坐标系（Y轴翻转，基于CropBox）
                let x = minX
                let y = viewport.height - maxY  // 关键：使用maxY并翻转
                let width = maxX - minX
                let height = maxY - minY
                
                console.log(`图片 ${imageCount} PDF坐标边界框:`, { 
                  minX, maxX, minY, maxY, 
                  转换后: { x, y, width, height },
                  viewport: { width: viewport.width, height: viewport.height }
                })
                
                // 应用缩放并加上容器偏移，统一为容器像素坐标
                const scaledX = offsetX + x * pageScale
                const scaledY = offsetY + y * pageScale
                const scaledWidth = width * pageScale
                const scaledHeight = height * pageScale
                x = scaledX
                y = scaledY
                width = scaledWidth
                height = scaledHeight
                
                // 验证边界框的合理性（现在坐标是相对于容器的）
                const wrapperWidth = wrapperRect?.width || viewport.width
                const wrapperHeight = wrapperRect?.height || viewport.height
                
                if (width > 5 && height > 5) {
                  // 边界框应该在容器范围内，但允许一定的超出（因为可能有padding等CSS影响）
                  const isReasonable = x > -100 && y > -100 && 
                                      x < wrapperWidth + 100 && y < wrapperHeight + 100
                  
                  if (isReasonable) {
                    // 添加适度的边距以便于点击，但不要让边框超出太多
                    const padding = Math.min(15, width * 0.08, height * 0.08)
                    
                    // 相对于容器的坐标，不需要限制在viewport范围内
                    x = x - padding
                    y = y - padding
                    width = width + padding * 2
                    height = height + padding * 2
                    
                    console.log(`图片 ${imageCount} 最终边界框:`, { x, y, width, height, padding })
                  } else {
                    console.log(`跳过异常图片 ${imageCount}，位置超出合理范围:`, { x, y, width, height })
                    continue
                  }
                } else {
                  console.log(`跳过异常图片 ${imageCount}，尺寸太小:`, { x, y, width, height })
                  continue
                }
                
                images.push({
                id: `image_${pageNumber}_${imageCount}`,
                type: 'image',
                position: {
                  x: Math.round(x * 100) / 100,
                  y: Math.round(y * 100) / 100,
                  width: Math.round(width * 100) / 100,
                  height: Math.round(height * 100) / 100
                },
                  content: `图片区域 ${imageCount + 1}`,
                  description: '图片内容区域'
              })
              imageCount++
            }
          }
          
            // 取消简单的整页“大块空白”兜底，避免识别到完全空白
            
          } catch (error) {
            console.error('图片检测失败:', error)
          }

          // 基于“标题+稀疏度”的兜底：仅在检测到 Figure/Table 标题附近才推断候选块
          try {
            const pageW = viewport.width
            const pageH = viewport.height
            const margin = 20
            const bins = 32 // 垂直方向划分
            const bandH = pageH / bins
            const bandCover = new Array(bins).fill(0)

            // 统计每个水平带的文本覆盖比例
            textItems.forEach(t => {
              const yTop = t.y
              const yBottom = t.y + Math.max(t.height, 10)
              const start = Math.max(0, Math.floor(yTop / bandH))
              const end = Math.min(bins - 1, Math.floor(yBottom / bandH))
              for (let bIdx = start; bIdx <= end; bIdx++) {
                bandCover[bIdx] += Math.max(t.width, 1) * Math.max(t.height, 10)
              }
            })

            const bandArea = pageW * bandH
            // 检测页面列布局（单栏/双栏）
            const detectColumnLayout = () => {
              const xs = textItems.map(t => t.x).sort((a, b) => a - b)
              if (xs.length < 20) return { type: 'single' }
              // 找最大间隔作为左右分栏粗略分割
              let maxGap = 0, gapIdx = -1
              for (let i = 1; i < xs.length; i++) {
                const g = xs[i] - xs[i - 1]
                if (g > maxGap) { maxGap = g; gapIdx = i }
              }
              if (maxGap < viewport.width * 0.12) return { type: 'single' }
              const boundary = (xs[gapIdx] + xs[gapIdx - 1]) / 2
              const left = textItems.filter(t => t.x < boundary)
              const right = textItems.filter(t => t.x >= boundary)
              if (left.length < textItems.length * 0.25 || right.length < textItems.length * 0.25) {
                return { type: 'single' }
              }
              const leftMin = Math.min(...left.map(t => t.x))
              const leftMax = Math.max(...left.map(t => t.x + t.width))
              const rightMin = Math.min(...right.map(t => t.x))
              const rightMax = Math.max(...right.map(t => t.x + t.width))
              return { type: 'double', boundary, columns: [ [leftMin, leftMax], [rightMin, rightMax] ] }
            }
            const colLayout = detectColumnLayout()

            // 将文本按行聚合，便于识别 “Figure/Table N” 标题
            const lines = []
            const sorted = [...textItems].sort((a, b) => a.y - b.y || a.x - b.x)
            const yTol = 8
            let cur = []
            sorted.forEach(t => {
              if (cur.length === 0) cur = [t]
              else {
                const avgY = cur.reduce((s, i) => s + i.y, 0) / cur.length
                if (Math.abs(t.y - avgY) <= yTol) cur.push(t)
                else { lines.push(cur); cur = [t] }
              }
            })
            if (cur.length) lines.push(cur)

            const lineObjs = lines.map(items => ({
              text: items.map(i => i.content).join(''),
              x: Math.min(...items.map(i => i.x)),
              y: Math.min(...items.map(i => i.y)),
              width: Math.max(...items.map(i => i.x + i.width)) - Math.min(...items.map(i => i.x)),
              height: Math.max(...items.map(i => i.height))
            }))

            // 标题识别：要求行首匹配，避免段落中的“In Figure 1 ...”
            const figureLines = lineObjs.filter(l => /^\s*(Figure|Fig\.?|图表|图)\s*[:：]?\s*\d+/i.test(l.text))
            // 表格标题识别禁用
            const tableLines = []

            // 辅助：统计候选区域内的文本密度和网格感
            const analyzeTextArea = (pxX, pxY, pxW, pxH) => {
              const items = textItems.filter(t => {
                const tx = t.x * pageScale + offsetX
                const ty = t.y * pageScale + offsetY
                const tw = (t.width || 0) * pageScale
                const th = Math.max(10, (t.height || 10) * pageScale)
                return tx + tw > pxX && tx < pxX + pxW && ty + th > pxY && ty < pxY + pxH
              })
              const cover = items.reduce((s, t) => s + Math.max(1, t.width) * Math.max(10, t.height), 0) * (pageScale * pageScale)
              const area = Math.max(1, pxW * pxH)
              // 行列数（粗糙聚类）
              const ys = items.map(i => i.y * pageScale + offsetY).sort((a, b) => a - b)
              let rows = 0
              for (let i = 0; i < ys.length; ) {
                const base = ys[i]
                let j = i + 1
                while (j < ys.length && Math.abs(ys[j] - base) < 14) j++
                rows++; i = j
              }
              const xs = items.map(i => i.x * pageScale + offsetX).sort((a, b) => a - b)
              let cols = 0
              for (let i = 0; i < xs.length; ) {
                const base = xs[i]
                let j = i + 1
                while (j < xs.length && Math.abs(xs[j] - base) < 24) j++
                cols++; i = j
              }
              return { textCoverRatio: cover / area, rows, cols, count: items.length }
            }

            const addBlockAboveCaption = (cap, kind, idxBase) => {
              // 在包含 Figure/Table 的标题附近做“窄范围”搜索，减少过大框
              const capBand = Math.max(0, Math.floor(cap.y / bandH))
              const searchUp = Math.floor((pageH * 0.45) / bandH) // 向上最多搜 45% 页高，适配无边框图
              const startBand = Math.max(0, capBand - searchUp)

              // 从标题向上，找到一段相对低密度带；遇到明显高密度则截止，避免跨到正文
              let b0 = -1, b1 = -1
              for (let b = capBand - 1; b >= startBand; b--) {
                const ratio = bandCover[b] / (bandArea || 1)
                if (ratio < 0.18) { // 提高阈值，容忍图内少量文字（坐标轴、标注）
                  if (b1 === -1) b1 = b
                  b0 = b
                } else if (ratio > 0.35) { // 更高阈值判定“正文密集”
                  // 碰到较高密度说明到了正文，停止
                  if (b0 !== -1) break
                  else break
                } else if (b0 !== -1) {
                  // 低密度段结束
                  break
                }
              }

              // 若未检出明显低密度段，使用基于标题的保守上方窗口作为候选
              if (b0 === -1 || b1 === -1) {
                const fallbackHeight = Math.min(pageH * 0.28, Math.max(120, cap.width * 0.9))
                const yMaxFB = Math.max(0, cap.y - 6)
                const yMinFB = Math.max(0, yMaxFB - fallbackHeight)
                b0 = Math.floor(yMinFB / bandH)
                b1 = Math.max(b0, Math.floor(yMaxFB / bandH))
              }

              const yMin = b0 * bandH
              const yMax = (b1 + 1) * bandH
              let boxH = yMax - yMin - 8
              if (boxH < 60) return

              // 基于标题所在列估计宽度：优先使用页面分栏信息
              let x = null
              let w = null
              if (colLayout.type === 'double') {
                const belongsRight = cap.x > (colLayout.boundary || pageW/2)
                const [minXCol, maxXCol] = belongsRight ? colLayout.columns[1] : colLayout.columns[0]
                x = Math.max(margin, minXCol)
                w = Math.min(pageW - x - margin, maxXCol - minXCol)
              } else {
                // 单栏：使用上方文本的横向范围
                const colYTop = yMin + 4
                const colYBottom = Math.max(yMin + 20, Math.min(yMax, cap.y - 8))
                const sameColLines = lineObjs.filter(l => l.y >= colYTop && l.y <= colYBottom)
                if (sameColLines.length >= 2) {
                  const minX = Math.min(...sameColLines.map(l => l.x))
                  const maxX = Math.max(...sameColLines.map(l => l.x + l.width))
                  x = Math.max(margin, minX)
                  w = Math.min(pageW - x - margin, maxX - minX)
                }
              }
              if (x === null || w === null || w < 60) {
                // 回退：以标题宽度为近似，并放宽左右 padding
                const padX = Math.min(40, cap.width * 0.15)
                x = Math.max(margin, cap.x - padX)
                w = Math.min(pageW - x - margin, cap.width + padX * 2)
              }

              // 限制最大高度，避免出现跨越过高的框
              const maxH = Math.min(pageH * 0.55, cap.width * 0.9)
              boxH = Math.min(boxH, maxH)

              // 转换为容器像素坐标
              const pxX = offsetX + x * pageScale
              const pxW = Math.max(80, w * pageScale)
              const pxY = offsetY + Math.max(0, yMin + 5) * pageScale
              const pxH = Math.max(60, boxH * pageScale)

              // 基于文本密度/网格的约束
              const { textCoverRatio, rows, cols } = analyzeTextArea(pxX, pxY, pxW, pxH)
              if (kind === 'image') {
                // 图片区域应为较低文本密度；对矢量图（含坐标轴/文字）放宽阈值
                if (textCoverRatio > 0.35 || rows >= 12) return
              } else if (kind === 'table') {
                // 表格：需要网格感（多行多列）
                const gridLike = rows >= 3 && cols >= 2
                if (!gridLike) return
              }

             images.push({
                id: `${kind}_caption_${pageNumber}_${idxBase}`,
                type: kind === 'table' ? 'table' : 'image',
                position: (() => {
                  const tuned = adjustRectWithTuning({ x: pxX, y: pxY, width: pxW, height: pxH }, bboxTuning)
                  return {
                    x: Math.round(tuned.x),
                    y: Math.round(tuned.y),
                    width: Math.round(tuned.width),
                    height: Math.round(tuned.height)
                  }
                })(),
                content: `${kind} caption block`,
                description: '基于标题→上方窗口与稀疏度的候选块（无边框增强）'
              })
            }

            figureLines.forEach((cap, idx) => addBlockAboveCaption(cap, 'image', idx))
            // 表格兜底已禁用
          } catch (e) {
            console.warn('文本稀疏度兜底失败:', e)
          }

          return images
        }
        
        // 执行检测
        // 表格解析禁用
        let tables = []
        let images = await detectImages()

        // 汇总图片块：将同一列内大量小图合并成整体块，双栏最多两个
        const summarizeImages = (imgs) => {
          if (!imgs || imgs.length === 0) return []
          // 复制，避免原数组被改动
          let rectsAll = imgs.map(it => ({ ...it, position: { ...it.position } }))
          // 仅以真正的图片绘制框作为合并基线，排除基于标题推断的 image_caption_* 大块
          const baseRects = rectsAll.filter(r => !(typeof r.id === 'string' && r.id.startsWith('image_caption_')))
          let rects = baseRects.length > 0 ? baseRects : rectsAll

          // 简易分栏检测（与上方逻辑一致）
          const xs = textItems.map(t => t.x).sort((a, b) => a - b)
          let layout = { type: 'single' }
          if (xs.length > 20) {
            let maxGap = 0, gapIdx = -1
            for (let i = 1; i < xs.length; i++) {
              const g = xs[i] - xs[i - 1]
              if (g > maxGap) { maxGap = g; gapIdx = i }
            }
            if (maxGap >= viewport.width * 0.12) {
              const boundary = (xs[gapIdx] + xs[gapIdx - 1]) / 2
              const left = textItems.filter(t => t.x < boundary)
              const right = textItems.filter(t => t.x >= boundary)
              if (left.length >= textItems.length * 0.25 && right.length >= textItems.length * 0.25) {
                const leftMin = Math.min(...left.map(t => t.x))
                const leftMax = Math.max(...left.map(t => t.x + t.width))
                const rightMin = Math.min(...right.map(t => t.x))
                const rightMax = Math.max(...right.map(t => t.x + t.width))
                layout = { type: 'double', boundary, columns: [[leftMin, leftMax], [rightMin, rightMax]] }
              }
            }
          }

          // 分栏边界（像素坐标）
          const boundaryPx = layout.type === 'double' ? (offsetX + layout.boundary * pageScale) : null
          const leftColPx = layout.type === 'double' ? [offsetX + layout.columns[0][0] * pageScale, offsetX + layout.columns[0][1] * pageScale] : null
          const rightColPx = layout.type === 'double' ? [offsetX + layout.columns[1][0] * pageScale, offsetX + layout.columns[1][1] * pageScale] : null

          // 特例：检测“实验图表网格”的行级区域（N 行 x 3 列小图）
          const detectGridRows = (rs) => {
            try {
              if (!rs || rs.length < 6) return []
              const items = rs
                .map(r => ({ x: r.position.x, y: r.position.y, w: r.position.width, h: r.position.height, id: r.id }))
                .filter(r => r.w > 60 && r.h > 28 && r.w / r.h > 1.05 && r.w / r.h < 8)
              if (items.length < 6) return []
              const hMed = (() => { const a=items.map(i=>i.h).sort((a,b)=>a-b); const m=Math.floor(a.length/2); return a.length? (a.length%2?a[m]:(a[m-1]+a[m])/2):0 })()
              if (hMed <= 0) return []
              const rowTol = Math.max(18, hMed * 0.7)
              const sorted = items.map(i => ({...i, cy: i.y + i.h/2})).sort((a,b)=>a.cy-b.cy)
              const rows = []
              let cur = []
              sorted.forEach(it => {
                if (cur.length === 0) { cur = [it]; return }
                const avg = cur.reduce((s,i)=>s+i.cy,0)/cur.length
                if (Math.abs(it.cy - avg) <= rowTol) cur.push(it)
                else { rows.push(cur); cur = [it] }
              })
              if (cur.length) rows.push(cur)
              const padX = 10, padY = 8
              const makeRect = (row, idx) => {
                if (row.length < 3) return null
                const minX = Math.min(...row.map(i=>i.x))
                const maxX = Math.max(...row.map(i=>i.x + i.w))
                const minY = Math.min(...row.map(i=>i.y))
                const maxY = Math.max(...row.map(i=>i.y + i.h))
                const w = maxX - minX, h = maxY - minY
                if (w < 200 || w/h < 1.6) return null
                return {
                  id: `grid_row_${pageNumber}_${idx+1}`,
                  type: 'image',
                  position: {
                    x: Math.max(0, minX - padX),
                    y: Math.max(0, minY - padY),
                    width: w + padX * 2,
                    height: h + padY * 2
                  },
                  content: '实验图表行',
                  locked: true
                }
              }
              const rowsRects = rows.map(makeRect).filter(Boolean)
              return rowsRects.slice(0, 12)
            } catch(_) { return [] }
          }
          const gridRowRects = detectGridRows(rects)

          // 工具：两矩形是否应合并（重叠或很近）；双栏下禁止跨列合并
          const shouldMerge = (a, b) => {
            // 初步合并：放宽跨列限制；用“正交方向重叠 + 间距”或 IoU 来判断
            const ax2 = a.position.x + a.position.width
            const ay2 = a.position.y + a.position.height
            const bx2 = b.position.x + b.position.width
            const by2 = b.position.y + b.position.height
            const overlapX = Math.max(0, Math.min(ax2, b.position.x + b.position.width) - Math.max(a.position.x, b.position.x))
            const overlapY = Math.max(0, Math.min(ay2, b.position.y + b.position.height) - Math.max(a.position.y, b.position.y))
            const inter = overlapX * overlapY
            const areaA = a.position.width * a.position.height
            const areaB = b.position.width * b.position.height
            const iou = inter / (areaA + areaB - inter + 1e-6)
            const gapX = Math.max(0, Math.max(a.position.x, b.position.x) - Math.min(ax2, bx2))
            const gapY = Math.max(0, Math.max(a.position.y, b.position.y) - Math.min(ay2, by2))
            const hOverlapRatio = overlapY / Math.min(a.position.height, b.position.height)
            const vOverlapRatio = overlapX / Math.min(a.position.width, b.position.width)
            const nearX = gapX < 28 && hOverlapRatio >= 0.6 // 横向合并：垂直方向重叠足够，水平间距小
            const nearY = gapY < 28 && vOverlapRatio >= 0.6 // 纵向合并：水平方向重叠足够，垂直间距小
            return iou > 0.12 || nearX || nearY
          }

          const unionRect = (a, b) => ({
            ...a,
            id: `${a.id}_u_${b.id}`,
            position: {
              x: Math.min(a.position.x, b.position.x),
              y: Math.min(a.position.y, b.position.y),
              width: Math.max(a.position.x + a.position.width, b.position.x + b.position.width) - Math.min(a.position.x, b.position.x),
              height: Math.max(a.position.y + a.position.height, b.position.y + b.position.height) - Math.min(a.position.y, b.position.y)
            }
          })

          // 迭代合并直到稳定
          const mergeIter = (list) => {
            let merged = []
            const used = new Array(list.length).fill(false)
            for (let i = 0; i < list.length; i++) {
              if (used[i]) continue
              let cur = list[i]
              for (let j = i + 1; j < list.length; j++) {
                if (used[j]) continue
                if (shouldMerge(cur, list[j])) {
                  cur = unionRect(cur, list[j])
                  used[j] = true
                }
              }
              merged.push(cur)
            }
            return merged
          }

          let mergedRects = rects

          if (layout.type === 'double') {
            // 先按列拆分，再分别合并，绝不跨列
            const guard = 16
            const left = rects.filter(r => (r.position.x + r.position.width/2) < (boundaryPx - guard))
            const right = rects.filter(r => (r.position.x + r.position.width/2) > (boundaryPx + guard))
            const middle = rects.filter(r => (r.position.x + r.position.width/2) >= (boundaryPx - guard) && (r.position.x + r.position.width/2) <= (boundaryPx + guard))
            // 将中缝的块按与列重叠更多的一侧分配
            const overlapWith = (r, colPx) => {
              const x1 = Math.max(r.position.x, colPx[0])
              const x2 = Math.min(r.position.x + r.position.width, colPx[1])
              return Math.max(0, x2 - x1)
            }
            middle.forEach(r => {
              const ol = leftColPx ? overlapWith(r, leftColPx) : 0
              const or = rightColPx ? overlapWith(r, rightColPx) : 0
              if (ol >= or) left.push(r); else right.push(r)
            })

            const mergeSide = (arr) => {
              let cur = arr
              for (let iter = 0; iter < 3; iter++) {
                const next = mergeIter(cur)
                if (next.length === cur.length) { cur = next; break }
                cur = next
              }
              return cur
            }

            const L = mergeSide(left)
            const R = mergeSide(right)
            // 不再把每一列折叠为一个大框，保留列内的独立块
            mergedRects = [...L, ...R]
          } else if (mergedRects.length > 1) {
            // 单栏：仅基于接近/重叠进行迭代合并，避免把上下两个图合并成整列
            let cur = mergedRects
            for (let iter = 0; iter < 3; iter++) {
              const next = mergeIter(cur)
              if (next.length === cur.length) { cur = next; break }
              cur = next
            }
            mergedRects = cur
          }

          // 不再限制组数量，保留全部候选组

          // 紧凑化：以组内的基础小图（rects）重新计算紧边界，并排除下方的 Figure/图 caption 行
          const toPdfY = (py) => (py - offsetY) / pageScale
          const toPdfX = (px) => (px - offsetX) / pageScale

          // 重新按 y 聚类得到文本行，供 caption 检测
          const makeLines = () => {
            const items = [...textItems].sort((a,b)=>a.y-b.y||a.x-b.x)
            const lines = []
            const yTol = 8
            let cur = []
            items.forEach(t=>{
              if (cur.length===0) cur=[t]
              else {
                const avgY = cur.reduce((s,i)=>s+i.y,0)/cur.length
                if (Math.abs(t.y-avgY)<=yTol) cur.push(t)
                else { lines.push(cur); cur=[t] }
              }
            })
            if (cur.length) lines.push(cur)
            return lines.map(items=>({
              text: items.map(i=>i.content).join(''),
              x: Math.min(...items.map(i=>i.x)),
              y: Math.min(...items.map(i=>i.y)),
              width: Math.max(...items.map(i=>i.x+i.width)) - Math.min(...items.map(i=>i.x)),
              height: Math.max(...items.map(i=>i.height))
            }))
          }
          const lineObjsLocal = makeLines()

          const tightened = mergedRects.map(r => {
            // 使用参与合并的基础小图来收紧
            const members = rects.filter(s => {
              const cx = s.position.x + s.position.width/2
              const cy = s.position.y + s.position.height/2
              return cx >= r.position.x-4 && cx <= r.position.x + r.position.width + 4 &&
                     cy >= r.position.y-4 && cy <= r.position.y + r.position.height + 4
            })
            if (members.length>0) {
              const minX = Math.min(...members.map(m=>m.position.x))
              const minY = Math.min(...members.map(m=>m.position.y))
              const maxX = Math.max(...members.map(m=>m.position.x+m.position.width))
              const maxY = Math.max(...members.map(m=>m.position.y+m.position.height))
              r.position.x = minX
              r.position.y = minY
              r.position.width = maxX - minX
              r.position.height = maxY - minY
            }

            // 排除“Figure/图 …” caption 行：在 r 内部靠近底部或其正下方查找最近的标题行，将底边裁剪到其上方
            const rTopPdf = toPdfY(r.position.y)
            const rBottomPdf = toPdfY(r.position.y + r.position.height)
            const rLeftPdf = toPdfX(r.position.x)
            const rRightPdf = toPdfX(r.position.x + r.position.width)
            const figureRegex = /^\s*(Figure|Fig\.?|图)\s*\d+\s*[:：\.]?/i
            const cand = lineObjsLocal
              .filter(l => figureRegex.test(l.text))
              // 允许在框内靠近底部，或底部以下 25% 页高
              .filter(l => l.y >= rTopPdf && l.y <= rBottomPdf + viewport.height * 0.25)
              .filter(l => {
                const lx1 = l.x, lx2 = l.x + l.width
                // 与组在横向上有重叠
                return !(lx2 < rLeftPdf || lx1 > rRightPdf)
              })
              .sort((a,b)=>a.y-b.y)
              // 选取离底部最近的一行
              .reduce((best,l)=>{
                if(!best) return l
                return (Math.abs(l.y - rBottomPdf) < Math.abs(best.y - rBottomPdf)) ? l : best
              }, null)
            let capTopPx = null
            if (cand) {
              capTopPx = offsetY + cand.y * pageScale
              const newH = Math.max(10, Math.min(r.position.height, capTopPx - r.position.y - 10))
              r.position.height = newH
            }

            // 允许包含图下标签（例如 Input / (a) / (b) 等）
            // 在小图底边与 caption 之间寻找“标签行”，若存在则把底边下扩到标签行底部，但不过界到 caption
            if (members.length > 0) {
              const maxMemberBottomPx = Math.max(...members.map(m => m.position.y + m.position.height))
              const isLabelLine = (text) => {
                if (!text) return false
                const t = (text || '').replace(/\s+/g,' ').trim()
                if (/^\s*$/.test(t)) return false
                if (/^(Figure|Fig\.?|Table|表|图)\s*\d+/i.test(t)) return false
                if (t.length > 40) return false
                if (/[.:;]$/.test(t)) return false // 句子结尾，不像标签
                const words = t.split(' ')
                if (words.length > 8) return false
                const good = words.filter(w => /(\(?[a-z]\)?|[A-Za-z]{1,12}|[A-Za-z]{1,12}\([a-z]\))/i.test(w)).length
                return good >= Math.max(2, Math.floor(words.length * 0.7))
              }
              const labelLines = lineObjsLocal
                .filter(l => isLabelLine(l.text || ''))
                .filter(l => {
                  const lTop = offsetY + l.y * pageScale
                  const lBottom = offsetY + (l.y + l.height) * pageScale
                  const withinBelow = lTop >= maxMemberBottomPx - 6
                  const belowCaption = capTopPx ? (lBottom <= capTopPx - 6) : true
                  return withinBelow && belowCaption
                })
                .filter(l => {
                  // 与组水平重叠比例至少30%
                  const lLeft = offsetX + l.x * pageScale
                  const lRight = offsetX + (l.x + l.width) * pageScale
                  const overlap = Math.max(0, Math.min(lRight, r.position.x + r.position.width) - Math.max(lLeft, r.position.x))
                  return overlap >= r.position.width * 0.3
                })
                .sort((a,b)=>a.y-b.y)
              const lastLabelBottomPx = labelLines.length > 0 ? (offsetY + (labelLines[labelLines.length - 1].y + labelLines[labelLines.length - 1].height) * pageScale) : null
              // 若存在“长文本行”，作为最终的下裁界（在 caption 不存在时使用）
              let longTextTopPx = null
              if (!capTopPx) {
                const isLongText = (text) => {
                  const t = (text || '').replace(/\s+/g,' ').trim()
                  if (/^(Figure|Fig\.?|Table|表|图)\s*\d+/i.test(t)) return false
                  if (isLabelLine(t)) return false
                  return t.length >= 35 && (t.split(' ').length >= 5)
                }
                const longLine = lineObjsLocal
                  .filter(l => {
                    const lTop = offsetY + l.y * pageScale
                    return lTop >= maxMemberBottomPx - 6 && lTop <= r.position.y + r.position.height + viewport.height * 0.25
                  })
                  .filter(l => isLongText(l.text))
                  .filter(l => { const lLeft = offsetX + l.x * pageScale; const lRight = offsetX + (l.x + l.width) * pageScale; const overlap = Math.max(0, Math.min(lRight, r.position.x + r.position.width) - Math.max(lLeft, r.position.x)); return overlap >= r.position.width * 0.3 })
                  .sort((a,b)=>a.y-b.y)[0]
                if (longLine) longTextTopPx = offsetY + longLine.y * pageScale
              }
              // 计算最终底边：优先 captionTop，其次 longTextTop；保证不小于标签底边
              let bottomLimit = r.position.y + r.position.height
              if (capTopPx) bottomLimit = Math.min(bottomLimit, capTopPx - 6)
              if (!capTopPx && longTextTopPx) bottomLimit = Math.min(bottomLimit, longTextTopPx - 8)
              if (lastLabelBottomPx) bottomLimit = Math.max(bottomLimit, lastLabelBottomPx)
              if (bottomLimit > r.position.y + 12) {
                r.position.height = bottomLimit - r.position.y
              }
            }

            // 收紧顶部：若框内最上方存在以大写/英文为主的列头行（且不是 Figure/Table），将顶边裁到该行下方
            // 顶部不要裁掉图内标签（如 Input/GT Mask 等）：
            // 仅当“顶部文本”远离小图上边缘时才裁剪；否则保留
            const minMemberTopPx = members.length>0 ? Math.min(...members.map(m=>m.position.y)) : r.position.y
            const header = lineObjsLocal
              .filter(l => l.y >= rTopPdf - viewport.height * 0.05 && l.y <= rTopPdf + viewport.height * 0.25)
              .filter(l => {
                const text = (l.text || '').trim()
                if (/^\s*(Figure|Fig\.?|Table|表|图)/i.test(text)) return false
                const letters = (text.match(/[A-Za-z]/g) || []).length
                const digits = (text.match(/[0-9]/g) || []).length
                return letters >= 3 && letters > digits // 英文占主导
              })
              .filter(l => {
                const lx1 = l.x, lx2 = l.x + l.width
                return !(lx2 < rLeftPdf || lx1 > rRightPdf)
              })
              .sort((a,b)=>a.y-b.y)[0]
            if (header) {
              const headerBottomPx = offsetY + (header.y + header.height) * pageScale
              const delta = headerBottomPx - r.position.y + 4
              // 如果顶部文本紧贴小图上沿（通常是组内标签），则不裁剪
              if (headerBottomPx <= minMemberTopPx + 40) {
                // 保留原顶部
              } else {
              // 仅当裁剪量较小（不超过高度的18%且不超过28px）时才下移，避免“整体下移”的观感
              const maxDelta = Math.min(r.position.height * 0.18, 28)
              if (delta > 0 && delta <= maxDelta && delta < r.position.height - 20) {
                r.position.y += delta
                r.position.height -= delta
              }
              }
            }

            // 最后再小幅 padding，保持易点选
            const pad = 4
            r.position.x += pad
            r.position.y += pad
            r.position.width = Math.max(10, r.position.width - pad*2)
            r.position.height = Math.max(10, r.position.height - pad*2)

            return r
          })

          // 根据下方文本的列占比辅助横向对齐（非强制）
          const snapToColumns = (r) => {
            if (layout.type !== 'double') return r
            const rBottomPdf = (r.position.y + r.position.height - offsetY) / pageScale
            const rLeftPdf = (r.position.x - offsetX) / pageScale
            const rRightPdf = (r.position.x + r.position.width - offsetX) / pageScale
            const lines = lineObjsLocal
              .filter(l => l.y >= rBottomPdf + 4 && l.y <= rBottomPdf + viewport.height * 0.18)
            const overlap = (l, col) => {
              const x1 = Math.max(l.x, col[0])
              const x2 = Math.min(l.x + l.width, col[1])
              return Math.max(0, x2 - x1)
            }
            const leftOv = lines.reduce((s,l)=> s + overlap(l, layout.columns[0]), 0)
            const rightOv = lines.reduce((s,l)=> s + overlap(l, layout.columns[1]), 0)
            const prefers = leftOv > rightOv ? 0 : 1
            const [colMin, colMax] = layout.columns[prefers]
            const colW = colMax - colMin
            const rWpdf = rRightPdf - rLeftPdf
            // 当当前宽度接近列宽或小于1.4倍列宽，且中心在该列内，则轻量对齐
            const rCenter = (rLeftPdf + rRightPdf) / 2
            if (rWpdf < colW * 1.4 && rCenter >= colMin && rCenter <= colMax) {
              const targetX = offsetX + (colMin + 6) * pageScale
              const targetW = Math.max(40, (colW - 12) * pageScale)
              r.position.x = targetX
              r.position.width = targetW
            }
            // 进一步：若宽度明显小于列宽 50%，而中心在列内，则扩展到接近列宽，避免“细长竖条”
            if (rWpdf < colW * 0.5 && rCenter >= colMin && rCenter <= colMax) {
              const targetX = offsetX + (colMin + 6) * pageScale
              const targetW = Math.max(r.position.width, (colW - 12) * pageScale)
              r.position.x = targetX
              r.position.width = targetW
            }
            return r
          }

          // 区分公式：若区域内数学符号比例高、且没有图片成员，则排除
          const isFormula = (r) => {
            const txts = textItems.filter(t => {
              const tx = t.x * pageScale + offsetX
              const ty = t.y * pageScale + offsetY
              const tw = (t.width||0) * pageScale
              const th = Math.max(10,(t.height||10) * pageScale)
              return tx + tw > r.position.x && tx < r.position.x + r.position.width &&
                     ty + th > r.position.y && ty < r.position.y + r.position.height
            })
            const textJoined = txts.map(t=>t.content||'').join(' ')
            const symCount = (textJoined.match(/[=∑∫∏√≤≥≈≠±⁄\/^_]/g) || []).length
            const letters = (textJoined.match(/[A-Za-z]/g) || []).length
            const hasEq = /=|∑|∫|\(|\)\s*\d+\s*\)$/.test(textJoined)
            const memberCount = rects.filter(s => {
              const cx = s.position.x + s.position.width/2
              const cy = s.position.y + s.position.height/2
              return cx >= r.position.x && cx <= r.position.x + r.position.width &&
                     cy >= r.position.y && cy <= r.position.y + r.position.height
            }).length
            return (symCount >= 2 && symCount > letters * 0.12 && hasEq && memberCount === 0)
          }

          const adjusted = tightened.map(snapToColumns).filter(r => !isFormula(r))

          // 最终一轮合并：在“框选完成”（已紧边界并对齐列）后，扫描可合并的相邻/重叠组
          const mergeCloseFinal = (list) => {
            const shouldMerge = (a, b) => {
              const ax2 = a.position.x + a.position.width
              const ay2 = a.position.y + a.position.height
              const bx2 = b.position.x + b.position.width
              const by2 = b.position.y + b.position.height
              const overlapX = Math.max(0, Math.min(ax2, b.position.x + b.position.width) - Math.max(a.position.x, b.position.x))
              const overlapY = Math.max(0, Math.min(ay2, b.position.y + b.position.height) - Math.max(a.position.y, b.position.y))
              const inter = overlapX * overlapY
              const areaA = Math.max(1, a.position.width * a.position.height)
              const areaB = Math.max(1, b.position.width * b.position.height)
              const iou = inter / (areaA + areaB - inter + 1e-6)
              const gapX = Math.max(0, Math.max(a.position.x, b.position.x) - Math.min(ax2, bx2))
              const gapY = Math.max(0, Math.max(a.position.y, b.position.y) - Math.min(ay2, by2))
              const nearX = gapX < Math.min(a.position.width, b.position.width) * 0.06
              const nearY = gapY < Math.min(a.position.height, b.position.height) * 0.06
              // 双栏：禁止跨列合并
              if (layout.type === 'double' && boundaryPx !== null) {
                const aC = a.position.x + a.position.width/2
                const bC = b.position.x + b.position.width/2
                const guard = 16
                const aSide = aC < boundaryPx - guard ? 'L' : (aC > boundaryPx + guard ? 'R' : 'M')
                const bSide = bC < boundaryPx - guard ? 'L' : (bC > boundaryPx + guard ? 'R' : 'M')
                if (aSide !== 'M' && bSide !== 'M' && aSide !== bSide) return false
              }
              return iou > 0.25 || (nearX && overlapY > 10) || (nearY && overlapX > 10)
            }
            const unionRect = (a, b) => ({
              ...a,
              position: {
                x: Math.min(a.position.x, b.position.x),
                y: Math.min(a.position.y, b.position.y),
                width: Math.max(a.position.x + a.position.width, b.position.x + b.position.width) - Math.min(a.position.x, b.position.x),
                height: Math.max(a.position.y + a.position.height, b.position.y + b.position.height) - Math.min(a.position.y, b.position.y)
              }
            })
            let cur = list
            for (let iter = 0; iter < 3; iter++) {
              const used = new Array(cur.length).fill(false)
              const next = []
              for (let i = 0; i < cur.length; i++) {
                if (used[i]) continue
                let acc = cur[i]
                for (let j = i + 1; j < cur.length; j++) {
                  if (used[j]) continue
                  if (shouldMerge(acc, cur[j])) {
                    acc = unionRect(acc, cur[j])
                    used[j] = true
                  }
                }
                next.push(acc)
              }
              if (next.length === cur.length) { cur = next; break }
              cur = next
            }
            return cur
          }

          const finalGroups = mergeCloseFinal(adjusted)
          const withRows = [...gridRowRects, ...finalGroups]

          // 全局“智能合并”：允许跨列，但需要高正交重叠或 IoU，兼顾图表行/列
          const smartMergeAll = (arr) => {
            const canMerge = (a, b) => {
              const ax2 = a.position.x + a.position.width
              const ay2 = a.position.y + a.position.height
              const bx2 = b.position.x + b.position.width
              const by2 = b.position.y + b.position.height
              const overlapX = Math.max(0, Math.min(ax2, b.position.x + b.position.width) - Math.max(a.position.x, b.position.x))
              const overlapY = Math.max(0, Math.min(ay2, b.position.y + b.position.height) - Math.max(a.position.y, b.position.y))
              const inter = overlapX * overlapY
              const areaA = a.position.width * a.position.height
              const areaB = b.position.width * b.position.height
              const iou = inter / (areaA + areaB - inter + 1e-6)
              const gapX = Math.max(0, Math.max(a.position.x, b.position.x) - Math.min(ax2, bx2))
              const gapY = Math.max(0, Math.max(a.position.y, b.position.y) - Math.min(ay2, by2))
              const hOverlapRatio = overlapY / Math.min(a.position.height, b.position.height)
              const vOverlapRatio = overlapX / Math.min(a.position.width, b.position.width)
              // 允许跨列：只要满足横向/纵向合并之一，或 IoU 足够
              const horiz = gapX <= 32 && hOverlapRatio >= 0.65
              const vert = gapY <= 32 && vOverlapRatio >= 0.65
              // grid 行之间：如果左右对齐且间隙小，合并为整列/整页
              const isRowA = String(a.id||'').startsWith('grid_row_')
              const isRowB = String(b.id||'').startsWith('grid_row_')
              const rowCompat = (isRowA || isRowB) && (hOverlapRatio >= 0.55 || vOverlapRatio >= 0.55)
              return iou > 0.2 || horiz || vert || rowCompat
            }
            const union = (a, b) => ({
              ...a,
              position: {
                x: Math.min(a.position.x, b.position.x),
                y: Math.min(a.position.y, b.position.y),
                width: Math.max(a.position.x + a.position.width, b.position.x + b.position.width) - Math.min(a.position.x, b.position.x),
                height: Math.max(a.position.y + a.position.height, b.position.y + b.position.height) - Math.min(a.position.y, b.position.y)
              },
              id: (String(a.id||'').startsWith('grid_row_') || String(b.id||'').startsWith('grid_row_')) ? `grid_block_${pageNumber}` : a.id
            })
            let cur = arr
            for (let iter = 0; iter < 3; iter++) {
              const used = new Array(cur.length).fill(false)
              const next = []
              for (let i = 0; i < cur.length; i++) {
                if (used[i]) continue
                let acc = cur[i]
                for (let j = i + 1; j < cur.length; j++) {
                  if (used[j]) continue
                  if (canMerge(acc, cur[j])) { acc = union(acc, cur[j]); used[j] = true }
                }
                next.push(acc)
              }
              if (next.length === cur.length) { cur = next; break }
              cur = next
            }
            return cur
          }

          const mergedAll = smartMergeAll(withRows)

          return mergedAll.map((r, idx) => ({
            ...r,
            type: 'image',
            id: (r.id && r.id.startsWith('grid_row_')) ? r.id : `image_group_${pageNumber}_${idx+1}`,
            name: (r.id && r.id.startsWith('grid_row_')) ? `图表行${idx+1}` : `图片组${idx+1}`,
            content: '组合图片块（紧凑）'
          }))
        }

        images = summarizeImages(images)

        // 右上角兜底：若右上区域没有检测到图片，给出定位矩形
        try {
          const pageWpx = viewport.width * pageScale
          const pageHpx = viewport.height * pageScale

          // 简易分栏推断，获取右栏范围
          const xs = textItems.map(t => t.x).sort((a,b)=>a-b)
          let rightMin = viewport.width * 0.58
          let rightMax = viewport.width * 0.96
          if (xs.length > 20) {
            let maxGap = 0, gapIdx = -1
            for (let i=1;i<xs.length;i++){
              const g = xs[i] - xs[i-1]
              if (g > maxGap) { maxGap = g; gapIdx = i }
            }
            if (maxGap >= viewport.width * 0.12) {
              const boundary = (xs[gapIdx] + xs[gapIdx-1]) / 2
              const rightXs = xs.filter(v => v >= boundary)
              if (rightXs.length > 0) {
                rightMin = Math.min(...rightXs)
                rightMax = Math.max(...rightXs) + 40
              }
            }
          }

          const candX = offsetX + Math.max(0, rightMin + 6) * pageScale
          const candW = Math.max(80, (Math.min(viewport.width - 12, rightMax) - Math.max(0, rightMin) - 12) * pageScale)
          const candY = offsetY + (pageHpx * 0.06)
          const candH = Math.max(100, pageHpx * 0.26)

          // 文本覆盖率（避免覆盖正文）
          const textCoverRatioInPxRect = (rx, ry, rw, rh) => {
            const items = textItems.filter(t => {
              const tx = t.x * pageScale + offsetX
              const ty = t.y * pageScale + offsetY
              const tw = (t.width || 0) * pageScale
              const th = Math.max(10, (t.height || 10) * pageScale)
              return tx + tw > rx && tx < rx + rw && ty + th > ry && ty < ry + rh
            })
            const cover = items.reduce((s, t) => s + Math.max(1, t.width) * Math.max(10, t.height), 0) * (pageScale * pageScale)
            const area = Math.max(1, rw * rh)
            return cover / area
          }

          // 右上区域是否已有图片
          const regionX1 = offsetX + pageWpx * 0.55
          const regionY1 = offsetY
          const regionX2 = offsetX + pageWpx
          const regionY2 = offsetY + pageHpx * 0.45
          const covered = images.some(img => {
            const cx = img.position.x + img.position.width/2
            const cy = img.position.y + img.position.height/2
            return cx >= regionX1 && cx <= regionX2 && cy >= regionY1 && cy <= regionY2
          })

          if (!covered) {
            const cover = textCoverRatioInPxRect(candX, candY, candW, candH)
           if (cover <= 0.45) {
              const tuned = adjustRectWithTuning({ x: candX, y: candY, width: candW, height: candH }, bboxTuning)
              images.push({
                id: `image_top_right_${pageNumber}_1`,
                type: 'image',
                position: {
                  x: Math.round(tuned.x),
                  y: Math.round(tuned.y),
                  width: Math.round(tuned.width),
                  height: Math.round(tuned.height)
                },
                content: '右上角图片区域(兜底)',
                description: '自动兜底定位矩形（右上角）',
                isFallback: true
              })
            }
          }
        } catch (e) {
          console.warn('右上角兜底定位失败:', e)
        }

        // 去重：若兜底框与已有组强重叠或被完全包含，则移除兜底框（优先保留非兜底）
        const dedupeImages = (arr) => {
          const res = []
          const iou = (A, B) => {
            const ax2 = A.position.x + A.position.width
            const ay2 = A.position.y + A.position.height
            const bx2 = B.position.x + B.position.width
            const by2 = B.position.y + B.position.height
            const x1 = Math.max(A.position.x, B.position.x)
            const y1 = Math.max(A.position.y, B.position.y)
            const x2 = Math.min(ax2, bx2)
            const y2 = Math.min(ay2, by2)
            const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
            const areaA = Math.max(1, A.position.width * A.position.height)
            const areaB = Math.max(1, B.position.width * B.position.height)
            const uni = areaA + areaB - inter
            return uni > 0 ? inter / uni : 0
          }
          const containRatio = (A, B) => {
            const ax2 = A.position.x + A.position.width
            const ay2 = A.position.y + A.position.height
            const bx2 = B.position.x + B.position.width
            const by2 = B.position.y + B.position.height
            const x1 = Math.max(A.position.x, B.position.x)
            const y1 = Math.max(A.position.y, B.position.y)
            const x2 = Math.min(ax2, bx2)
            const y2 = Math.min(ay2, by2)
            const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
            const small = Math.min(A.position.width * A.position.height, B.position.width * B.position.height)
            return small > 0 ? inter / small : 0
          }
          arr.forEach((cur) => {
            // 若与 res 中某个框强重叠，做取舍
            const conflictIdx = res.findIndex(r => iou(r, cur) > 0.5 || containRatio(r, cur) > 0.7)
            if (conflictIdx === -1) { res.push(cur); return }
            const r = res[conflictIdx]
            // 优先保留非兜底
            if (r.isFallback && !cur.isFallback) {
              res[conflictIdx] = cur
              return
            }
            if (!r.isFallback && cur.isFallback) {
              return
            }
            // 其余情况保留面积更大的
            const area = (x) => x.position.width * x.position.height
            if (area(cur) > area(r)) res[conflictIdx] = cur
          })
          return res
        }
        images = dedupeImages(images)

        // 统一图片命名与排序，生成“图片几”
        if (images.length > 0) {
          images = images
            .sort((a, b) => (a.position.y - b.position.y) || (a.position.x - b.position.x))
            .map((img, idx) => ({
              ...img,
              index: idx + 1,
              name: `图片${idx + 1}`
            }))
        }

        // 表格命名逻辑已移除（解析禁用）

        // 合并所有区域（仅图片）
        annotations.push(...images)
        
        console.log(`页面 ${pageNumber} 检测结果:`, { images: images.length, total: annotations.length })

        setParsedByPage(prev => ({ ...prev, [pageNumber]: annotations }))
        setBasePageSize(prev => ({ ...prev, [pageNumber]: { width: viewport.width, height: viewport.height } }))
      } catch (e) {
        console.error('解析当前页失败:', e)
      }
    }
    parseCurrentPage()
  }, [pdfDoc, pageNumber, pageScale, lpBlocksByPage, manualOffset, coordinateMethod, usePageScale, bboxTuning])

  // 工具：计算矩形交叠IoU
  const rectIoU = (a, b) => {
    const x1 = Math.max(a.x, b.x)
    const y1 = Math.max(a.y, b.y)
    const x2 = Math.min(a.x + a.width, b.x + b.width)
    const y2 = Math.min(a.y + a.height, b.y + b.height)
    const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
    const areaA = a.width * a.height
    const areaB = b.width * b.height
    const union = areaA + areaB - inter
    return union > 0 ? inter / union : 0
  }

  // 专门针对图片等视觉块的匹配函数（表格已禁用）
  const matchVisualAnnotation = (areaOrPoint) => {
    const anns = parsedByPage[pageNumber] || []
    // 只关注图片类型
    const imageAnns = anns.filter(a => !a.id.startsWith('text'))
    
    if (imageAnns.length === 0) {
      return null
    }

    // 现在注释坐标与选区/点击坐标都在同一坐标系（容器像素），无需再缩放
    if (areaOrPoint && typeof areaOrPoint.x === 'number' && typeof areaOrPoint.width === 'number') {
      // 选区匹配图片（容器像素）
      const areaPdf = { 
        x: areaOrPoint.x, 
        y: areaOrPoint.y, 
        width: areaOrPoint.width, 
        height: areaOrPoint.height 
      }
      
      let best = null
      let bestIoU = 0
      
      imageAnns.forEach(img => {
        const r = img.position
        const iou = rectIoU(areaPdf, r)
        if (iou > bestIoU) { 
          bestIoU = iou
          best = img 
        }
      })
      
      return (bestIoU > 0.01) ? best : null // 降低阈值，更容易匹配图片
    }
    
    // 点击匹配图片
    const { px, py } = areaOrPoint
    const pxPdf = px
    const pyPdf = py
    
    console.log('视觉块匹配 - 点击坐标:', { px, py, pxPdf, pyPdf })
    
    // 优先查找包含点击点的图片
    let bestContains = null
    let bestDistance = Infinity
    let bestByDistance = null
    
    imageAnns.forEach(img => {
      const r = img.position
      
      console.log(`检查视觉块 ${img.id}:`, r)
      
      // 检查点击是否在图片边界内
      const contains = pxPdf >= r.x && pxPdf <= r.x + r.width && 
                      pyPdf >= r.y && pyPdf <= r.y + r.height
      
      if (contains) {
        bestContains = img
        console.log(`点击命中视觉块: ${img.id}`)
      }
      
      // 计算到图片中心的距离
      const cx = r.x + r.width / 2
      const cy = r.y + r.height / 2
      const distance = Math.sqrt((cx - pxPdf) ** 2 + (cy - pyPdf) ** 2)
      
      if (distance < bestDistance) {
        bestDistance = distance
        bestByDistance = img
      }
    })
    
    // 优先返回包含点击点的图片，否则返回最近的图片
    const result = bestContains || (bestDistance < 200 ? bestByDistance : null) // 200像素内才考虑
    console.log('视觉块匹配结果:', result?.id, '距离:', bestDistance)
    return result
  }

  // 通用匹配函数（保留原有逻辑但简化）
  const matchAnnotation = (areaOrPoint) => {
    // 优先尝试匹配图片等视觉块
    const imageMatch = matchVisualAnnotation(areaOrPoint)
    if (imageMatch) {
      return imageMatch
    }

    // 如果没有匹配到图片，再匹配文本
    const anns = parsedByPage[pageNumber] || []
    const textAnns = anns.filter(ann => ann.type === 'text')
    
    if (textAnns.length === 0) {
      return null
    }

    // 注释与选区统一为容器像素坐标
    if (areaOrPoint && typeof areaOrPoint.x === 'number' && typeof areaOrPoint.width === 'number') {
      // 选区匹配文本
      const areaPdf = { 
        x: areaOrPoint.x, 
        y: areaOrPoint.y, 
        width: areaOrPoint.width, 
        height: areaOrPoint.height 
      }
      
    let best = null
      let bestIoU = 0
      
      textAnns.forEach(text => {
        const r = text.position
        const iou = rectIoU(areaPdf, r)
        if (iou > bestIoU) { 
          bestIoU = iou
          best = text 
        }
      })
      
      return (bestIoU > 0.02) ? best : null
    }
    
    // 点击匹配文本
    const { px, py } = areaOrPoint
    const pxPdf = px
    const pyPdf = py
    
    let bestContains = null
    let bestDistance = Infinity
    let bestByDistance = null
    
    textAnns.forEach(text => {
      const r = text.position
      
      const contains = pxPdf >= r.x && pxPdf <= r.x + r.width && 
                      pyPdf >= r.y && pyPdf <= r.y + r.height
      
      if (contains) {
        bestContains = text
      }
      
      const cx = r.x + r.width / 2
      const cy = r.y + r.height / 2
      const distance = Math.sqrt((cx - pxPdf) ** 2 + (cy - pyPdf) ** 2)
      
      if (distance < bestDistance) {
        bestDistance = distance
        bestByDistance = text
      }
    })
    
    return bestContains || bestByDistance
  }

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%' }}>
      {/* 左侧：PDF内容区域 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={styles.container} className="interactive-pdf-container">
          {!pdfFile && (
            <div style={styles.noFile}>
              <p>请从左侧上传PDF文件</p>
            </div>
          )}
          
          {loading && <div style={styles.loading}>PDF 加载中...</div>}
          
          {error && <div style={styles.error}>{error}</div>}

      {/* 控制按钮 */}
      <div style={{ 
        ...styles.controls,
        display: loading || error || !pdfFile ? 'none' : 'flex'
      }}>
        <button 
          style={styles.button} 
          onClick={goToPrevPage} 
          disabled={pageNumber <= 1}
        >
          上一页
        </button>
        
        <span style={styles.pageInfo}>
          第 
          <input
            style={styles.pageInput}
            type="number"
            min={1}
            max={numPages}
            value={pageNumber}
            onChange={(e) => goToPage(e.target.value)}
          />
          页，共 {numPages} 页
        </span>
        
        <button 
          style={styles.button} 
          onClick={goToNextPage} 
          disabled={pageNumber >= numPages}
        >
          下一页
        </button>

        <button 
          style={{
            ...styles.button, 
            backgroundColor: showDebugBounds ? '#dc3545' : '#6c757d',
            fontSize: '12px',
            padding: '8px 12px'
          }} 
          onClick={() => setShowDebugBounds(!showDebugBounds)}
          title={showDebugBounds ? "隐藏调试边界" : "显示调试边界"}
        >
          {showDebugBounds ? '🔍 隐藏边界' : '🔍 显示边界'}
        </button>


        {/* 坐标转换方法选择器 */}
        <select
          value={coordinateMethod}
          onChange={(e) => setCoordinateMethod(e.target.value)}
          style={{
            padding: '8px 12px',
            backgroundColor: '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            marginLeft: '8px'
          }}
          title={'选择坐标转换方法'}
        >
          <option value="auto">自动（PDF尺寸）</option>
          <option value="direct">PDF尺寸</option>
          <option value="dpi">bbox推断</option>
        </select>

        {/* 手动调整偏移 (隐藏) */}
        <div style={{ display: 'none' }} />

        {/* 方框缩放设置 (隐藏) */}
        <div style={{ display: 'none' }} />

        {/* pageScale开关 */}
        <label style={{ marginLeft: '8px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'white' }}>
          <input
            type="checkbox"
            checked={usePageScale}
            onChange={(e) => setUsePageScale(e.target.checked)}
            style={{ margin: 0 }}
          />
          使用pageScale
        </label>

        {/* 放大/缩小功能按需求已移除 */}

        {/* 多媒体文件管理按钮 */}
        {attachments.length > 0 && (
          <>
            {attachments.filter(att => !att.saved && !att.loaded).length > 0 && (
              <button 
                style={{
                  ...styles.button,
                  backgroundColor: '#28a745', 
                  color: 'white',
                  marginLeft: '8px'
                }} 
                onClick={saveMultimedias}
                disabled={savingMultimedias}
              >
                {savingMultimedias ? '💾 保存中...' : `💾 保存多媒体 (${attachments.filter(att => !att.saved && !att.loaded).length})`}
              </button>
            )}
            <button 
              style={{
                ...styles.button,
                backgroundColor: '#dc3545', 
                color: 'white',
                marginLeft: '8px'
              }} 
              onClick={clearAllMultimedias}
            >
              🗑️ 撤销未保存
            </button>
          </>
        )}

      </div>

      {/* 状态信息 */}
      <div style={{ 
        ...styles.statusBar,
        display: loading || error || !pdfFile ? 'none' : 'flex'
      }}>
        <span>附件: {attachments.filter(a => a.pageNumber === pageNumber).length} 个</span>
        <span>关联图片: {associatedImages.filter(img => img.pageNumber === pageNumber).length} 个</span>
        {loadingMultimedias && <span style={{ color: '#007bff' }}>🔄 加载多媒体中...</span>}
      </div>

      {/* PDF页面容器 - 使用CropBox尺寸，限制画布范围 */}
      <div style={{
        display: loading || error || !pdfFile ? 'none' : 'block',
        padding: '20px',
        margin: '0 auto',
        maxWidth: '100%',
        boxSizing: 'border-box',
        // 设置最大高度，允许滚动但限制画布范围
        maxHeight: 'calc(100vh - 200px)',
        overflow: 'auto'
      }}>
        {/* PDF页面容器 */}
        <div 
          style={{
            ...styles.pageContainer,
            userSelect: 'text',
            WebkitUserSelect: 'text',
            MozUserSelect: 'text',
            msUserSelect: 'text',
            // 仅根据宽度自适应，避免人为固定高度导致底部留白
            width: contentDimensions.width === 'auto' ? 'auto' : `${contentDimensions.width}px`,
            // 不固定高度/最小高度，让容器以内容真实高度为准
            maxWidth: '100%',
            margin: '0 auto',
            overflow: 'visible',
            display: 'block'
          }}
        ref={pageRef}
        onClick={(e) => {
          console.log('PDF容器点击事件')
          // 点击其他地方关闭菜单
          if (showContextMenu) {
            setShowContextMenu(false)
          }
        }}
      >
        <div className="interactive-pdf-content">
          <div
            ref={pageWrapperRef}
            style={styles.pageWrapper}
            onContextMenu={handleContextMenu}
          >
            <Document
              file={pdfFile}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              options={documentOptions}
            >
              <Page
                pageNumber={pageNumber}
                renderTextLayer={true}
                renderAnnotationLayer={true}
                scale={pageScale}
                // 关键：使用CropBox而不是MediaBox
                useCropBox={true}
                onLoadSuccess={(page) => {
                  console.log('页面渲染成功', page)
                  
                  // 步骤2：在渲染时，强制使用CropBox尺寸，避免高度被MediaBox拉大造成底部留白
                  const viewport = page.getViewport({ scale: 1.0, useCropBox: true })
                  
                  // 由于useCropBox=true，viewport已经是基于CropBox的尺寸
                  const pdfWidth = viewport.width
                  const pdfHeight = viewport.height
                  
                  console.log('PDF页面尺寸 (基于CropBox):', pdfWidth, 'x', pdfHeight)
                  
                  // 计算适合屏幕的缩放比例（稍微放大一点）
                  const availableWidth = window.innerWidth - 60
                  const availableHeight = window.innerHeight - 160
                  const widthScale = availableWidth / pdfWidth
                  const heightScale = availableHeight / pdfHeight
                  
                  // 选择较小的缩放比例，确保页面完全可见，同时整体放大1.5倍
                  // 略微缩小整体显示比例
                  const optimalScale = Math.min(widthScale, heightScale, 1.6)
                  const finalScale = Math.min(Math.max(optimalScale * 1.3, 0.5), 1.8)
                  
                  console.log('PDF内容尺寸 (基于CropBox):', pdfWidth, 'x', pdfHeight)
                  console.log('最终缩放比例:', finalScale)
                  
                  // 计算实际内容尺寸（基于CropBox和缩放比例）
                  const actualWidth = Math.round(pdfWidth * finalScale)
                  const actualHeight = Math.round(pdfHeight * finalScale)
                  
                  console.log('实际显示尺寸 (基于CropBox):', actualWidth, 'x', actualHeight)
                  
                  setPageScale(finalScale)
                  setContentDimensions({
                    width: actualWidth,
                    height: actualHeight
                  })
                }}
                onLoadError={(error) => {
                  console.error('页面渲染失败:', error)
                  setError('页面渲染失败: ' + error.message)
                  setLoading(false)
                }}
                className="interactive-page"
              />
            </Document>



            {/* 视频覆盖块：在原始PDF上覆盖控制图标，点击时才渲染视频 */}
            {attachments
              .filter(att => att.pageNumber === pageNumber && att.isVideo && att.area && !att.hidden)
              .map(att => {
                const area = att.area
                const isPlaying = videoStates[att.id]?.playing
                const hasStartedPlaying = videoStates[att.id]?.hasStarted
                return (
                  <div
                    key={`video_${att.id}`}
                    style={{
                      position: 'absolute',
                      left: area.x,
                      top: area.y,
                      width: area.width,
                      height: area.height,
                      zIndex: 10010, // 高于hover_region，确保可以接收点击事件
                      overflow: 'hidden',
                      borderRadius: hasStartedPlaying ? 4 : 0,
                      boxShadow: 'none', // 移除阴影效果
                      // 初始状态：透明背景，让原始PDF内容显示
                      background: hasStartedPlaying ? '#000' : 'transparent',
                      cursor: 'pointer' // 添加指针样式
                    }}
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      console.log('视频点击事件触发', { hasStartedPlaying, attId: att.id })
                      
                      if (!hasStartedPlaying) {
                        // 首次点击，开始播放视频
                        console.log('开始播放视频')
                        setVideoStates(prev => ({ 
                          ...prev, 
                          [att.id]: { playing: true, hasStarted: true } 
                        }))
                        // 延迟一点让video元素先渲染
                        setTimeout(() => {
                          const videoEl = videoRefs.current[att.id]
                          console.log('尝试播放视频元素', videoEl)
                          if (videoEl) {
                            videoEl.play().then(() => {
                              console.log('视频播放成功')
                            }).catch(e => {
                              console.error('视频播放失败:', e)
                            })
                          }
                        }, 100)
                      } else {
                        // 后续点击，切换播放/暂停
                        console.log('切换播放状态')
                        toggleVideoPlay(att.id)
                      }
                    }}
                    title={`${att.fileName}（点击${!hasStartedPlaying ? '播放' : (isPlaying ? '暂停' : '播放')}）`}
                  >
                    
                    {/* 只有开始播放后才渲染视频元素 */}
                    {hasStartedPlaying && (
                      <video
                        ref={el => { if (el) videoRefs.current[att.id] = el }}
                        src={att.videoUrl}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block'
                        }}
                        muted
                        playsInline
                        onPlay={() => setVideoStates(prev => ({ ...prev, [att.id]: { ...prev[att.id], playing: true } }))}
                        onPause={() => setVideoStates(prev => ({ ...prev, [att.id]: { ...prev[att.id], playing: false } }))}
                        onEnded={() => setVideoStates(prev => ({ ...prev, [att.id]: { ...prev[att.id], playing: false } }))}
                        onTimeUpdate={() => {
                          const video = videoRefs.current[att.id]
                          if (video) {
                            setVideoStates(prev => ({ 
                              ...prev, 
                              [att.id]: { 
                                ...prev[att.id], 
                                currentTime: video.currentTime,
                                duration: video.duration || prev[att.id]?.duration || 0
                              } 
                            }))
                          }
                        }}
                        onLoadedMetadata={() => {
                          const video = videoRefs.current[att.id]
                          if (video) {
                            // 设置初始播放速度
                            const playbackRate = videoStates[att.id]?.playbackRate || 1
                            video.playbackRate = playbackRate
                            
                            setVideoStates(prev => ({ 
                              ...prev, 
                              [att.id]: { 
                                ...prev[att.id], 
                                duration: video.duration || 0,
                                playbackRate: playbackRate
                              } 
                            }))
                          }
                        }}
                      />
                    )}
                    
                    {/* 播放按钮覆盖层 */}
                    {(!hasStartedPlaying || !isPlaying) && (
                      <div 
                        style={{
                          ...styles.videoPlayOverlay,
                          pointerEvents: 'none', // 让点击事件穿透到父容器
                          zIndex: 50000 // 确保播放按钮在最上层
                        }}
                      >
                        ▶
                      </div>
                    )}
                    
                  </div>
                )
              })}

            {/* 视频文件名标识 - 独立渲染在视频容器外部 */}
            {attachments
              .filter(att => att.pageNumber === pageNumber && att.isVideo && att.area && !att.hidden)
              .map(att => {
                const hasStartedPlaying = videoStates[att.id]?.hasStarted
                if (hasStartedPlaying) return null // 播放时不显示文件名
                
                return (
                  <div
                    key={`video_filename_${att.id}`}
                    style={{
                      position: 'absolute',
                      left: att.area.x,
                      top: att.area.y - 25, // 在bbox上方显示
                      background: 'rgba(0,0,0,0.8)',
                      color: 'white',
                      padding: '4px 8px',
                      borderRadius: 4,
                      fontSize: '11px',
                      pointerEvents: 'none',
                      userSelect: 'none',
                      zIndex: 1000,
                      maxWidth: att.area.width,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    📹 {att.fileName}
                  </div>
                )
              })}
            {attachments
              .filter(att => att.pageNumber === pageNumber && att.isVideo && att.area && !att.hidden)
              .map(att => (
                <VideoProgressBar
                  key={`video_progress_${att.id}`}
                  attachment={att}
                  videoStates={videoStates}
                  handleVideoProgressChange={handleVideoProgressChange}
                  formatTime={formatTime}
                  onPlayPause={handleVideoPlayPause}
                  onSpeedChange={handleVideoSpeedChange}
                  onFullscreen={handleVideoFullscreen}
                />
              ))}

            {/* 音频覆盖块：完全复制视频的处理逻辑 */}
            {attachments
              .filter(att => att.pageNumber === pageNumber && att.isAudio && att.area && !att.hidden)
              .map(att => {
                const area = att.area
                const isPlaying = audioStates[att.id]?.playing
                const hasStartedPlaying = audioStates[att.id]?.hasStarted
                return (
                  <div
                    key={`audio_${att.id}`}
                    style={{
                      position: 'absolute',
                      left: area.x,
                      top: area.y,
                      width: area.width,
                      height: area.height,
                      zIndex: 10010, // 高于hover_region，确保可以接收点击事件
                      overflow: 'hidden',
                      borderRadius: hasStartedPlaying ? 4 : 0,
                      boxShadow: 'none', // 移除阴影效果
                      // 初始状态：透明背景，让原始PDF内容显示
                      background: hasStartedPlaying ? 'rgba(0, 123, 255, 0.1)' : 'transparent',
                      cursor: 'pointer' // 添加指针样式
                    }}
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      console.log('音频点击事件触发', { hasStartedPlaying, attId: att.id })
                      
                      if (!hasStartedPlaying) {
                        // 首次点击，开始播放音频
                        console.log('开始播放音频')
                        setAudioStates(prev => ({ 
                          ...prev, 
                          [att.id]: { playing: true, hasStarted: true } 
                        }))
                        // 延迟一点让audio元素先渲染
                        setTimeout(() => {
                          const audioEl = audioRefs.current[att.id]
                          console.log('尝试播放音频元素', audioEl)
                          if (audioEl) {
                            audioEl.play().then(() => {
                              console.log('音频播放成功')
                            }).catch(e => {
                              console.error('音频播放失败:', e)
                            })
                          }
                        }, 100)
                      } else {
                        // 后续点击，切换播放/暂停
                        console.log('切换播放状态')
                        toggleAudioPlay(att.id)
                      }
                    }}
                    title={`${att.fileName}（点击${!hasStartedPlaying ? '播放' : (isPlaying ? '暂停' : '播放')}）`}
                  >
                    
                    {/* 音频播放时的灰色半透明遮罩 */}
                    {hasStartedPlaying && (
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          background: 'rgba(128, 128, 128, 0.3)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          position: 'relative'
                        }}
                      >
                        {/* 隐藏的音频元素 */}
                        <audio
                          ref={el => { 
                            if (el) {
                              audioRefs.current[att.id] = el
                              console.log(`音频元素已创建: ${att.id}`, el)
                              // 初始化音频状态
                              if (!audioStates[att.id]) {
                                setAudioStates(prev => ({
                                  ...prev,
                                  [att.id]: {
                                    playing: false,
                                    hasStarted: false,
                                    currentTime: 0,
                                    duration: 0
                                  }
                                }))
                              }
                            }
                          }}
                          src={att.audioUrl}
                          style={{ display: 'none' }}
                          preload="metadata"
                          onTimeUpdate={() => {
                            const audioEl = audioRefs.current[att.id]
                            if (audioEl) {
                              setAudioStates(prev => ({ 
                                ...prev, 
                                [att.id]: { 
                                  ...prev[att.id], 
                                  currentTime: audioEl.currentTime 
                                } 
                              }))
                            }
                          }}
                          onLoadedMetadata={() => {
                            const audioEl = audioRefs.current[att.id]
                            if (audioEl) {
                              console.log(`音频元数据已加载: ${att.id}`, { duration: audioEl.duration })
                              setAudioStates(prev => ({ 
                                ...prev, 
                                [att.id]: { 
                                  ...prev[att.id], 
                                  duration: audioEl.duration 
                                } 
                              }))
                            }
                          }}
                          onPlay={() => {
                            console.log(`音频开始播放: ${att.id}`)
                            setAudioStates(prev => ({ 
                              ...prev, 
                              [att.id]: { 
                                ...prev[att.id], 
                                playing: true 
                              } 
                            }))
                          }}
                          onPause={() => {
                            console.log(`音频暂停: ${att.id}`)
                            setAudioStates(prev => ({ 
                              ...prev, 
                              [att.id]: { 
                                ...prev[att.id], 
                                playing: false 
                              } 
                            }))
                          }}
                          onError={(e) => {
                            console.error(`音频加载错误: ${att.id}`, e)
                          }}
                        />
                      </div>
                    )}
                    
                    {/* 播放按钮覆盖层 */}
                    {(!hasStartedPlaying || !isPlaying) && (
                      <div 
                        style={{
                          ...styles.videoPlayOverlay,
                          pointerEvents: 'none', // 让点击事件穿透到父容器
                          zIndex: 50000 // 确保播放按钮在最上层
                        }}
                      >
                        ▶
                      </div>
                    )}
                    
                  </div>
                )
              })}

            {/* 音频文件名标识 - 独立渲染在音频容器外部 */}
            {attachments
              .filter(att => att.pageNumber === pageNumber && att.isAudio && att.area && !att.hidden)
              .map(att => {
                const hasStartedPlaying = audioStates[att.id]?.hasStarted
                if (hasStartedPlaying) return null // 播放时不显示文件名
                
                return (
                  <div
                    key={`audio_filename_${att.id}`}
                    style={{
                      position: 'absolute',
                      left: att.area.x,
                      top: att.area.y - 25, // 在bbox上方显示
                      background: 'rgba(0,0,0,0.8)',
                      color: 'white',
                      padding: '4px 8px',
                      borderRadius: 4,
                      fontSize: '11px',
                      pointerEvents: 'none',
                      userSelect: 'none',
                      zIndex: 1000,
                      maxWidth: att.area.width,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    🎵 {att.fileName}
                  </div>
                )
              })}
            {attachments
              .filter(att => att.pageNumber === pageNumber && att.isAudio && att.area && !att.hidden)
              .map(att => (
                <AudioProgressBar
                  key={`audio_progress_${att.id}`}
                  attachment={att}
                  audioStates={audioStates}
                  handleAudioProgressChange={handleAudioProgressChange}
                  formatTime={formatTime}
                />
              ))}

            {/* 图片文件名标识 - 独立渲染在图片容器外部 */}
            {attachments
              .filter(att => att.pageNumber === pageNumber && att.isImage && att.area && !att.hidden)
              .map(att => (
                <div
                  key={`image_filename_${att.id}`}
                  style={{
                    position: 'absolute',
                    left: att.area.x,
                    top: att.area.y - 25, // 在bbox上方显示
                    background: 'rgba(0,0,0,0.8)',
                    color: 'white',
                    padding: '4px 8px',
                    borderRadius: 4,
                    fontSize: '11px',
                    pointerEvents: 'none',
                    userSelect: 'none',
                    zIndex: 1000,
                    maxWidth: att.area.width,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  🖼️ {att.fileName}
                </div>
              ))}

            {/* 图片覆盖块：恰好覆盖识别区，点击切换填充模式或打开新窗口 */}
            {attachments
              .filter(att => att.pageNumber === pageNumber && att.isImage && att.area && !att.hidden)
              .map(att => {
                const area = att.area
                const fit = imageStates[att.id]?.fit || 'cover'
                return (
                  <div
                    key={`image_${att.id}`}
                    style={{
                      position: 'absolute',
                      left: area.x,
                      top: area.y,
                      width: area.width,
                      height: area.height,
                      zIndex: 12,
                      overflow: 'hidden',
                      borderRadius: 4,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                    }}
                    title={`${att.fileName}（点击切换铺放模式）`}
                    onClick={(e) => { e.stopPropagation(); toggleImageFit(att.id) }}
                    onDoubleClick={(e) => { e.stopPropagation(); const w = window.open(att.imageUrl, '_blank'); if (w) w.document.title = att.fileName }}
                  >
                    <img
                      src={att.imageUrl}
                      alt={att.fileName}
                      draggable={false}
                      style={{ width: '100%', height: '100%', objectFit: fit, display: 'block' }}
                    />
                    <div style={styles.imageFitOverlay}>{fit === 'cover' ? '填充' : '适应'}</div>
                  </div>
                )
              })}

            {/* 悬浮于图/表区域时，显示"上传"快捷按钮（整个框内悬浮） */}
            {(() => {
              const anns = (parsedByPage[pageNumber] || []).filter(a => a.type === 'image' || a.type === 'table' || (!a.id?.startsWith?.('text') && a.type !== 'text'))
              if (!anns.length) return null
              return anns.map(ann => {
                return (
                  <div
                    key={`hover_region_${ann.id}`}
                    style={{
                      position: 'absolute',
                      left: ann.position.x,
                      top: ann.position.y - 30, // 向上扩展30px来覆盖上传按钮
                      width: ann.position.width,
                      height: ann.position.height + 30, // 增加高度来包含上传按钮区域
                      background: 'transparent',
                      zIndex: 10005, // 确保在视频容器之上
                      pointerEvents: 'auto' // 恢复正常的鼠标事件处理
                    }}
                    onMouseEnter={() => setHoveredAnnId(ann.id)}
                    onMouseLeave={() => setHoveredAnnId(prev => (prev === ann.id ? null : prev))}
                    onClick={(e) => { e.stopPropagation() }}
                    title={ann.name || (ann.type === 'image' ? '图片' : '表格')}
                  >
                  {hoveredAnnId === ann.id && (
                    <div style={{ position: 'relative' }}>
                      {/* 上传文件组件 */}
                      <UploadFileButton
                        position={{
                          left: 8,
                          top: 0,
                          menuLeft: ann.position.x - 8,
                          menuTop: ann.position.y - 30 + 32
                        }}
                        showFileTypeMenu={showFileTypeMenu}
                        setShowFileTypeMenu={setShowFileTypeMenu}
                        fileTypes={fileTypes}
                        selectedFileType={selectedFileType}
                        setSelectedFileType={setSelectedFileType}
                        uploadForAnnotation={uploadForAnnotation}
                        ann={ann}
                        onMenuToggle={(menuInfo) => {
                          setCurrentMenu(menuInfo)
                        }}
                      />
                      
                      {/* 显示/隐藏按钮 */}
                      <VisibilityButton
                        position={{
                          left: 8 + 80 + 8, // 上传按钮宽度(80) + 间距(8)
                          top: 0
                        }}
                        ann={ann}
                        attachments={attachments}
                        pageNumber={pageNumber}
                        toggleAttachmentVisibility={toggleAttachmentVisibility}
                      />
                      
                      {/* 删除按钮 */}
                      <DeleteButton
                        position={{
                          left: 8 + 80 + 8 + 80 + 8, // 上传按钮宽度(80) + 间距(8) + 显示/隐藏按钮宽度(80) + 间距(8)
                          top: 0
                        }}
                        ann={ann}
                        attachments={attachments}
                        pageNumber={pageNumber}
                        deleteAttachment={deleteAttachment}
                      />
                    </div>
                  )}
                </div>
                )
              })
            })()}

            {/* 渲染关联的图片标记（放到与页面同层） */}
            {associatedImages
              .filter(img => img.pageNumber === pageNumber)
              .map(img => (
                <div
                  key={img.id}
                  style={{
                    ...styles.associatedImage,
                    left: (img.area?.x ?? 20),
                    top: (img.area?.y ?? 20)
                  }}
                  title={`关联图片: ${img.fileName}`}
                  onClick={() => {
                    // 点击显示图片预览
                    const preview = window.open(img.imageUrl, '_blank')
                    if (preview) {
                      preview.document.title = img.fileName
                    }
                  }}
                >
                  🖼️
                </div>
              ))
            }

            {/* 调试：显示解析块边界框 */}
            {showDebugBounds && (() => {
              const anns = parsedByPage[pageNumber] || []
              const base = basePageSize[pageNumber]
              
              console.log('边界框渲染检查:', {
                showDebugBounds,
                annsCount: anns.length,
                base,
                pageNumber
              })
              
              if (!base) {
                console.log('没有basePageSize，跳过边界框渲染')
                return null
              }
              
              const overlays = []

              // 如果没有任何解析块，至少画出整页边框，帮助确认层级无问题
              if (anns.length === 0) {
                const wrapperRect = pageWrapperRef.current?.getBoundingClientRect()
                const pageRect = pageWrapperRef.current?.querySelector('.react-pdf__Page')?.getBoundingClientRect()
                const oX = pageRect && wrapperRect ? (pageRect.left - wrapperRect.left) : 0
                const oY = pageRect && wrapperRect ? (pageRect.top - wrapperRect.top) : 0
                overlays.push(
                  <div
                    key={`debug-page-${pageNumber}`}
                    style={{
                      position: 'absolute',
                      left: oX,
                      top: oY,
                      width: base.width * pageScale,
                      height: base.height * pageScale,
                      border: '2px dashed #999',
                      background: 'transparent',
                      pointerEvents: 'none',
                      zIndex: 14
                    }}
                    title={'页面边界(用于调试)'}
                  />
                )
              }

              anns.forEach((ann) => {
                const r = ann.position
                // 现在所有position均为容器像素坐标，直接渲染
                const left = r.x
                const top = r.y
                const width = r.width
                const height = r.height
                
                overlays.push(
                  <div
                    key={`debug-${ann.id}`}
                    style={{
                      position: 'absolute',
                      left,
                      top,
                      width,
                      height,
                      border: ann.type === 'table' ? '3px solid green' : 
                              ann.type === 'image' ? '3px solid lightblue' : '1px solid red',
                      backgroundColor: ann.type === 'table' ? 'rgba(0,0,0,0)' : 
                                      ann.type === 'image' ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,0)',
                      pointerEvents: 'none',
                      zIndex: 15,
                      fontSize: '10px',
                      color: ann.type === 'text' ? 'red' : 'blue',
                      padding: '2px',
                      overflow: 'hidden'
                    }}
                    title={`${ann.type}: ${ann.content || ann.name}`}
                  >
                  </div>
                )
              })
              return overlays
            })()}
          </div>
        </div>
      </div>
      </div>

      {/* 上下文菜单 */}
      {showContextMenu && (
        <div
          style={{
            ...styles.contextMenu,
            left: contextMenuPos.x,
            top: contextMenuPos.y,
            zIndex: 50010,
          }}
        >
          {/* 文件类型选择菜单 */}
          <div style={{ padding: '4px 0', borderBottom: '1px solid #e9ecef', zIndex: 50010 }}>
            <div style={{ padding: '4px 12px', fontSize: 12, color: '#6c757d', fontWeight: 'bold' }}>
              📎 上传文件类型
            </div>
            {fileTypes.map(fileType => (
              <button 
                key={fileType.id}
                style={{
                  ...styles.menuItem,
                  backgroundColor: selectedFileType === fileType.id ? '#e3f2fd' : 'transparent',
                  fontWeight: selectedFileType === fileType.id ? 'bold' : 'normal'
                }}
                onClick={() => {
                  triggerFileUpload()
                }}
                onMouseEnter={(e) => {
                  if (selectedFileType !== fileType.id) {
                    setSelectedFileType(fileType.id)
                    e.target.style.backgroundColor = '#f8f9fa'
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedFileType !== fileType.id) {
                    e.target.style.backgroundColor = 'transparent'
                  }
                }}
              >
                {fileType.icon} {fileType.name}
              </button>
            ))}
          </div>
          
          {/* 调试显示匹配到的块 + 关联到"图片几/表格几" */}
          {(() => {
            const wrapperRect = pageWrapperRef.current?.getBoundingClientRect()
            let matched = null
            if (wrapperRect) {
              matched = matchVisualAnnotation({ px: contextMenuPos.x - wrapperRect.left, py: contextMenuPos.y - wrapperRect.top })
            }
            if (matched) {
              return (
                <div style={{ padding: '6px 12px', fontSize: 12, color: '#6c757d' }}>
                  {matched.type === 'image' ? `关联到：${matched.name || '图片'}` : `关联块: 文本`}
                </div>
              )
            }
            return null
          })()}
        </div>
      )}


      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={handleFileUpload}
        accept={fileTypes.find(ft => ft.id === selectedFileType)?.accept || '*/*'}
      />

      {/* 上传状态提示 */}
      {uploadStatus && (
        <div style={{
          ...styles.uploadStatus,
          backgroundColor: uploadStatus.type === 'success' ? '#d4edda' : 
                          uploadStatus.type === 'error' ? '#f8d7da' : '#fff3cd',
          color: uploadStatus.type === 'success' ? '#155724' : 
                 uploadStatus.type === 'error' ? '#721c24' : '#856404'
        }}>
          {uploadStatus.message}
        </div>
      )}

      {/* 独立渲染的菜单 - 脱离hover_region层级限制 */}
      {currentMenu && currentMenu.show && (
        <div
          style={{
            position: 'absolute',
            left: currentMenu.position.left,
            top: currentMenu.position.top,
            background: 'white',
            border: '1px solid #ddd',
            borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 50010, // 使用超高z-index确保在最上层
            minWidth: 120
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {currentMenu.type === 'upload' && (
            <>
              <div style={{ padding: '4px 0', borderBottom: '1px solid #e9ecef' }}>
                <div style={{ padding: '4px 12px', fontSize: 12, color: '#6c757d', fontWeight: 'bold' }}>
                  📎 上传文件类型
                </div>
              </div>
              {currentMenu.fileTypes.map(fileType => (
                <div
                  key={fileType.id}
                  style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    fontSize: 13,
                    backgroundColor: currentMenu.selectedFileType === fileType.id ? '#e3f2fd' : 'transparent',
                    fontWeight: currentMenu.selectedFileType === fileType.id ? 'bold' : 'normal',
                    borderBottom: fileType.id !== currentMenu.fileTypes[currentMenu.fileTypes.length - 1].id ? '1px solid #f0f0f0' : 'none'
                  }}
                  onClick={() => {
                    currentMenu.uploadForAnnotation(currentMenu.ann)
                    setCurrentMenu(null)
                  }}
                  onMouseEnter={(e) => {
                    if (currentMenu.selectedFileType !== fileType.id) {
                      currentMenu.setSelectedFileType(fileType.id)
                      e.target.style.backgroundColor = '#f8f9fa'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (currentMenu.selectedFileType !== fileType.id) {
                      e.target.style.backgroundColor = 'transparent'
                    }
                  }}
                >
                  {fileType.icon} {fileType.name}
                </div>
              ))}
            </>
          )}
          
          {/* 操作菜单已移除，现在使用直接的显示/隐藏和删除按钮 */}
        </div>
      )}
        </div>
      </div>

    </div>
  )
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '20px',
    maxWidth: '100%',
    // 移除minHeight，让容器自然适应内容
    position: 'relative',
    boxSizing: 'border-box',
    // 确保没有额外的滚动空间
    overflow: 'visible'
  },
  noFile: {
    padding: '60px 20px',
    textAlign: 'center',
    color: '#666',
    fontSize: '16px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    border: '2px dashed #dee2e6'
  },
  loading: {
    padding: '40px',
    fontSize: '18px',
    color: '#666'
  },
  error: {
    padding: '20px',
    backgroundColor: '#f8d7da',
    color: '#721c24',
    borderRadius: '6px',
    margin: '20px 0'
  },
  controls: {
    margin: '16px 0',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
    transform: 'scale(0.85)', // 缩小整体UI
    transformOrigin: 'top center'
  },
  button: {
    padding: '8px 16px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px'
  },
  pageInfo: {
    margin: '0 15px',
    fontSize: '16px',
    fontWeight: '500'
  },
  pageInput: {
    width: '60px',
    padding: '5px',
    textAlign: 'center',
    border: '1px solid #ccc',
    borderRadius: '4px',
    margin: '0 5px'
  },
  statusBar: {
    display: 'flex',
    gap: '20px',
    marginBottom: '10px',
    fontSize: '14px',
    color: '#666'
  },
  pageContainer: {
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
    // 使用自然布局，避免额外空间
    display: 'inline-block',
    // 移除flexShrink，让内容自然显示
    margin: '0 auto'
  },
  pageWrapper: {
    position: 'relative'
  },
  associatedImage: {
    position: 'absolute',
    width: '24px',
    height: '24px',
    backgroundColor: '#28a745',
    color: 'white',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    cursor: 'pointer',
    pointerEvents: 'auto',
    zIndex: 10
  },
  attachment: {
    position: 'absolute',
    width: '24px',
    height: '24px',
    backgroundColor: '#007bff',
    color: 'white',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    cursor: 'pointer',
    zIndex: 10,
    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
  },
  contextMenu: {
    position: 'fixed',
    backgroundColor: 'white',
    border: '1px solid #ccc',
    borderRadius: '6px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    zIndex: 10002,
    padding: '5px 0',
    minWidth: '150px'
  },
  menuItem: {
    display: 'block',
    width: '100%',
    padding: '10px 20px',
    border: 'none',
    backgroundColor: 'transparent',
    textAlign: 'left',
    cursor: 'pointer',
    fontSize: '14px',
    whiteSpace: 'nowrap',
    transition: 'background-color 0.2s'
  },
  uploadStatus: {
    position: 'fixed',
    top: '20px',
    right: '20px',
    padding: '12px 20px',
    borderRadius: '6px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    zIndex: 10001,
    fontSize: '14px',
    fontWeight: '500'
  },
  associatedImage: {
    position: 'absolute',
    width: '28px',
    height: '28px',
    backgroundColor: '#28a745',
    color: 'white',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    cursor: 'pointer',
    zIndex: 10,
    boxShadow: '0 2px 8px rgba(40, 167, 69, 0.3)',
    transition: 'transform 0.2s, box-shadow 0.2s'
  },
  videoPlayOverlay: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.25)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'white',
    fontSize: '42px',
    pointerEvents: 'none'
  },
  audioPlayOverlay: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'white',
    fontSize: '42px',
    pointerEvents: 'none',
    cursor: 'pointer',
    userSelect: 'none',
    zIndex: 50000
  },
  imageFitOverlay: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    background: 'rgba(0,0,0,0.45)',
    color: 'white',
    fontSize: '12px',
    padding: '2px 6px',
    borderRadius: 4,
    pointerEvents: 'none'
  },
  overlayControls: {
    position: 'absolute',
    left: 6,
    top: 6,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    zIndex: 10001 // 提高到最上层，高于音频播放按钮
  },
  overlayBtn: {
    background: 'rgba(0,0,0,0.55)',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    width: 26,
    height: 26,
    cursor: 'pointer',
    fontSize: 12,
    lineHeight: '26px'
  },
  hoverBadge: {
    position: 'absolute',
    background: 'rgba(0,123,255,0.9)',
    color: '#fff',
    borderRadius: 4,
    padding: '2px 6px',
    fontSize: 12,
    cursor: 'pointer',
    zIndex: 50005, // 使用超高z-index确保在最上层
    boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
  },
  hiddenToggle: {
    background: 'rgba(0,0,0,0.55)',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    width: 26,
    height: 22,
    cursor: 'pointer',
    fontSize: 12,
    lineHeight: '22px'
  }
}  
export default KDFViewer



