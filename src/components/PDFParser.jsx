import React, { useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// 设置PDF.js worker - 使用5.3.93版本
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf-worker/pdf.worker.min.js';

const PDFParser = ({ file }) => {
  const [parsedContent, setParsedContent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverItem, setDragOverItem] = useState(null);

  const parsePDF = async () => {
    if (!file) {
      setError('请先选择PDF文件');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      const allText = [];
      const allImages = [];
      const allBlocks = [];

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        
        // 获取页面视口信息（与交互编辑器一致：使用CropBox）
        const viewport = page.getViewport({ scale: 1.0, useCropBox: true });

        // 仅收集整页文本（不做定位/合并）
        try {
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map(item => item.str).join(' ');
          allText.push({ page: pageNum, text: pageText });
        } catch (e) {
          allText.push({ page: pageNum, text: '' });
        }

        // 对齐编译器：计算CropBox相对MediaBox的偏移（如有）
        let cropOffsetX = 0;
        let cropOffsetY = 0;
        try {
          if (typeof page.getCropBox === 'function' && typeof page.getMediaBox === 'function') {
            const cropBox = page.getCropBox();
            const mediaBox = page.getMediaBox();
            cropOffsetX = (cropBox?.x || 0) - (mediaBox?.x || 0);
            cropOffsetY = (cropBox?.y || 0) - (mediaBox?.y || 0);
          }
        } catch (_) { /* ignore */ }

        // 解析绘制操作，识别图片与矢量矩形（矩形框）
        const operatorList = await page.getOperatorList();
        const imageBlocks = [];

        // 维护当前变换矩阵与填充状态（与交互编辑器一致的思路）
        let currentTransform = [1, 0, 0, 1, 0, 0]; // a,b,c,d,e,f
        const transformStack = [];
        let currentFill = { space: 'gray', value: [0] };
        const fillStack = [];
        let pendingRects = [];
        let imageCount = 0;

        // 工具：从PDF坐标转换为左上角为原点的页面坐标（scale=1）
        const toTopLeftRect = (minX, minY, maxX, maxY) => ({
          x: minX,
          y: Math.max(0, viewport.height - maxY),
          width: Math.max(0, maxX - minX),
          height: Math.max(0, maxY - minY)
        });

        // 去重：基于IoU检查是否已有近似重复块
        const iou = (a, b) => {
          const x1 = Math.max(a.position.x, b.position.x);
          const y1 = Math.max(a.position.y, b.position.y);
          const x2 = Math.min(a.position.x + a.position.width, b.position.x + b.position.width);
          const y2 = Math.min(a.position.y + a.position.height, b.position.y + b.position.height);
          const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
          const areaA = a.position.width * a.position.height;
          const areaB = b.position.width * b.position.height;
          return inter / (areaA + areaB - inter + 1e-6);
        };

        for (let i = 0; i < operatorList.fnArray.length; i++) {
          const op = operatorList.fnArray[i];
          const args = operatorList.argsArray[i];

          if (op === pdfjsLib.OPS.save) {
            transformStack.push([...currentTransform]);
            fillStack.push({ ...currentFill });
          } else if (op === pdfjsLib.OPS.restore) {
            const restored = transformStack.pop();
            if (restored) currentTransform = restored;
            const f = fillStack.pop();
            if (f) currentFill = f;
          } else if (op === pdfjsLib.OPS.transform) {
            const [a2, b2, c2, d2, e2, f2] = args || [1, 0, 0, 1, 0, 0];
            const [a1, b1, c1, d1, e1, f1] = currentTransform;
            currentTransform = [
              a1 * a2 + c1 * b2,
              b1 * a2 + d1 * b2,
              a1 * c2 + c1 * d2,
              b1 * c2 + d1 * d2,
              a1 * e2 + c1 * f2 + e1,
              b1 * e2 + d1 * f2 + f1
            ];
          } else if (op === pdfjsLib.OPS.setTransform) {
            const [a, b, c, d, e, f] = args || [1, 0, 0, 1, 0, 0];
            currentTransform = [a, b, c, d, e, f];
          } else if (typeof pdfjsLib.OPS.setFillRGBColor !== 'undefined' && op === pdfjsLib.OPS.setFillRGBColor) {
            currentFill = { space: 'rgb', value: args };
          } else if (typeof pdfjsLib.OPS.setFillGray !== 'undefined' && op === pdfjsLib.OPS.setFillGray) {
            currentFill = { space: 'gray', value: args };
          } else if (typeof pdfjsLib.OPS.setFillCMYKColor !== 'undefined' && op === pdfjsLib.OPS.setFillCMYKColor) {
            currentFill = { space: 'cmyk', value: args };
          } else if (op === pdfjsLib.OPS.constructPath) {
            // 解析路径中的矩形（与交互编辑器逻辑一致的核心部分）
            try {
              const opsArr = Array.isArray(args?.[0]) ? args[0] : null;
              const coordsArr = Array.isArray(args?.[1]) ? args[1] : null;
              if (opsArr && coordsArr) {
                const RECT = pdfjsLib.OPS.rectangle;
                const MOVE = pdfjsLib.OPS.moveTo;
                const LINE = pdfjsLib.OPS.lineTo;
                const CURV = pdfjsLib.OPS.curveTo;
                const CURV2 = pdfjsLib.OPS.curveTo2;
                const CURV3 = pdfjsLib.OPS.curveTo3;
                const CLOSE = pdfjsLib.OPS.closePath;
                const argCount = (k) => (k === RECT ? 4 : k === MOVE || k === LINE ? 2 : k === CURV ? 6 : (CURV2 && k === CURV2) || (CURV3 && k === CURV3) ? 4 : 0);
                let p = 0;
                let sub = [];
                const [a, b, c, d, e, f] = currentTransform;
                const apply = (px, py) => ({ x: a * px + c * py + e, y: b * px + d * py + f });
                const pushRectIfValid = (minX, minY, maxX, maxY) => {
                  // 转换到CropBox，再转为左上角坐标系
                  const cx1 = minX - cropOffsetX;
                  const cy1 = minY - cropOffsetY;
                  const cx2 = maxX - cropOffsetX;
                  const cy2 = maxY - cropOffsetY;
                  const rect = toTopLeftRect(cx1, cy1, cx2, cy2);
                  if (rect.width >= 20 && rect.height >= 20) {
                    pendingRects.push(rect);
                  }
                };
                const tryAxisAlignedRect = (pts) => {
                  if (pts.length < 4) return;
                  const xs = pts.map(p0 => p0.x);
                  const ys = pts.map(p0 => p0.y);
                  const minX = Math.min(...xs), maxX = Math.max(...xs);
                  const minY = Math.min(...ys), maxY = Math.max(...ys);
                  const eps = 1e-3;
                  const ok = pts.every(p0 => (Math.abs(p0.x - minX) < eps || Math.abs(p0.x - maxX) < eps) && (Math.abs(p0.y - minY) < eps || Math.abs(p0.y - maxY) < eps));
                  if (ok) pushRectIfValid(minX, minY, maxX, maxY);
                };
                for (let oi = 0; oi < opsArr.length; oi++) {
                  const kind = opsArr[oi];
                  const n = argCount(kind);
                  if (kind === RECT && p + 3 < coordsArr.length) {
                    const x = coordsArr[p];
                    const y = coordsArr[p + 1];
                    const w = coordsArr[p + 2];
                    const h = coordsArr[p + 3];
                    const pts = [apply(x, y), apply(x + w, y), apply(x + w, y + h), apply(x, y + h)];
                    const cropPts = pts.map(p0 => ({ x: p0.x - cropOffsetX, y: p0.y - cropOffsetY }));
                    const minX = Math.min(...cropPts.map(p0 => p0.x));
                    const maxX = Math.max(...cropPts.map(p0 => p0.x));
                    const minY = Math.min(...cropPts.map(p0 => p0.y));
                    const maxY = Math.max(...cropPts.map(p0 => p0.y));
                    pushRectIfValid(minX, minY, maxX, maxY);
                  } else if ((kind === MOVE || kind === LINE) && p + 1 < coordsArr.length) {
                    const x = coordsArr[p];
                    const y = coordsArr[p + 1];
                    const pt = apply(x, y);
                    sub.push({ x: pt.x - cropOffsetX, y: pt.y - cropOffsetY });
                  } else if (kind === CLOSE) {
                    tryAxisAlignedRect(sub);
                    sub = [];
                  }
                  p += Math.max(0, n);
                }
              }
            } catch (e) {
              // ignore constructPath errors
            }
          }

          // 确认 pending 矩形：遇到填充/描边时加入结果
          const confirmPending = () => {
            if (!pendingRects.length) return;
            for (const pr of pendingRects) {
              const rw = pr.width, rh = pr.height;
              if (rw < 30 || rh < 30) continue;
              if (rw / rh < 0.05 || rh / rw < 0.05) continue; // 忽略极细长
              const candidate = {
                id: `vector_rect_${pageNum}_${imageCount}`,
                type: 'image',
                page: pageNum,
                index: imageCount,
                position: { x: Math.round(pr.x), y: Math.round(pr.y), width: Math.round(pr.width), height: Math.round(pr.height) },
                content: '矩形占位',
                imageType: 'vector_rect',
                fill: currentFill
              };
              const dup = imageBlocks.some(r => iou(r, candidate) > 0.7);
              if (!dup) {
                imageBlocks.push(candidate);
                imageCount++;
              }
            }
            pendingRects = [];
          };

          if (
            op === pdfjsLib.OPS.fill ||
            op === pdfjsLib.OPS.fillStroke ||
            (typeof pdfjsLib.OPS.eoFill !== 'undefined' && op === pdfjsLib.OPS.eoFill) ||
            (typeof pdfjsLib.OPS.eoFillStroke !== 'undefined' && op === pdfjsLib.OPS.eoFillStroke) ||
            (typeof pdfjsLib.OPS.closeFillStroke !== 'undefined' && op === pdfjsLib.OPS.closeFillStroke)
          ) {
            confirmPending();
          }
          if (
            op === pdfjsLib.OPS.stroke ||
            (typeof pdfjsLib.OPS.closeStroke !== 'undefined' && op === pdfjsLib.OPS.closeStroke)
          ) {
            confirmPending();
          }

          // 图片绘制操作：计算包围框
          if (
            op === pdfjsLib.OPS.paintInlineImageXObject ||
            op === pdfjsLib.OPS.paintImageXObject ||
            op === pdfjsLib.OPS.paintImageMaskXObject ||
            op === pdfjsLib.OPS.paintXObject ||
            op === pdfjsLib.OPS.paintFormXObject
          ) {
            try {
              const [a, b, c, d, e, f] = currentTransform;
              const corners = [
                { x: 0, y: 0 },
                { x: 1, y: 0 },
                { x: 1, y: 1 },
                { x: 0, y: 1 }
              ];
              const transformed = corners.map(pt => ({ x: a * pt.x + c * pt.y + e, y: b * pt.x + d * pt.y + f }));
              const cropPts = transformed.map(p0 => ({ x: p0.x - cropOffsetX, y: p0.y - cropOffsetY }));
              const xs = cropPts.map(p0 => p0.x);
              const ys = cropPts.map(p0 => p0.y);
              const minX = Math.min(...xs), maxX = Math.max(...xs);
              const minY = Math.min(...ys), maxY = Math.max(...ys);
              const rect = toTopLeftRect(minX, minY, maxX, maxY);
              if (rect.width >= 15 && rect.height >= 15) {
                const img = {
                  id: `image_${pageNum}_${imageCount}`,
                  type: 'image',
                  page: pageNum,
                  index: imageCount,
                  position: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
                  content: '图像',
                  imageType: 'bitmap_or_form'
                };
                const dup = imageBlocks.some(r => iou(r, img) > 0.7);
                if (!dup) {
                  imageBlocks.push(img);
                  imageCount++;
                }
              }
            } catch (e) {
              // ignore image op errors
            }
          }
        }

        // 添加图像块
        allBlocks.push(...imageBlocks);
        allImages.push(...imageBlocks);
      }

      const result = {
        totalPages: pdf.numPages,
        textContent: allText, // 保留整页文本，已移除文本定位/合并
        imageBlocks: allImages,
        allBlocks: allBlocks,
        summary: {
          textBlocks: 0,
          imageBlocks: allImages.length,
          totalBlocks: allBlocks.length
        }
      };

      setParsedContent(result);
      console.log('PDF解析完成:', result);
    } catch (err) {
      console.error('PDF解析失败:', err);
      setError('PDF解析失败: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // 下载JSON格式的解析结果
  const downloadJSON = () => {
    if (!parsedContent) {
      alert('请先解析PDF文件');
      return;
    }

    // 导出时移除整页文本内容（textContent）
    const { textContent: _omitText, ...exportData } = parsedContent || {};
    const jsonData = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pdf_parsed_${file?.name?.replace('.pdf', '') || 'content'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 拖拽开始
  const handleDragStart = (e, item) => {
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', item.content);
  };

  // 拖拽结束
  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverItem(null);
  };

  // 拖拽悬停
  const handleDragOver = (e, item) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverItem(item);
  };

  // 拖拽离开
  const handleDragLeave = () => {
    setDragOverItem(null);
  };

  // 拖拽放置
  const handleDrop = (e, targetItem) => {
    e.preventDefault();
    if (!draggedItem || !targetItem || draggedItem === targetItem) {
      return;
    }

    // 重新排序内容块
    const newBlocks = [...parsedContent.allBlocks];
    const draggedIndex = newBlocks.findIndex(block => 
      block.type === draggedItem.type && 
      block.content === draggedItem.content && 
      block.page === draggedItem.page
    );
    const targetIndex = newBlocks.findIndex(block => 
      block.type === targetItem.type && 
      block.content === targetItem.content && 
      block.page === targetItem.page
    );

    if (draggedIndex !== -1 && targetIndex !== -1) {
      const [draggedBlock] = newBlocks.splice(draggedIndex, 1);
      newBlocks.splice(targetIndex, 0, draggedBlock);
      
      setParsedContent({
        ...parsedContent,
        allBlocks: newBlocks
      });
    }

    setDragOverItem(null);
  };

  return (
    <div className="pdf-parser-container">
      <h2>PDF内容解析器 (版本 5.3.93)</h2>
      
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button 
          onClick={parsePDF} 
          disabled={loading || !file}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: loading || !file ? 'not-allowed' : 'pointer',
            opacity: loading || !file ? 0.6 : 1
          }}
        >
          {loading ? '正在解析...' : '开始解析PDF'}
        </button>

        {parsedContent && (
          <button 
            onClick={downloadJSON}
            style={{
              padding: '12px 24px',
              fontSize: '16px',
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            📥 下载JSON
          </button>
        )}
      </div>

      {error && (
        <div style={{ 
          color: 'red', 
          marginTop: '20px', 
          padding: '10px', 
          backgroundColor: '#ffe6e6', 
          borderRadius: '4px' 
        }}>
          {error}
        </div>
      )}

      {parsedContent && (
        <div className="pdf-parser-content">
          <h3>解析结果</h3>
          
          <div style={{ marginBottom: '20px' }}>
            <strong>总页数:</strong> {parsedContent.totalPages}
          </div>

          <div style={{ marginBottom: '20px' }}>
            <strong>内容统计:</strong>
            <ul>
              <li>文本块: {parsedContent.summary.textBlocks} 个</li>
              <li>图像块: {parsedContent.summary.imageBlocks} 个</li>
              <li>总块数: {parsedContent.summary.totalBlocks} 个</li>
            </ul>
          </div>

          <div style={{ 
            maxHeight: '600px', 
            overflowY: 'auto', 
            border: '1px solid #ddd', 
            borderRadius: '8px',
            padding: '20px',
            backgroundColor: '#fafafa'
          }}>
            <h4 style={{ marginTop: 0, marginBottom: '20px', color: '#333' }}>
              解析内容 (可拖拽重新排序)
            </h4>
            
            {parsedContent.allBlocks.map((block, index) => (
              <div
                key={`${block.type}_${block.page}_${block.index}`}
                draggable
                onDragStart={(e) => handleDragStart(e, block)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, block)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, block)}
                style={{
                  padding: '15px',
                  margin: '10px 0',
                  border: '1px solid #e9ecef',
                  borderRadius: '8px',
                  backgroundColor: dragOverItem === block ? '#f8f9fa' : 'white',
                  cursor: 'grab',
                  transition: 'all 0.2s ease',
                  opacity: draggedItem === block ? 0.5 : 1,
                  transform: draggedItem === block ? 'rotate(2deg)' : 'none',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '15px' }}>
                  <div style={{ 
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '5px',
                    minWidth: '80px'
                  }}>
                    <span style={{ 
                      fontSize: '14px', 
                      color: '#666',
                      fontWeight: 'bold'
                    }}>
                      {block.type === 'text' ? '📝' : '🖼️'} {block.type}
                    </span>
                    <span style={{ 
                      fontSize: '12px', 
                      color: '#007bff',
                      backgroundColor: '#e3f2fd',
                      padding: '2px 8px',
                      borderRadius: '12px'
                    }}>
                      第{block.page}页
                    </span>
                  </div>
                  
                  <div style={{ flex: 1 }}>
                    <div style={{ 
                      fontWeight: 'bold', 
                      marginBottom: '8px',
                      fontSize: '16px',
                      color: '#333'
                    }}>
                      {block.type === 'text' ? block.content : block.name}
                    </div>
                    
                    <div style={{ 
                      fontSize: '13px', 
                      color: '#666',
                      lineHeight: '1.4'
                    }}>
                      {block.type === 'text' ? (
                        <>
                          <div><strong>位置:</strong> x={block.position.x.toFixed(2)}, y={block.position.y.toFixed(2)}</div>
                          <div><strong>字体:</strong> {block.fontFamily}, 大小: {block.fontSize.toFixed(1)}</div>
                          <div><strong>合并信息:</strong> 合并了 {block.mergedCount} 个原始文本项</div>
                        </>
                      ) : (
                        <>
                          <div><strong>位置:</strong> x={block.position.x.toFixed(2)}, y={block.position.y.toFixed(2)}</div>
                          <div><strong>尺寸:</strong> 宽={block.position.width.toFixed(2)}, 高={block.position.height.toFixed(2)}</div>
                        </>
                      )}
                    </div>
                  </div>
                  
                  <div style={{ 
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '5px',
                    minWidth: '40px'
                  }}>
                    <span style={{ 
                      fontSize: '16px', 
                      color: '#999',
                      cursor: 'grab',
                      userSelect: 'none'
                    }}>
                      ⋮⋮
                    </span>
                    <span style={{ 
                      fontSize: '12px', 
                      color: '#999'
                    }}>
                      拖拽
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PDFParser;
