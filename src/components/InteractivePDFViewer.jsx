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
  const [containerDimensions, setContainerDimensions] = useState({ width: 'auto', height: 'auto' }) // 动态容器尺寸

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
      matched = matchAnnotation(selectedArea)
      if (matched) setCurrentTargetBlock({ type: matched.type || 'text', area: matched.position, text: matched.content })
    } else if (wrapperRect) {
      matched = matchAnnotation({ px: contextMenuPos.x - wrapperRect.left, py: contextMenuPos.y - wrapperRect.top })
      if (matched) setCurrentTargetBlock({ type: matched.type || 'text', area: matched.position, text: matched.content })
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
          targetType: currentTargetBlock?.type || (selectedText ? 'text' : 'image'),
          targetText: currentTargetBlock?.text
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
    setContainerDimensions({ width: 'auto', height: 'auto' }) // 重置容器尺寸
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

  // 当页面改变时重置缩放比例和容器尺寸
  useEffect(() => {
    setPageScale(1)
    setContainerDimensions({ width: 'auto', height: 'auto' })
  }, [pageNumber])

  // 解析当前页，生成与解析器一致的块（文本合并+图片占位）
  useEffect(() => {
    const parseCurrentPage = async () => {
      if (!pdfDoc || !pageNumber) return
      try {
        const page = await pdfDoc.getPage(pageNumber)
        const viewport = page.getViewport({ scale: 1.0 })
        // 文本收集
        const textContent = await page.getTextContent()
        const textItems = []
        textContent.items.forEach((item, index) => {
          if (item.str !== undefined) {
            const x = item.transform[4] || 0
            const y = viewport.height - (item.transform[5] || 0)
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
                // 计算表格边界，创建大的识别框
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
                
                tables.push({
                  id: `table_${pageNumber}_0`,
                  type: 'table',
                  position: {
                    x: Math.round(tableX * 100) / 100,
                    y: Math.round(tableY * 100) / 100,
                    width: Math.round(tableW * 100) / 100,
                    height: Math.round(tableH * 100) / 100
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
        
        // 2. 检测图片区域（改进的算法）
        const detectImages = async () => {
          const images = []
          
          try {
            const operatorList = await page.getOperatorList()
          let imageCount = 0
            let currentTransform = [1, 0, 0, 1, 0, 0]
          
          for (let i = 0; i < operatorList.fnArray.length; i++) {
            const op = operatorList.fnArray[i]
            const args = operatorList.argsArray[i]
            
            if (op === pdfjs.OPS.transform) {
              const [a, b, c, d, e, f] = args
              currentTransform = [a, b, c, d, e, f]
            }
            
            if (op === pdfjs.OPS.paintImageXObject || 
                op === pdfjs.OPS.paintXObject ||
                  op === pdfjs.OPS.paintFormXObject) {
              
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
                
                // 应用变换矩阵到每个角点
                const transformedCorners = corners.map(corner => ({
                  x: a * corner.x + c * corner.y + e,
                  y: b * corner.x + d * corner.y + f
                }))
                
                console.log(`图片 ${imageCount} 变换后角点:`, transformedCorners)
                
                // 计算边界框
                const xCoords = transformedCorners.map(p => p.x)
                const yCoords = transformedCorners.map(p => p.y)
                
                const minX = Math.min(...xCoords)
                const maxX = Math.max(...xCoords)
                const minY = Math.min(...yCoords)
                const maxY = Math.max(...yCoords)
                
                // 转换为浏览器坐标系（Y轴翻转）
                let x = minX
                let y = viewport.height - maxY  // 关键：使用maxY并翻转
                let width = maxX - minX
                let height = maxY - minY
                
                console.log(`图片 ${imageCount} PDF坐标边界框:`, { 
                  minX, maxX, minY, maxY, 
                  转换后: { x, y, width, height },
                  viewport: { width: viewport.width, height: viewport.height }
                })
                
                // 考虑容器偏移 - 解决"坐标原点偏移"问题
                // 获取PDF页面在容器中的实际位置偏移
                const wrapperRect = pageWrapperRef.current?.getBoundingClientRect()
                const pdfPageElement = pageWrapperRef.current?.querySelector('.react-pdf__Page')
                const pageRect = pdfPageElement?.getBoundingClientRect()
                
                if (wrapperRect && pageRect) {
                  // 计算PDF页面相对于容器的偏移
                  const offsetX = pageRect.left - wrapperRect.left
                  const offsetY = pageRect.top - wrapperRect.top
                  
                  console.log(`图片 ${imageCount} 容器偏移:`, { 
                    offsetX, offsetY,
                    wrapperRect: { left: wrapperRect.left, top: wrapperRect.top },
                    pageRect: { left: pageRect.left, top: pageRect.top }
                  })
                  
                  // 应用缩放比例到PDF坐标
                  const scaledX = x * pageScale
                  const scaledY = y * pageScale
                  const scaledWidth = width * pageScale
                  const scaledHeight = height * pageScale
                  
                  // 添加容器偏移，得到最终在浏览器中的绝对位置
                  x = offsetX + scaledX
                  y = offsetY + scaledY
                  width = scaledWidth
                  height = scaledHeight
                  
                  console.log(`图片 ${imageCount} 应用偏移后:`, { 
                    缩放后: { scaledX, scaledY, scaledWidth, scaledHeight },
                    最终位置: { x, y, width, height },
                    pageScale
                  })
                } else {
                  console.log(`图片 ${imageCount} 无法获取容器信息，使用原始坐标`)
                  // 如果无法获取容器信息，至少应用缩放
                  x = x * pageScale
                  y = y * pageScale
                  width = width * pageScale
                  height = height * pageScale
                }
                
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
          
            // 如果没有检测到图片但有大片空白区域，可能是图片
            if (imageCount === 0) {
              // 检测大的空白区域可能是图片
              const pageWidth = viewport.width
              const pageHeight = viewport.height
              const textCoverage = textItems.reduce((total, item) => {
                return total + (item.width * item.height)
              }, 0)
              const totalArea = pageWidth * pageHeight
              const textRatio = textCoverage / totalArea
              
              if (textRatio < 0.3) { // 文本覆盖率小于30%，可能有大图片
                images.push({
                  id: `large_content_${pageNumber}`,
              type: 'image',
              position: {
                    x: Math.round(pageWidth * 0.1),
                    y: Math.round(pageHeight * 0.1),
                    width: Math.round(pageWidth * 0.8),
                    height: Math.round(pageHeight * 0.8)
                  },
                  content: '可能的大图片区域',
                  description: '检测到可能包含图片或图表的大区域'
                })
              }
            }
            
          } catch (error) {
            console.error('图片检测失败:', error)
          }
          
          return images
        }
        
        // 执行检测
        const tables = detectTables(textItems)
        const images = await detectImages()
        
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
  }, [pdfDoc, pageNumber])

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

  // 专门针对图片的匹配函数
  const matchImageAnnotation = (areaOrPoint) => {
    const anns = parsedByPage[pageNumber] || []
    // 只关注图片类型的注释
    const imageAnns = anns.filter(ann => ann.type === 'image')
    
    if (imageAnns.length === 0) {
      return null
    }

    const scaleRatio = 1 / pageScale

    if (areaOrPoint && typeof areaOrPoint.x === 'number' && typeof areaOrPoint.width === 'number') {
      // 选区匹配图片
      const areaPdf = { 
        x: areaOrPoint.x * scaleRatio, 
        y: areaOrPoint.y * scaleRatio, 
        width: areaOrPoint.width * scaleRatio, 
        height: areaOrPoint.height * scaleRatio 
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
    const pxPdf = px * scaleRatio
    const pyPdf = py * scaleRatio
    
    console.log('图片匹配 - 点击坐标:', { px, py, pxPdf, pyPdf })
    
    // 优先查找包含点击点的图片
    let bestContains = null
    let bestDistance = Infinity
    let bestByDistance = null
    
    imageAnns.forEach(img => {
      const r = img.position
      
      console.log(`检查图片 ${img.id}:`, r)
      
      // 检查点击是否在图片边界内
      const contains = pxPdf >= r.x && pxPdf <= r.x + r.width && 
                      pyPdf >= r.y && pyPdf <= r.y + r.height
      
      if (contains) {
        bestContains = img
        console.log(`点击命中图片: ${img.id}`)
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
    console.log('图片匹配结果:', result?.id, '距离:', bestDistance)
    return result
  }

  // 通用匹配函数（保留原有逻辑但简化）
  const matchAnnotation = (areaOrPoint) => {
    // 优先尝试匹配图片
    const imageMatch = matchImageAnnotation(areaOrPoint)
    if (imageMatch) {
      return imageMatch
    }

    // 如果没有匹配到图片，再匹配文本
    const anns = parsedByPage[pageNumber] || []
    const textAnns = anns.filter(ann => ann.type === 'text')
    
    if (textAnns.length === 0) {
      return null
    }

    const scaleRatio = 1 / pageScale

    if (areaOrPoint && typeof areaOrPoint.x === 'number' && typeof areaOrPoint.width === 'number') {
      // 选区匹配文本
      const areaPdf = { 
        x: areaOrPoint.x * scaleRatio, 
        y: areaOrPoint.y * scaleRatio, 
        width: areaOrPoint.width * scaleRatio, 
        height: areaOrPoint.height * scaleRatio 
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
    const pxPdf = px * scaleRatio
    const pyPdf = py * scaleRatio
    
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

      {/* PDF滚动控制容器 */}
      <div style={{
        display: loading || error || !file ? 'none' : 'block',
        maxHeight: containerDimensions.height === 'auto' ? 'none' : `${containerDimensions.height + 40}px`,
        maxWidth: containerDimensions.width === 'auto' ? 'none' : `${containerDimensions.width + 40}px`,
        overflow: 'auto',
        padding: '10px',
        margin: '10px auto',
        boxSizing: 'border-box'
      }}>
        {/* PDF页面容器 - 始终渲染但控制显示 */}
        <div 
          style={{
            ...styles.pageContainer,
          userSelect: 'text', // 允许文本选择
          WebkitUserSelect: 'text',
          MozUserSelect: 'text',
          msUserSelect: 'text',
          // 使用动态计算的容器尺寸，消除多余空白
          width: containerDimensions.width === 'auto' ? 'auto' : `${containerDimensions.width}px`,
          height: containerDimensions.height === 'auto' ? 'auto' : `${containerDimensions.height}px`,
          // 严格限制容器大小，防止任何额外空间
          minWidth: containerDimensions.width === 'auto' ? 'auto' : `${containerDimensions.width}px`,
          minHeight: containerDimensions.height === 'auto' ? 'auto' : `${containerDimensions.height}px`,
          maxWidth: containerDimensions.width === 'auto' ? 'auto' : `${containerDimensions.width}px`,
          maxHeight: containerDimensions.height === 'auto' ? 'auto' : `${containerDimensions.height}px`,
          // 居中显示，减少外边距
          margin: '10px auto',
          // 严格控制溢出
          overflow: 'hidden',
          // 确保紧贴内容
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
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
                onLoadSuccess={(page) => {
                  console.log('页面渲染成功', page)
                  
                  // 获取PDF页面的原始尺寸
                  const viewport = page.getViewport({ scale: 1.0 })
                  const pdfWidth = viewport.width
                  const pdfHeight = viewport.height
                  const pdfAspectRatio = pdfWidth / pdfHeight
                  
                  console.log('PDF页面原始尺寸:', pdfWidth, 'x', pdfHeight)
                  console.log('PDF宽高比:', pdfAspectRatio)
                  
                  // 计算适应屏幕的最大尺寸，留出控制按钮和边距空间
                  const availableWidth = window.innerWidth - 100 // 减去左右边距和滚动条
                  const availableHeight = window.innerHeight - 200 // 减去控制按钮、标题等高度
                  const maxWidth = Math.min(availableWidth, 1000) // 最大宽度
                  const maxHeight = Math.min(availableHeight, 700) // 最大高度
                  
                  console.log('可用屏幕空间:', availableWidth, 'x', availableHeight)
                  console.log('最大容器尺寸:', maxWidth, 'x', maxHeight)
                  
                  // 根据PDF宽高比选择最优缩放策略
                  const widthBasedScale = maxWidth / pdfWidth
                  const heightBasedScale = maxHeight / pdfHeight
                  const optimalScale = Math.min(widthBasedScale, heightBasedScale, 1.5) // 限制最大缩放
                  
                  // 限制缩放比例范围
                  const finalScale = Math.min(Math.max(optimalScale, 0.2), 1.8)
                  
                  // 根据最终缩放比例计算精确的容器尺寸
                  const actualWidth = Math.round(pdfWidth * finalScale)
                  const actualHeight = Math.round(pdfHeight * finalScale)
                  
                  console.log('计算的容器尺寸:', actualWidth, 'x', actualHeight)
                  console.log('最终缩放比例:', finalScale)
                  console.log('容器宽高比:', actualWidth / actualHeight)
                  console.log('PDF宽高比:', pdfAspectRatio)
                  
                  // 设置精确的容器尺寸，确保无多余空间
                  setContainerDimensions({
                    width: actualWidth,
                    height: actualHeight
                  })
                  
                  if (Math.abs(pageScale - finalScale) > 0.01) {
                    setPageScale(finalScale)
                  }
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
                  title={`附件: ${attachment.fileName}`}
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
              
              if (!base || anns.length === 0) return null
              
              return anns.map((ann, index) => {
                const r = ann.position
                // 使用直接转换方法，已验证这是最准确的
                const left = r.x * pageScale
                const top = r.y * pageScale
                const width = r.width * pageScale
                const height = r.height * pageScale
                
                return (
                  <div
                    key={`debug-${ann.id}`}
                    style={{
                      position: 'absolute',
                      left: left,
                      top: top,
                      width: width,
                      height: height,
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
          

          
          {/* 调试显示匹配到的块 */}
          {(() => {
            const wrapperRect = pageWrapperRef.current?.getBoundingClientRect()
            let matched = null
            if (selectedArea && selectedText) {
              matched = matchAnnotation(selectedArea)
            } else if (wrapperRect) {
              matched = matchAnnotation({ px: contextMenuPos.x - wrapperRect.left, py: contextMenuPos.y - wrapperRect.top })
            }
            if (matched) {
              return (
                <div style={{ padding: '6px 12px', fontSize: 12, color: '#6c757d' }}>
                  关联块: {matched.type} - "{matched.content?.slice(0, 20) || matched.name || 'image'}"
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
    minHeight: '100vh',
    position: 'relative',
    boxSizing: 'border-box',
    // 防止产生额外滚动空间
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
    overflow: 'hidden',
    boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
    userSelect: 'text',
    WebkitUserSelect: 'text',
    MozUserSelect: 'text',
    msUserSelect: 'text',
    cursor: 'text',
    // 确保容器紧贴内容，无额外空间
    display: 'inline-block',
    flexShrink: 0
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
