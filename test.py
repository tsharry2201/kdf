import cv2
import json
import numpy as np
from pdf2image import convert_from_path
import layoutparser as lp
import matplotlib.pyplot as plt

# -------------------------------
# 1. 加载 PubLayNet 模型
# -------------------------------
model = lp.Detectron2LayoutModel(
    config_path=r"E:\cs\Review-flow\kdf\faster_rcnn_R_50_FPN_3x.yaml",
    model_path=r"E:\cs\Review-flow\kdf\models\publaynet\model_final.pth",
    label_map={0: "Text", 1: "Title", 2: "List", 3: "Table", 4: "Figure"},
    extra_config=["MODEL.ROI_HEADS.SCORE_THRESH_TEST", 0.5]
)

# -------------------------------
# 2. PDF 转 图片
# -------------------------------
pdf_path = "AAAI1.pdf"
pages = convert_from_path(pdf_path, dpi=200)

results = []

# -------------------------------
# 3. 遍历每页做检测
# -------------------------------
for page_num, page in enumerate(pages, start=1):
    # 转 OpenCV 格式
    img = np.array(page)
    img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)

    layout = model.detect(img)

    page_result = {
        "page": page_num,
        "objects": []
    }

    for l in layout:
        obj = {
            "type": l.type,
            "score": float(l.score),
            "bbox": [int(v) for v in l.block.points.flatten().tolist()]
        }
        page_result["objects"].append(obj)

        # 可视化
        bbox = obj["bbox"]  # 8个值 [x1,y1,x2,y2,x3,y3,x4,y4]
        xs = bbox[0::2]  # 所有 x 坐标
        ys = bbox[1::2]  # 所有 y 坐标
        x1, y1, x2, y2 = min(xs), min(ys), max(xs), max(ys)
        cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 2)
        cv2.putText(img, f"{obj['type']} {obj['score']:.2f}", (x1, y1 - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)

    results.append(page_result)

    # 保存可视化结果
    cv2.imwrite(f"visualized_results/page_{page_num}.png", img)

# -------------------------------
# 4. 保存 JSON
# -------------------------------
with open("output_json/results.json", "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)

print("✅ 检测完成，结果已保存到 output_json/results.json 和 visualized_results/ 目录。")
