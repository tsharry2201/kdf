# React PDF 工具

这是一个基于React的PDF处理工具，包含PDF查看器和PDF解析器两个主要功能。

## 功能特性

### 1. PDF 查看器
- 支持PDF文件的上传和查看
- 页面导航控制（上一页/下一页/跳转指定页）
- 响应式设计，适配不同屏幕尺寸
- 加载进度显示和错误处理

### 2. 交互式编辑器
- **文本选择**：鼠标选中PDF中的文字内容
- **右键菜单**：选中文字后右键显示操作菜单
- **文字高亮**：为选中的文字添加黄色高亮标记
- **文件上传**：在选中区域上传附件文件
- **高亮管理**：点击高亮区域可以移除高亮
- **附件标记**：上传的文件显示为📎图标
- **状态反馈**：实时显示上传成功/失败状态
- **页面统计**：显示当前页面的高亮和附件数量

### 3. PDF 解析器
- **文本内容提取**：提取PDF中的文本内容
- **图片识别**：自动识别PDF中的图片元素
- **位置信息**：获取文本和图片的精确位置坐标
- **样式信息**：获取文本的字体、大小、颜色等样式
- **页面分析**：检测页面类型（纯文本、包含图片、纯图片等）
- **生成标准JSON**：输出格式化的JSON数据
- **支持导出**：复制到剪贴板和下载JSON文件
- **文件哈希验证**：SHA-256哈希值验证文件完整性

## 安装和运行

1. 安装依赖：
```bash
npm install
```

2. 启动开发服务器：
```bash
npm run dev
```

3. 在浏览器中打开：http://localhost:5174/

## 使用方法

1. **上传PDF文件**：点击"选择文件"按钮，选择一个PDF文件
2. **切换功能**：使用标签页在"PDF 查看器"、"交互式编辑器"和"PDF 解析器"之间切换

### PDF 查看器
3. **查看PDF**：基础的PDF浏览功能，支持翻页和跳转

### 交互式编辑器  
4. **选择文字**：用鼠标拖拽选中PDF中的文字
5. **右键操作**：在选中文字上右键，选择"高亮文字"或"上传文件"
6. **管理高亮**：点击已高亮的文字可以移除高亮
7. **查看附件**：鼠标悬停在📎图标上可以看到文件信息

### PDF 解析器
8. **解析PDF**：点击"开始解析PDF"按钮分析PDF结构
9. **获取结果**：解析完成后可以复制JSON到剪贴板或下载JSON文件

## JSON输出格式

解析结果采用以下JSON结构：

```json
{
  "kdfVersion": "1.0",
  "originalPdfUrl": "文件名.pdf",
  "pdfHash": "sha256哈希值",
  "lastModified": "2023-10-27T10:00:00Z",
  "pages": [
    {
      "pageNumber": 1,
      "annotations": [
        {
          "id": "page_info_1",
          "type": "page_info",
          "position": {
            "x": 0,
            "y": 0,
            "width": 595.276,
            "height": 841.89
          },
          "content": "页面 1 信息",
          "pageWidth": 595.276,
          "pageHeight": 841.89,
          "createdAt": "2023-10-27T10:01:00Z",
          "createdBy": "pdf_parser"
        },
        {
          "id": "text_1_0",
          "type": "text",
          "position": {
            "x": 100.5,
            "y": 200.3,
            "width": 150.0,
            "height": 12.0
          },
          "content": "文本内容",
          "style": {
            "fontSize": 12.0,
            "fontFamily": "Arial",
            "color": "#000000"
          },
          "visibility": "visible",
          "createdAt": "2023-10-27T10:01:00Z",
          "createdBy": "pdf_parser"
        },
        {
          "id": "image_1_0",
          "type": "image",
          "position": {
            "x": 50.0,
            "y": 300.0,
            "width": 200.0,
            "height": 150.0
          },
          "content": "图片 1",
          "altText": "页面 1 的图片 1",
          "imageData": {
            "format": "image/png",
            "size": 1024,
            "hasData": true
          },
          "createdAt": "2023-10-27T10:01:00Z",
          "createdBy": "pdf_parser"
        }
      ]
    }
  ]
}
```

## 解析类型说明

### 1. 页面信息 (page_info)
- 包含页面的基本尺寸信息
- 位置坐标从左上角开始计算

### 2. 文本内容 (text)
- 提取的文本字符串
- 精确的位置坐标（x, y, width, height）
- 字体样式信息（大小、字体族、颜色）

### 3. 图片内容 (image)
- 自动识别的图片元素
- 图片的位置和尺寸信息
- 图片数据的基本信息

### 4. 完整页面图片 (full_page_image)
- 当页面没有文本内容时自动识别
- 表示整个页面可能是图片或图形

### 5. 错误信息 (error)
- 解析过程中的错误详情
- 帮助诊断问题

## 坐标系统

- **坐标系**：左上角为原点(0,0)
- **单位**：点(point)，1点 = 1/72英寸
- **精度**：保留两位小数
- **位置**：x为水平位置，y为垂直位置

## 技术栈

- React 19
- Vite
- react-pdf
- PDF.js

## 编辑器 3.0（PP-Structure 覆盖）

新增组件 `InteractivePDFViewer3` 支持两层渲染（canvas + textLayer）并叠加 PP-StructureV2 的块框。

### 前端使用

- 侧栏新增“🧩 编辑器 3.0”标签。
- 上传 PDF 后，点击“⚙️ 使用本地 PP-Structure 解析”将文件提交到本地后端解析；解析完成后前端会把返回的块框以半透明框覆盖在 PDF 上。
- 可点击“⬇️ 下载 JSON”获取对应解析结果。

### 启动后端（开发）

后端是一个简单的 Express 服务，提供两个接口：

- `POST /api/pp-parse`：接收 PDF（表单字段名 `file`），调用本地解析器（若配置），返回 JSON 结果与 `jobId`。
- `GET /api/pp-parse/:id.json`：按 `jobId` 返回上一次解析生成的 JSON。

开发启动：

1. 安装依赖：`npm install`
2. 启动后端：`npm run server`（默认端口 8787）
3. 启动前端：`npm run dev`

Vite 已配置代理，把 `/api` 请求代理到 `http://localhost:8787`。

### 配置本地 PP-StructureV2

后端通过环境变量 `PP_STRUCTURE_CMD` 调用实际的解析程序，例如：

```
PP_STRUCTURE_CMD="python server/pp_structure_runner.py" npm run server
```

默认的 `server/pp_structure_runner.py` 是一个占位脚本，只输出空 JSON。你可以替换为真实的 PP-StructureV2 调用逻辑，要求：

- 接受 `--input <pdf>` 与 `--output <json>` 参数；
- 把每页的块框写入 `<json>` 文件，结构例如：

```json
{
  "1": [ { "type": "figure", "bbox": [x1,y1,x2,y2], "img_size": [W,H] }, ... ],
  "2": [ ... ]
}
```

其中 bbox 坐标可用“页面图像像素坐标”（默认）或“PDF 页面坐标”，对应前端 `ppCoordType` 为 `'image'` 或 `'pdf'`。

## 注意事项

- 大文件解析可能需要较长时间
- 某些复杂格式的PDF可能无法完全解析
- 建议在现代浏览器中使用
- 图片识别基于PDF.js的底层操作符分析
- 位置信息经过坐标系转换，确保准确性

## 开发说明

- 组件采用函数式组件和React Hooks
- 使用内联样式确保样式隔离
- 支持错误处理和用户反馈
- 响应式设计适配移动端
- 模块化设计，易于扩展新功能
