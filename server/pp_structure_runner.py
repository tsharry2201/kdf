#!/usr/bin/env python3
"""
PubLayNet (LayoutParser + Detectron2) runner.

Accepts a PDF from the server, runs layout detection, and writes per-page JSON
with axis-aligned bounding boxes and types. Compatible with server/index.js
which expects an output JSON file at --output and progress logs on stderr.

Usage:
  python server/pp_structure_runner.py --input <pdf_path> --output <json_path> [--dpi 200]

Dependencies (same env as your test.py):
  pip install layoutparser pdf2image opencv-python-headless matplotlib
  # plus Detectron2 matching your CUDA/torch; and poppler for pdf2image
"""
import argparse
import json
import os
import sys
import traceback
from pathlib import Path
from typing import Union 
import numpy as np


def _log(msg: str):
    try:
        sys.stderr.write(f"[pp-progress] {msg}\n")
        sys.stderr.flush()
    except Exception:
        pass


def _err(msg: str, exc: Union[Exception, None] = None):
    try:
        sys.stderr.write(f"[pp-error] {msg}\n")
        if exc is not None:
            sys.stderr.write(traceback.format_exc())
        sys.stderr.flush()
    except Exception:
        pass


def build_model():
    import layoutparser as lp
    # 优先使用相对当前仓库根目录的路径，避免硬编码绝对盘符
    repo_root = Path(__file__).resolve().parents[1]
    cfg_path = repo_root / 'faster_rcnn_R_50_FPN_3x.yaml'
    mdl_path = repo_root / 'models' / 'publaynet' / 'model_final.pth'

    if not cfg_path.exists() or not mdl_path.exists():
        # 兼容：如果相对路径不存在，回退到示例中的绝对路径（用户环境）
        cfg_path = Path(r"E:\cs\Review-flow\kdf\faster_rcnn_R_50_FPN_3x.yaml")
        mdl_path = Path(r"E:\cs\Review-flow\kdf\models\publaynet\model_final.pth")

    _log(f"load model config={cfg_path} model={mdl_path}")
    model = lp.Detectron2LayoutModel(
        config_path=str(cfg_path),
        model_path=str(mdl_path),
        label_map={0: "Text", 1: "Title", 2: "List", 3: "Table", 4: "Figure"},
        extra_config=["MODEL.ROI_HEADS.SCORE_THRESH_TEST", 0.5],
        device="cuda" if os.environ.get("LP_DEVICE", "").lower() == "cuda" else "cpu"
    )
    return model


def detect_pdf(pdf_path: str, dpi: int = 200):
    import cv2
    from pdf2image import convert_from_path
    import layoutparser as lp  # noqa: F401  (ensures model types are loaded)

    _log(f"convert pdf -> images dpi={dpi}")
    pages = convert_from_path(pdf_path, dpi=dpi)

    model = build_model()
    results_by_page = {}

    for page_num, page in enumerate(pages, start=1):
        _log(f"infer page {page_num}")
        img = np.array(page)
        img = img[:, :, ::-1].copy()  # RGB->BGR without cv2 import dependency order issues
        h, w = img.shape[:2]
        layout = model.detect(img)

        objs = []
        for idx, l in enumerate(layout):
            try:
                # l.block.points: 4x2 polygon; compute axis-aligned bounds
                pts = l.block.points.reshape(-1, 2)
                xs = pts[:, 0]
                ys = pts[:, 1]
                x1, y1, x2, y2 = float(xs.min()), float(ys.min()), float(xs.max()), float(ys.max())
                # clamp to image bounds
                x1 = max(0.0, min(x1, w))
                y1 = max(0.0, min(y1, h))
                x2 = max(0.0, min(x2, w))
                y2 = max(0.0, min(y2, h))
                if x2 - x1 < 1 or y2 - y1 < 1:
                    continue
                objs.append({
                    "id": f"{l.type.lower()}_{page_num}_{idx+1}",
                    "page": page_num,
                    "type": l.type,
                    "bbox": [int(round(x1)), int(round(y1)), int(round(x2)), int(round(y2))],
                    "img_size": [int(w), int(h)],
                    "score": float(getattr(l, 'score', 0.0)),
                })
            except Exception as be:
                _err(f"normalize box failed on page {page_num}", be)
                continue

        results_by_page[str(page_num)] = objs

    return results_by_page


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--input', required=True, help='input PDF path')
    ap.add_argument('--output', required=True, help='output JSON path')
    ap.add_argument('--dpi', type=int, default=300, help='render DPI for PDF->image')
    args = ap.parse_args()

    try:
        blocks_by_page = detect_pdf(args.input, dpi=args.dpi)
        outp = Path(args.output)
        outp.parent.mkdir(parents=True, exist_ok=True)
        outp.write_text(json.dumps(blocks_by_page, ensure_ascii=False, indent=2), encoding='utf-8')
        _log('completed and JSON written')
    except Exception as e:
        _err('fatal error', e)
        raise


if __name__ == '__main__':
    main()
