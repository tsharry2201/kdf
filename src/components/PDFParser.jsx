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
        
        // 获取页面视口信息
        const viewport = page.getViewport({ scale: 1.0 });
        
        // 获取文本内容
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        allText.push({ page: pageNum, text: pageText });

        // 智能文本合并 - 将位置相近的文字合并在一起
        const textBlocks = [];
        
        // 收集所有文本项，包含位置信息
        const textItems = textContent.items.map((item, index) => {
          const transform = item.transform;
          const x = transform[4] || 0;
          const y = viewport.height - (transform[5] || 0); // 转换为左上角坐标系
          
          return {
            index,
            content: item.str,
            x: Math.round(x * 100) / 100,
            y: Math.round(y * 100) / 100,
            width: Math.round((item.width || 0) * 100) / 100,
            height: Math.round((item.height || 0) * 100) / 100,
            fontSize: Math.round(Math.abs(item.height || 12) * 100) / 100,
            fontFamily: item.fontName || 'Arial',
            hasEOL: item.hasEOL || false,
            transform: item.transform
          };
        });

        // 按位置排序（从上到下，从左到右）
        textItems.sort((a, b) => {
          if (Math.abs(a.y - b.y) < 5) { // 同一行（Y轴差异小于5像素）
            return a.x - b.x; // 从左到右排序
          }
          return a.y - b.y; // 从上到下排序
        });

        // 智能合并相近的文本
        let currentBlock = null;
        textItems.forEach((item) => {
          if (!currentBlock) {
            // 开始新的文本块
            currentBlock = {
              type: 'text',
              content: item.content,
              page: pageNum,
              index: item.index,
              position: {
                x: item.x,
                y: item.y,
                width: item.width,
                height: item.height
              },
              fontSize: item.fontSize,
              fontFamily: item.fontFamily,
              items: [item],
              mergedCount: 1
            };
          } else {
            // 检查是否应该合并到当前块
            const yDiff = Math.abs(item.y - currentBlock.position.y);
            const xDiff = item.x - (currentBlock.position.x + currentBlock.position.width);
            
            // 合并条件：
            // 1. Y轴差异小于8像素（同一行）
            // 2. X轴差异在合理范围内（-5到50像素）
            // 3. 字体大小相近（差异小于20%）
            const fontSizeDiff = Math.abs(item.fontSize - currentBlock.fontSize) / Math.max(item.fontSize, currentBlock.fontSize);
            
            if (yDiff < 8 && xDiff > -5 && xDiff < 50 && fontSizeDiff < 0.2) {
              // 合并到当前块
              currentBlock.content += item.content;
              currentBlock.position.width = Math.max(
                currentBlock.position.width,
                item.x + item.width - currentBlock.position.x
              );
              currentBlock.position.height = Math.max(currentBlock.position.height, item.height);
              currentBlock.items.push(item);
              currentBlock.mergedCount++;
            } else {
              // 保存当前块，开始新块
              textBlocks.push(currentBlock);
              currentBlock = {
                type: 'text',
                content: item.content,
                page: pageNum,
                index: item.index,
                position: {
                  x: item.x,
                  y: item.y,
                  width: item.width,
                  height: item.height
                },
                fontSize: item.fontSize,
                fontFamily: item.fontFamily,
                items: [item],
                mergedCount: 1
              };
            }
          }
        });

        // 添加最后一个块
        if (currentBlock) {
          textBlocks.push(currentBlock);
        }

        // 将合并后的文本块添加到所有块中
        textBlocks.forEach((block, index) => {
          allBlocks.push({
            type: 'text',
            content: block.content,
            page: pageNum,
            index: index,
            position: block.position,
            fontSize: block.fontSize,
            fontFamily: block.fontFamily,
            mergedCount: block.mergedCount,
            originalItems: block.items.length
          });
        });

        // 获取页面操作列表，识别图像
        const operatorList = await page.getOperatorList();
        const imageBlocks = [];
        
        // 分析操作列表，查找图像绘制操作
        for (let i = 0; i < operatorList.fnArray.length; i++) {
          const fn = operatorList.fnArray[i];
          const args = operatorList.argsArray[i];
          
          // 检查是否是图像绘制操作
          if (fn === pdfjsLib.OPS.paintImageXObject || 
              fn === pdfjsLib.OPS.paintImageXObjectGroup ||
              fn === pdfjsLib.OPS.paintXObject ||
              fn === pdfjsLib.OPS.paintFormXObject) {
            
            const imageName = args[0];
            if (imageName) {
              // 尝试获取图像位置信息
              let imagePosition = {
                x: 0,
                y: 0,
                width: 100,
                height: 100
              };
              
              // 查找变换矩阵操作
              for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
                if (operatorList.fnArray[j] === pdfjsLib.OPS.transform) {
                  const transform = operatorList.argsArray[j];
                  if (transform && transform.length >= 6) {
                    imagePosition.x = transform[4] || 0;
                    imagePosition.y = viewport.height - (transform[5] || 0);
                    imagePosition.width = Math.abs(transform[0]) || 100;
                    imagePosition.height = Math.abs(transform[3]) || 100;
                    break;
                  }
                }
              }
              
              imageBlocks.push({
                type: 'image',
                name: imageName,
                page: pageNum,
                index: i,
                position: imagePosition,
                content: `图像 ${imageName}`,
                imageType: 'pdf_image'
              });
            }
          }
        }

        // 添加图像块
        allBlocks.push(...imageBlocks);
        allImages.push(...imageBlocks);
      }

      const result = {
        totalPages: pdf.numPages,
        textContent: allText,
        imageBlocks: allImages,
        allBlocks: allBlocks,
        summary: {
          textBlocks: allBlocks.filter(b => b.type === 'text').length,
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

    const jsonData = JSON.stringify(parsedContent, null, 2);
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
