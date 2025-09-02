# React PDF 查看器

这是一个使用 React 和 react-pdf 库构建的 PDF 查看器应用程序。

## 已安装的依赖

### 核心依赖
- `react` - React 核心库
- `react-dom` - React DOM 渲染器
- `react-pdf` - React PDF 查看组件
- `pdfjs-dist` - PDF.js 核心库

### 开发依赖
- `vite` - 构建工具
- `@vitejs/plugin-react` - Vite React 插件
- `eslint` - 代码检查工具

## 功能特性

- ✅ PDF 文件上传和查看
- ✅ 页面导航（上一页/下一页）
- ✅ 直接跳转到指定页面
- ✅ 响应式设计
- ✅ 文本选择支持
- ✅ 注释层支持

## 如何运行

1. 安装依赖（已完成）：
   ```bash
   npm install
   ```

2. 启动开发服务器：
   ```bash
   npm run dev
   ```

3. 在浏览器中打开 `http://localhost:5173`

4. 点击"选择文件"按钮上传 PDF 文件进行查看

## 项目结构

```
kdf/
├── src/
│   ├── components/
│   │   └── PDFViewer.jsx    # PDF查看器组件
│   ├── App.jsx              # 主应用组件
│   ├── App.css              # 样式文件
│   └── main.jsx             # 入口文件
├── vite.config.js           # Vite配置文件
└── package.json             # 项目依赖配置
```

## 使用说明

1. 启动应用后，您会看到一个文件上传区域
2. 点击"选择文件"按钮，选择一个 PDF 文件
3. PDF 文件将自动加载并显示第一页
4. 使用"上一页"和"下一页"按钮进行导航
5. 在页码输入框中输入数字可以直接跳转到指定页面

## 技术说明

- 使用 `pdfjs-dist` 作为 PDF 渲染引擎
- 配置了 PDF.js worker 以提高性能
- 支持文本层和注释层渲染
- 使用 Vite 作为构建工具，提供快速的开发体验

## 注意事项

- 确保上传的文件是有效的 PDF 格式
- 大文件可能需要较长的加载时间
- 建议在现代浏览器中使用以获得最佳体验
