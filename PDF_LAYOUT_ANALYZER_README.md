# PDF版面分析工具

这是一个基于LayoutParser的PDF版面分析工具，可以自动检测PDF中的文本、标题、列表、表格、图片等元素，并输出JSON格式的分析结果。

## 功能特点

- 🚀 **自动下载模型**: 首次运行会自动下载所需的预训练模型
- 📄 **多页支持**: 支持多页PDF文档分析
- 🎯 **高精度检测**: 支持文本、标题、列表、表格、图片等元素检测
- 📊 **JSON输出**: 输出结构化的JSON格式结果
- 🖼️ **可视化结果**: 生成带标注的可视化图片
- ⚡ **多种模型**: 支持不同大小和精度的模型选择

## 安装依赖

### 方法1: 使用requirements.txt（推荐）

```bash
pip install -r requirements.txt
```

### 方法2: 手动安装

```bash
pip install layoutparser pdf2image opencv-python numpy Pillow torch torchvision transformers detectron2
```

## 使用方法

### 1. 简化版使用（推荐新手）

```bash
python simple_pdf_analyzer.py your_file.pdf
```

### 2. 完整版使用

```bash
python pdf_layout_analyzer.py your_file.pdf
```

### 3. 高级选项

```bash
# 指定输出目录
python pdf_layout_analyzer.py your_file.pdf -o my_output

# 使用不同的模型
python pdf_layout_analyzer.py your_file.pdf -m "lp://PubLayNet/efficientdet_D1"

# 调整检测阈值
python pdf_layout_analyzer.py your_file.pdf -t 0.6

# 调整图片质量
python pdf_layout_analyzer.py your_file.pdf -d 200

# 不保存图片和可视化结果
python pdf_layout_analyzer.py your_file.pdf --no-images --no-visualization
```

## 支持的模型

| 模型名称 | 大小 | 速度 | 精度 | 推荐场景 |
|---------|------|------|------|----------|
| `lp://PubLayNet/efficientdet_D0` | 小 | 快 | 中等 | 快速分析，资源有限 |
| `lp://PubLayNet/efficientdet_D1` | 中 | 中等 | 较好 | 平衡性能和精度 |
| `lp://PubLayNet/efficientdet_D2` | 大 | 慢 | 好 | 高精度要求 |
| `lp://PubLayNet/mask_rcnn_X_101_32x8d_FPN_3x` | 最大 | 最慢 | 最好 | 最高精度要求 |

## 输出格式

### JSON结果结构

```json
{
  "pdf_path": "your_file.pdf",
  "total_pages": 3,
  "pages": [
    {
      "page_number": 1,
      "objects_count": 5,
      "objects": [
        {
          "type": "Title",
          "bbox": [100, 50, 400, 80],
          "confidence": 0.95,
          "area": 9000
        },
        {
          "type": "Text",
          "bbox": [100, 100, 500, 200],
          "confidence": 0.88,
          "area": 40000
        }
      ],
      "image_path": "output/page_1.png",
      "visualization_path": "output/page_1_visualization.png"
    }
  ]
}
```

### 字段说明

- `type`: 元素类型（Text, Title, List, Table, Figure）
- `bbox`: 边界框坐标 [x1, y1, x2, y2]
- `confidence`: 检测置信度 (0-1)
- `area`: 元素面积（像素）

## 输出文件

- `layout_analysis_results.json`: 详细分析结果
- `page_X.png`: 转换的图片文件
- `page_X_visualization.png`: 带标注的可视化结果

## 常见问题

### Q: 首次运行很慢？
A: 首次运行需要下载模型文件，请耐心等待。模型文件会缓存到本地，后续运行会很快。

### Q: 内存不足？
A: 可以尝试使用更小的模型（如efficientdet_D0）或降低DPI设置。

### Q: 检测精度不够？
A: 可以尝试使用更大的模型（如mask_rcnn_X_101）或调整检测阈值。

### Q: 支持哪些PDF格式？
A: 支持标准的PDF格式，建议使用文本型PDF（非扫描版）以获得最佳效果。

## 技术原理

本工具基于以下技术栈：

- **LayoutParser**: Facebook开发的版面分析框架
- **PubLayNet**: 大规模版面分析数据集
- **EfficientDet/Mask R-CNN**: 深度学习检测模型
- **OpenCV**: 图像处理
- **pdf2image**: PDF转图片

## 许可证

本项目基于MIT许可证开源。

## 贡献

欢迎提交Issue和Pull Request来改进这个工具！

