import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import * as pdfjsLib from 'pdfjs-dist'
// CSS样式已在App.css中定义

// 使用本地worker文件，避免CORS问题 - 统一使用5.3.93版本
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf-worker/pdf.worker.min.js'
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf-worker/pdf.worker.min.js'

const InteractivePDFViewer = ({ file }) => {
  const [numPages, setNumPages] = useState(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedText, setSelectedText] = useState('')
  const [selectedArea, setSelectedArea] = useState(null)
  const [showContextMenu, setShowContextMenu] = useState(false)
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 })
  const [highlights, setHighlights] = useState([])
  const [attachments, setAttachments] = useState([])
  const [uploadStatus, setUploadStatus] = useState(null)
  const [showHighlightConfirm, setShowHighlightConfirm] = useState(false)
  const [highlightConfirmPos, setHighlightConfirmPos] = useState({ x: 0, y: 0 })
  const [currentTargetBlock, setCurrentTargetBlock] = useState(null) // { type: 'text'|'image', area, text? }
  const [pdfDoc, setPdfDoc] = useState(null)
  const [parsedByPage, setParsedByPage] = useState({}) // { [pageNumber]: Annotation[] }
  const [basePageSize, setBasePageSize] = useState({}) // { [pageNumber]: { width, height } }
  const [associatedImages, setAssociatedImages] = useState([]) // 新增：关联的图片
  const [showDebugBounds, setShowDebugBounds] = useState(false) // 调试：显示解析块边界
  const [pageScale, setPageScale] = useState(1) // PDF页面缩放比例
  const [contentDimensions, setContentDimensions] = useState({ width: 'auto', height: 'auto' }) // 内容实际尺寸

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

  // 处理文本选择 - 左键拖拽后弹出“是否高亮”确认
  const handleTextSelection = (event) => {
    console.log('文本选择事件触发')
    setTimeout(() => {
      const selection = window.getSelection()
      const selectedText = selection.toString().trim()
      console.log('选中的文本:', selectedText)
      
      if (selectedText) {
        setSelectedText(selectedText)
        
        try {
          // 获取选中区域的位置
          const range = selection.getRangeAt(0)
          const rect = range.getBoundingClientRect()
          const pageRect = pageWrapperRef.current?.getBoundingClientRect()
          
          console.log('选中区域rect:', rect)
          console.log('页面rect:', pageRect)
          
          if (pageRect) {
            const selectedArea = {
              x: rect.left - pageRect.left,
              y: rect.top - pageRect.top,
              width: rect.width,
              height: rect.height,
              text: selectedText
            }
            setSelectedArea(selectedArea)
            setCurrentTargetBlock({ type: 'text', area: selectedArea, text: selectedText })
            console.log('设置选中区域:', selectedArea)
            // 弹出确认气泡
            setHighlightConfirmPos({ x: rect.right, y: Math.max(0, rect.top - 36) })
            setShowHighlightConfirm(true)
          }
        } catch (error) {
          console.error('获取选中区域位置失败:', error)
        }
      }
    }, 100) // 延迟一点确保选择完成
  }

  // 处理右键菜单
  const handleContextMenu = (event) => {
    console.log('右键菜单事件触发')
    event.preventDefault()
    event.stopPropagation()
    
    const selection = window.getSelection()
    const selectedText = selection.toString().trim()
    console.log('右键时的选中文本:', selectedText)
    const menuPos = { x: event.clientX, y: event.clientY }
    setContextMenuPos(menuPos)

    if (selectedText && selectedArea) {
      setCurrentTargetBlock({ type: 'text', area: selectedArea, text: selectedText })
    } else {
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
    }

    setShowContextMenu(true)
  }

  // 关闭上下文菜单
  const closeContextMenu = () => {
    setShowContextMenu(false)
  }

  // 高亮选中的文本
  const highlightSelectedText = () => {
    if (selectedArea && selectedText) {
      const newHighlight = {
        id: `highlight_${Date.now()}`,
        pageNumber,
        area: selectedArea,
        text: selectedText,
        color: '#ffff00',
        createdAt: new Date().toISOString()
      }
      
      setHighlights(prev => [...prev, newHighlight])
      setShowContextMenu(false)
      
      // 清除选择
      window.getSelection().removeAllRanges()
      setSelectedText('')
      setSelectedArea(null)
    }
  }

  // 移除高亮
  const removeHighlight = (highlightId) => {
    setHighlights(prev => prev.filter(h => h.id !== highlightId))
  }

  // 触发文件上传
  const triggerFileUpload = () => {
    // 在真正上传前，基于当前选择/点击，匹配解析块，记录到 currentTargetBlock
    const wrapperRect = pageWrapperRef.current?.getBoundingClientRect()
    let matched = null
    if (selectedArea && selectedText) {
      // 选中文本时也优先匹配最近图片/表格
      matched = matchVisualAnnotation(selectedArea) || matchAnnotation(selectedArea)
      if (matched) setCurrentTargetBlock({ type: matched.type || 'image', area: matched.position, text: matched.content, targetId: matched.id, targetName: matched.name })
    } else if (wrapperRect) {
      // 右键点击优先匹配图片/表格
      matched = matchVisualAnnotation({ px: contextMenuPos.x - wrapperRect.left, py: contextMenuPos.y - wrapperRect.top })
      if (matched) setCurrentTargetBlock({ type: matched.type || 'image', area: matched.position, text: matched.content, targetId: matched.id, targetName: matched.name })
    }
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
      
      // 模拟上传成功/失败
      const isSuccess = Math.random() > 0.3 // 70% 成功率
      
      if (isSuccess) {
        const newAttachment = {
          id: `attachment_${Date.now()}`,
          pageNumber,
          area: (currentTargetBlock?.area || selectedArea),
          fileName: uploadedFile.name,
          fileSize: uploadedFile.size,
          fileType: uploadedFile.type,
          uploadedAt: new Date().toISOString(),
          targetType: currentTargetBlock?.type || 'image',
          targetText: currentTargetBlock?.text,
          targetId: currentTargetBlock?.targetId,
          targetName: currentTargetBlock?.targetName
        }
        
        setAttachments(prev => [...prev, newAttachment])
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

  // 关联图片到当前选择区域 - 已移除，不再需要
  const associateImage = () => {
    // 此功能已移除，不再需要单独的关联图片选项
    console.log('关联图片功能已移除')
  }

  // 移除关联的图片
  const removeAssociatedImage = (imageId) => {
    setAssociatedImages(prev => prev.filter(img => img.id !== imageId))
  }

  // 确认/取消高亮
  const confirmHighlight = () => {
    if (!selectedArea || !selectedText) {
      setShowHighlightConfirm(false)
      return
    }
    const newHighlight = {
      id: `highlight_${Date.now()}`,
      pageNumber,
      area: selectedArea,
      text: selectedText,
      color: '#ffff00',
      createdAt: new Date().toISOString()
    }
    setHighlights(prev => [...prev, newHighlight])
    setShowHighlightConfirm(false)
    window.getSelection().removeAllRanges()
    setSelectedText('')
    setSelectedArea(null)
  }

  const cancelHighlight = () => {
    setShowHighlightConfirm(false)
    window.getSelection().removeAllRanges()
    setSelectedText('')
    setSelectedArea(null)
  }

  // 点击页面其他地方关闭菜单
  useEffect(() => {
    const handleClickOutside = () => {
      closeContextMenu()
    }
    
    if (showContextMenu) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [showContextMenu])

  useEffect(() => {
    console.log('交互式编辑器useEffect触发，文件:', file?.name)
    setLoading(true)
    setError(null)
    setPageNumber(1)
    setPageScale(1) // 重置缩放比例
    setContentDimensions({ width: 'auto', height: 'auto' }) // 重置内容尺寸
    setHighlights([])
    setAttachments([])
    setAssociatedImages([]) // 重置关联图片
    
    // 文件健康检查
    if (file) {
      console.log('文件检查 - 大小:', file.size, '类型:', file.type)
      
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
    } else {
      setLoading(false)
    }
  }, [file])

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

  // 解析当前页，生成与解析器一致的块（文本合并+图片占位）
  useEffect(() => {
    const parseCurrentPage = async () => {
      if (!pdfDoc || !pageNumber) return
      try {
        const page = await pdfDoc.getPage(pageNumber)
        
        // 使用CropBox的viewport，确保坐标系一致
        const viewport = page.getViewport({ scale: 1.0, useCropBox: true })

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

        // 文本收集
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

        // 智能区域识别：识别表格和图片等大区域
        const annotations = []
        // 统一坐标：把所有识别到的区域转换为“容器像素坐标”（相对于pageWrapperRef的绝对定位）
        const wrapperRect = pageWrapperRef.current?.getBoundingClientRect()
        const pdfPageElement = pageWrapperRef.current?.querySelector('.react-pdf__Page')
        const pageRect = pdfPageElement?.getBoundingClientRect()
        const offsetX = pageRect && wrapperRect ? (pageRect.left - wrapperRect.left) : 0
        const offsetY = pageRect && wrapperRect ? (pageRect.top - wrapperRect.top) : 0
        
        // 1. 检测表格区域（基于文本密度和布局）
        const detectTables = (textItems) => {
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
              if (rowGroups[i].length >= 4) { // 每行至少4列
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
                
                // 为表格创建更大的边距
                const tablePadding = 30
                const tableX = Math.max(0, minX - tablePadding)
                const tableY = Math.max(0, minY - tablePadding)
                const tableW = Math.min(viewport.width - tableX, maxX - minX + tablePadding * 2)
                const tableH = Math.min(viewport.height - tableY, maxY - minY + tablePadding * 2)
                
                // 转成容器像素坐标
                const pxX = offsetX + tableX * pageScale
                const pxY = offsetY + tableY * pageScale
                const pxW = tableW * pageScale
                const pxH = tableH * pageScale
                tables.push({
                  id: `table_${pageNumber}_0`,
                  type: 'table',
                  position: {
                    x: Math.round(pxX * 100) / 100,
                    y: Math.round(pxY * 100) / 100,
                    width: Math.round(pxW * 100) / 100,
                    height: Math.round(pxH * 100) / 100
                  },
                  content: `表格区域 (${tableRows.length}行 x ${Math.max(...tableRows.map(r => r.length))}列)`,
                  rows: tableRows.length,
                  cols: Math.max(...tableRows.map(r => r.length))
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
          
          for (let i = 0; i < operatorList.fnArray.length; i++) {
            const op = operatorList.fnArray[i]
            const args = operatorList.argsArray[i]
            
            if (op === pdfjs.OPS.save) {
              transformStack.push([...currentTransform])
            } else if (op === pdfjs.OPS.restore) {
              const restored = transformStack.pop()
              if (restored) currentTransform = restored
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

            const figureLines = lineObjs.filter(l => /(Figure|Fig\.)\s*\d+/i.test(l.text))
            const tableLines = lineObjs.filter(l => /(Table)\s*\d+/i.test(l.text))

            const addBlockAboveCaption = (cap, kind, idxBase) => {
              // 在包含 Figure/Table 的标题附近做“窄范围”搜索，减少过大框
              const capBand = Math.max(0, Math.floor(cap.y / bandH))
              const searchUp = Math.floor((pageH * 0.35) / bandH) // 向上最多搜 35% 页高
              const startBand = Math.max(0, capBand - searchUp)

              // 从标题向上，找到一段低密度带；遇到明显高密度(>0.22)则截止，避免跨到正文
              let b0 = -1, b1 = -1
              for (let b = capBand - 1; b >= startBand; b--) {
                const ratio = bandCover[b] / (bandArea || 1)
                if (ratio < 0.12) {
                  if (b1 === -1) b1 = b
                  b0 = b
                } else if (ratio > 0.22) {
                  // 碰到较高密度说明到了正文，停止
                  if (b0 !== -1) break
                  else break
                } else if (b0 !== -1) {
                  // 低密度段结束
                  break
                }
              }
              if (b0 === -1 || b1 === -1) return

              const yMin = b0 * bandH
              const yMax = (b1 + 1) * bandH
              let boxH = yMax - yMin - 8
              if (boxH < 60) return

              // 利用标题的宽度近似图/表宽度，左右各加少量 padding
              const padX = Math.min(24, cap.width * 0.08)
              let x = Math.max(margin, cap.x - padX)
              let w = Math.min(pageW - x - margin, cap.width + padX * 2)

              // 限制最大高度，避免出现跨越过高的框
              const maxH = Math.min(pageH * 0.55, cap.width * 0.9)
              boxH = Math.min(boxH, maxH)

              // 转换为容器像素坐标
              const pxX = offsetX + x * pageScale
              const pxW = Math.max(80, w * pageScale)
              const pxY = offsetY + Math.max(0, yMin + 5) * pageScale
              const pxH = Math.max(60, boxH * pageScale)

              // 过滤：区域内存在少量元素（对图形：坐标轴/刻度文本；对表格：表头文本）
              const textInside = textItems.some(t => {
                const tx = t.x * pageScale + offsetX
                const ty = t.y * pageScale + offsetY
                return tx >= pxX && tx <= pxX + pxW && ty >= pxY && ty <= pxY + pxH
              })
              if (!textInside && kind === 'table') return // 表格必须包含少量文本

              images.push({
                id: `${kind}_caption_${pageNumber}_${idxBase}`,
                type: kind === 'table' ? 'table' : 'image',
                position: { x: Math.round(pxX), y: Math.round(pxY), width: Math.round(pxW), height: Math.round(pxH) },
                content: `${kind} caption block`,
                description: '基于标题与低文本密度的候选块（收紧为标题宽度附近）'
              })
            }

            figureLines.forEach((cap, idx) => addBlockAboveCaption(cap, 'image', idx))
            tableLines.forEach((cap, idx) => addBlockAboveCaption(cap, 'table', idx))
          } catch (e) {
            console.warn('文本稀疏度兜底失败:', e)
          }

          return images
        }
        
        // 执行检测
        let tables = detectTables(textItems)
        let images = await detectImages()

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

        // 为表格命名（表格一、表格二…）
        if (tables.length > 0) {
          tables = tables
            .sort((a, b) => (a.position.y - b.position.y) || (a.position.x - b.position.x))
            .map((tb, idx) => ({
              ...tb,
              index: idx + 1,
              name: `表格${idx + 1}`
            }))
        }

        // 合并所有区域
        annotations.push(...tables)
        annotations.push(...images)
        
        console.log(`页面 ${pageNumber} 检测结果:`, {
          tables: tables.length,
          images: images.length,
          total: annotations.length
        })

        setParsedByPage(prev => ({ ...prev, [pageNumber]: annotations }))
        setBasePageSize(prev => ({ ...prev, [pageNumber]: { width: viewport.width, height: viewport.height } }))
      } catch (e) {
        console.error('解析当前页失败:', e)
      }
    }
    parseCurrentPage()
  }, [pdfDoc, pageNumber, pageScale])

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

  // 专门针对图片/表格等视觉块的匹配函数
  const matchVisualAnnotation = (areaOrPoint) => {
    const anns = parsedByPage[pageNumber] || []
    // 只关注图片和表格类型
    const imageAnns = anns.filter(ann => ann.type === 'image' || ann.type === 'table')
    
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
    // 优先尝试匹配图片/表格等视觉块
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
    <div style={styles.container} className="interactive-pdf-container">
      {!file && (
        <div style={styles.noFile}>
          <p>请先上传一个PDF文件来使用交互式编辑器</p>
        </div>
      )}
      
      {loading && <div style={styles.loading}>PDF 加载中...</div>}
      
      {error && <div style={styles.error}>{error}</div>}

      {/* 控制按钮 */}
      <div style={{ 
        ...styles.controls,
        display: loading || error || !file ? 'none' : 'flex'
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

        {/* 放大/缩小功能按需求已移除 */}

      </div>

      {/* 状态信息 */}
      <div style={{ 
        ...styles.statusBar,
        display: loading || error || !file ? 'none' : 'flex'
      }}>
        <span>高亮: {highlights.filter(h => h.pageNumber === pageNumber).length} 个</span>
        <span>附件: {attachments.filter(a => a.pageNumber === pageNumber).length} 个</span>
        <span>关联图片: {associatedImages.filter(img => img.pageNumber === pageNumber).length} 个</span>
      </div>

      {/* PDF页面容器 - 使用CropBox尺寸，限制画布范围 */}
      <div style={{
        display: loading || error || !file ? 'none' : 'block',
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
            onMouseUp={handleTextSelection}
            onContextMenu={handleContextMenu}
          >
            <Document
              file={file}
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
                  
                  // 选择较小的缩放比例，确保页面完全可见，同时整体放大1.2倍
                  const optimalScale = Math.min(widthScale, heightScale, 1.6)
                  const finalScale = Math.min(Math.max(optimalScale * 1.2, 0.5), 2.0)
                  
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

            {/* 渲染高亮区域（放到与页面同层，便于对齐） */}
            {highlights
              .filter(highlight => highlight.pageNumber === pageNumber)
              .map(highlight => (
                <div
                  key={highlight.id}
                  style={{
                    ...styles.highlight,
                    left: highlight.area.x,
                    top: highlight.area.y,
                    width: highlight.area.width,
                    height: highlight.area.height,
                    backgroundColor: highlight.color
                  }}
                  title={`高亮: "${highlight.text}"`}
                />
              ))
            }

            {/* 渲染附件标记（放到与页面同层） */}
            {attachments
              .filter(attachment => attachment.pageNumber === pageNumber)
              .map(attachment => (
                <div
                  key={attachment.id}
                  style={{
                    ...styles.attachment,
                    left: (attachment.area?.x ?? 20),
                    top: (attachment.area?.y ?? 20)
                  }}
                  title={`附件: ${attachment.fileName}${attachment.targetName ? `（关联到：${attachment.targetName}）` : ''}`}
                >
                  📎
                </div>
              ))
            }

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
              
              if (!base) return null
              
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
                              ann.type === 'image' ? '3px solid blue' : '1px solid red',
                      backgroundColor: ann.type === 'table' ? 'rgba(0,255,0,0.1)' : 
                                      ann.type === 'image' ? 'rgba(0,0,255,0.1)' : 'rgba(255,0,0,0.05)',
                      pointerEvents: 'none',
                      zIndex: 15,
                      fontSize: '10px',
                      color: ann.type === 'text' ? 'red' : 'blue',
                      padding: '2px',
                      overflow: 'hidden'
                    }}
                    title={`${ann.type}: ${ann.content || ann.name}`}
                  >
                    <div style={{ 
                      background: 'white', 
                      padding: '1px 3px', 
                      borderRadius: '2px',
                      fontSize: '8px',
                      lineHeight: '10px'
                    }}>
                      {ann.type === 'text' ? '📝' : '🖼️'} {ann.id}
                    </div>
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
            top: contextMenuPos.y
          }}
        >
          <button 
            style={styles.menuItem}
            onClick={triggerFileUpload}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#f8f9fa'}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            📎 上传文件
          </button>
          

          
          {/* 调试显示匹配到的块 + 关联到“图片几/表格几” */}
          {(() => {
            const wrapperRect = pageWrapperRef.current?.getBoundingClientRect()
            let matched = null
            if (selectedArea && selectedText) {
              matched = matchVisualAnnotation(selectedArea) || matchAnnotation(selectedArea)
            } else if (wrapperRect) {
              matched = matchVisualAnnotation({ px: contextMenuPos.x - wrapperRect.left, py: contextMenuPos.y - wrapperRect.top })
            }
            if (matched) {
              return (
                <div style={{ padding: '6px 12px', fontSize: 12, color: '#6c757d' }}>
                  {matched.type === 'image' || matched.type === 'table' ? `关联到：${matched.name || (matched.type === 'table' ? '表格' : '图片')}` : `关联块: 文本`}
                </div>
              )
            }
            return null
          })()}
        </div>
      )}

      {/* 高亮确认气泡 */}
      {showHighlightConfirm && (
        <div
          style={{
            position: 'fixed',
            left: highlightConfirmPos.x,
            top: highlightConfirmPos.y,
            background: '#ffffff',
            border: '1px solid #e9ecef',
            borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            padding: '8px 10px',
            zIndex: 1000,
            display: 'flex',
            gap: 8,
            alignItems: 'center'
          }}
        >
          <span style={{ fontSize: 13, color: '#333' }}>高亮选中内容？</span>
          <button style={styles.button} onClick={confirmHighlight}>高亮</button>
          <button style={{ ...styles.button, backgroundColor: '#6c757d' }} onClick={cancelHighlight}>取消</button>
        </div>
      )}

      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={handleFileUpload}
        accept="*/*"
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
    margin: '20px 0',
    display: 'flex',
    alignItems: 'center',
    gap: '15px',
    flexWrap: 'wrap'
  },
  button: {
    padding: '10px 20px',
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
    border: '1px solid #ddd',
    borderRadius: '8px',
    overflow: 'visible',
    boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
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
  highlight: {
    position: 'absolute',
    opacity: 0.3,
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
    zIndex: 1000,
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
    zIndex: 1000,
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
  }
}

export default InteractivePDFViewer
