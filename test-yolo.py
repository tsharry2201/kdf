import os
import json
import cv2
import numpy as np
from PIL import Image
from PyPDF2 import PdfReader
from pdf2image import convert_from_path
from ultralytics import YOLO

class PDFLayoutAnalyzer:
    def __init__(self, model_path=None):
        """初始化版面分析器"""
        # 如果未指定模型路径，将自动下载预训练的 DocLayout-YOLO 模型
        self.model = YOLO(model_path or 'yolov8s-doclaynet.pt')
        
        # 定义类别名称（对应 DocLayNet 数据集的类别）
        self.class_names = {
            0: "text",
            1: "title",
            2: "list",
            3: "table",
            4: "figure",
            5: "caption",
            6: "footnote",
            7: "formula",
            8: "reference",
            9: "page-footer",
            10: "page-header",
    }

    def pdf_to_images(self, pdf_path, output_dir='pdf_images'):
        """将 PDF 转换为图像"""
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)
            
        # 转换 PDF 页面为图像
        images = convert_from_path(pdf_path,dpi=300)
        image_paths = []
        
        for i, image in enumerate(images):
            image_path = os.path.join(output_dir, f'page_{i+1}.png')
            image.save(image_path, 'PNG')
            image_paths.append(image_path)
            
        return image_paths

    def analyze_layout(self, image_path):
        """分析单张图像的版面布局"""
        # 加载图像
        image = cv2.imread(image_path)
        if image is None:
            raise ValueError(f"无法加载图像: {image_path}")
            
        # 运行模型推理
        results = self.model(image)
        
        # 处理结果
        layout_info = []
        for result in results:
            for box in result.boxes:
                # 获取边界框坐标 (x1, y1, x2, y2)
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                
                # 获取类别和置信度
                class_id = int(box.cls[0])
                confidence = float(box.conf[0])
                
                # 只保留置信度大于 0.3 的结果
                if confidence > 0.3:
                    layout_info.append({
                        'class': self.class_names.get(class_id, 'unknown'),
                        'confidence': confidence,
                        'bbox': [int(x1), int(y1), int(x2), int(y2)],  # 位置坐标
                        'page': int(os.path.basename(image_path).split('_')[1].split('.')[0])  # 页码
                    })
        
        return layout_info

    def visualize_results(self, image_path, layout_info, output_dir='visualized_results'):
        """可视化分析结果"""
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)
            
        image = cv2.imread(image_path)
        if image is None:
            return
            
        # 为不同类别定义不同颜色
        colors = {
            'text': (0, 255, 0),    # 绿色
            'title': (0, 0, 255),   # 红色
            'list': (255, 0, 0),    # 蓝色
            'table': (255, 255, 0), # 黄色
            'figure': (255, 0, 255) # 紫色
        }
        
        # 绘制边界框和类别标签
        for item in layout_info:
            x1, y1, x2, y2 = item['bbox']
            class_name = item['class']
            color = colors.get(class_name, (255, 255, 255))
            
            # 绘制矩形框
            cv2.rectangle(image, (x1, y1), (x2, y2), color, 2)
            
            # 绘制标签
            label = f"{class_name}: {item['confidence']:.2f}"
            cv2.putText(image, label, (x1, y1-10), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
        
        # 保存可视化结果
        output_path = os.path.join(output_dir, os.path.basename(image_path))
        cv2.imwrite(output_path, image)
        return output_path

    def process_pdf(self, pdf_path, visualize=True):
        """处理整个 PDF 文件并返回分析结果"""
        print(f"开始处理 PDF: {pdf_path}")
        
        # 1. 将 PDF 转换为图像
        image_paths = self.pdf_to_images(pdf_path)
        print(f"PDF 转换完成，共 {len(image_paths)} 页")
        
        # 2. 分析每一页的版面布局
        all_layouts = []
        for image_path in image_paths:
            print(f"分析页面: {image_path}")
            layouts = self.analyze_layout(image_path)
            all_layouts.extend(layouts)
            
            # 3. 可视化结果（如果需要）
            if visualize:
                self.visualize_results(image_path, layouts)
        
        # 4. 保存结果为 JSON 文件
        output_json = os.path.splitext(pdf_path)[0] + '_layout_results.json'
        with open(output_json, 'w', encoding='utf-8') as f:
            json.dump(all_layouts, f, ensure_ascii=False, indent=2)
            
        print(f"分析完成，结果已保存至: {output_json}")
        return all_layouts

if __name__ == "__main__":
    # 初始化分析器
    analyzer = PDFLayoutAnalyzer(model_path=r"C:\Users\Lenovo\Downloads\yolov8s-doclaynet.pt")
    
    # 处理 PDF 文件（替换为你的 PDF 路径）
    pdf_file = "test.pdf"  # 输入你的 PDF 文件路径
    results = analyzer.process_pdf(pdf_file, visualize=True)
    
    # 打印部分结果示例
    print("\n部分分析结果示例:")
    for i, item in enumerate(results[:5]):  # 只显示前 5 个结果
        print(f"类别: {item['class']}, 置信度: {item['confidence']:.2f}, 位置: {item['bbox']}, 页码: {item['page']}")
