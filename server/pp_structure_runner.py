#!/usr/bin/env python3
"""
PP-StructureV2 runner with unified JSON output for InteractivePDFViewer3.

Usage:
  python server/pp_structure_runner.py --input <pdf_path> --output <json_path> [--dpi 300] [--ocr false] [--table true]

Dependencies (install in your Python env):
  pip install "paddleocr>=2.6.1.0" pymupdf

Output schema (blocksByPage):
{
  "1": [
    {
      "id": "figure_1_1",
      "page": 1,
      "type": "figure|table|text|title|...",
      "bbox": [x1,y1,x2,y2],           # image pixel coords (origin top-left)
      "img_size": [W,H],               # rendered page image size used by detector
      "source": "pp-structure-v2",
      "score": 0.98,                   # optional
      "extra": { ... }                 # passthrough fields (if any)
    }
  ],
  "2": [ ... ]
}
"""
import argparse
import json
import os
import sys
import tempfile
import time
import traceback
from pathlib import Path
from typing import Optional

# 固定引擎参数（无需再由后端传参）
# 仅做版面分析：关闭 OCR；需要表格结构则保持 True
ENGINE_OCR = False
ENGINE_TABLE = True
DEFAULT_DPI = 300
# 是否在结果为空时自动改为 OCR=True 重试（按你的需求：不要重试）
AUTO_RETRY_OCR_IF_EMPTY = False


def parse_bool(s: str, default=False):
    if s is None:
        return default
    s = str(s).strip().lower()
    return s in ("1", "true", "yes", "y", "on")


def _log(msg: str):
    try:
        sys.stderr.write(f"[pp-progress] {msg}\n")
        sys.stderr.flush()
    except Exception:
        pass

def _err(msg: str, exc: Exception | None = None):
    try:
        sys.stderr.write(f"[pp-error] {msg}\n")
        if exc is not None:
            sys.stderr.write(traceback.format_exc())
        sys.stderr.flush()
    except Exception:
        pass

def get_ppstructure_cls():
    """Resolve PP-Structure implementation in priority order: V3 -> V2 -> legacy (V1).
    Returns a class named PPStructure for unified use.
    """
    try:
        from paddlex import PPStructureV2 as PPStructure  # type: ignore
        _log('resolved impl: paddleocr.PPStructureV2')
        return PPStructure
    except Exception:
        try:
            from paddleocr import PPStructureV2 as PPStructure  # type: ignore
            _log('resolved impl: paddleocr.PPStructureV2')
            return PPStructure
        except Exception:
            from paddleocr.ppstructure import PPStructure  # type: ignore
            _log('resolved impl: paddleocr.ppstructure.PPStructure (legacy)')
            return PPStructure


def ensure_modules():
    try:
        import sys  # noqa: F401
        import fitz  # noqa: F401
        # 验证 PP-Structure 类可用（兼容 V3/V2/旧路径）
        _ = get_ppstructure_cls()
        # PaddleOCR 依赖 paddlepaddle 运行时
        try:
            import paddle  # noqa: F401
        except Exception as e:
            # 避免中文编码在某些终端/代理中出现乱码，这里使用英文信息
            raise SystemExit(
                "Missing paddlepaddle runtime.\n"
                "Install CPU version (or proper GPU build):\n"
                "  python -m pip install paddlepaddle -i https://mirror.baidu.com/pypi/simple\n"
                f"Original error: {e}"
            )
    except Exception as e:
        tr = traceback.format_exc()
        raise SystemExit(
            "pp-structure environment missing.\n"
            "Please install dependencies: pip install -U paddleocr pymupdf\n"
            "Supported APIs (auto-detected): V3 (PPStructureV3) > V2 (PPStructureV2) > legacy 2.7.x (paddleocr.ppstructure.PPStructure).\n"
            "Ensure you install into THE SAME Python: python -m pip install ...\n"
            f"Python: {sys.executable}\n"
            f"Version: {sys.version}\n"
            f"Original import error: {e}\n"
            f"Traceback:\n{tr}"
        )


def _norm_bbox(bbox):
    """Normalize bbox into [x1,y1,x2,y2] from various possible formats."""
    if bbox is None:
        return None
    # list/tuple of 4 numbers
    if isinstance(bbox, (list, tuple)) and len(bbox) == 4:
        x1, y1, a, b = [float(v) for v in bbox]
        # If a,b look like width/height, convert to x2,y2
        if a > 0 and b > 0 and (a <= 40960 and b <= 40960) and (a < 1e6 and b < 1e6):
            # Heuristic: if a > x1 and b > y1 we still can not be sure. Prefer (x1,y1,x2,y2) if a>x1.
            if a <= x1 or b <= y1:  # likely width/height
                return [x1, y1, x1 + a, y1 + b]
        return [x1, y1, float(a), float(b)]
    # dict with keys
    if isinstance(bbox, dict):
        keys = set(k.lower() for k in bbox.keys())
        if {'x1','y1','x2','y2'} <= keys:
            return [float(bbox['x1']), float(bbox['y1']), float(bbox['x2']), float(bbox['y2'])]
        if {'x','y','w','h'} <= keys:
            return [float(bbox['x']), float(bbox['y']), float(bbox['x']) + float(bbox['w']), float(bbox['y']) + float(bbox['h'])]
    return None


def _create_engine():
    """Create PP-Structure engine using the resolved class (no show_log arg)."""
    PPStructure = get_ppstructure_cls()
    # 粗略提示缓存目录是否存在，帮助判断是否首次下载模型
    try:
        cache_dir = os.path.join(os.path.expanduser('~'), '.paddleocr')
        if os.path.isdir(cache_dir):
            _log(f'model cache dir exists: {cache_dir}')
        else:
            _log(f'model cache dir missing (likely first-run download): {cache_dir}')
    except Exception:
        pass
    _log('initializing engine')
    t0 = time.time()
    # 兼容 V3 及后续版本（构造器不传多余参数）
    eng = PPStructure()
    _log(f'engine ready ({time.time() - t0:.2f}s)')
    return eng


def _write_output_json(output_path: str, pages_obj) -> None:
    """Write JSON to the exact path the server expects.
    Ensures parent directory exists and uses UTF-8 with non-ASCII preserved.
    """
    p = Path(output_path)
    p.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(pages_obj, ensure_ascii=False, indent=2)
    p.write_text(text, encoding='utf-8')


def _to_blocks_by_page(pages_any) -> dict:
    """Normalize V3/V2 return to blocksByPage: {"1": [...], "2": [...]}"""
    if isinstance(pages_any, dict):
        # If keys are already page numbers
        try:
            return {str(k): v for k, v in pages_any.items()}
        except Exception:
            pass
    if isinstance(pages_any, list):
        return {str(i + 1): (pages_any[i] or []) for i in range(len(pages_any))}
    # Fallback single page
    return {"1": (list(pages_any or []) if pages_any is not None else [])}


def try_run_v3_pdf(pdf_path: str, output_json: str, dpi: int, debug_dir: Optional[str] = None) -> bool:
    """If PPStructureV3 is available, run it directly on the PDF and write JSON.
    Returns True when succeeded and output is written; otherwise False (fallback to image flow).
    """
    try:
        from paddleocr import PPStructureV3  # type: ignore
    except Exception:
        return False
    _log('using PPStructureV3 direct PDF interface')
    # Instantiate with tolerant kwargs (broadened exception to ensure fallback)
    try:
        engine = PPStructureV3(ocr=False, table=True, debug_dir=debug_dir)
    except Exception:
        try:
            engine = PPStructureV3(ocr=False, table=True)
        except Exception:
            engine = PPStructureV3()
    # Run
    try:
        try:
            pages_any = engine(pdf_path, dpi=dpi)
        except TypeError:
            pages_any = engine.predict(pdf_path, dpi=dpi)
        blocks_by_page = _to_blocks_by_page(pages_any)
        _write_output_json(output_json, blocks_by_page)
        _log('v3 path completed and JSON written')
        return True
    except Exception as e:
        _err('v3 path failed', e)
        return False


def run(pdf_path: str, dpi: int = DEFAULT_DPI, ocr: bool = ENGINE_OCR, table: bool = ENGINE_TABLE, debug_dir: Optional[str] = None):
    # lazy imports after validation
    import fitz

    # 统一使用本文件顶部固定配置，不再依赖后端传参
    engine = _create_engine()

    doc = fitz.open(pdf_path)
    pages = {}

    with tempfile.TemporaryDirectory(prefix="pp_struct_") as td:
        for page_index in range(len(doc)):
            page = doc[page_index]
            # Render page to image with the given DPI
            _log(f'render page {page_index+1}')
            t_r0 = time.time()
            pix = page.get_pixmap(dpi=dpi, alpha=False)
            img_w, img_h = pix.width, pix.height
            img_path = os.path.join(td, f"page_{page_index+1}.png")
            pix.save(img_path)
            if debug_dir:
                os.makedirs(debug_dir, exist_ok=True)
                pix.save(os.path.join(debug_dir, f"page_{page_index+1}.png"))

            # Run PP-StructureV2 on the rendered image（按固定参数）
            try:
                _log(f'infer page {page_index+1} (render {time.time()-t_r0:.2f}s)')
                t_i0 = time.time()
                # 兼容不同版本：优先可调用实例，其次 predict 方法
                try:
                    res = engine(img_path)  # common path
                except TypeError:
                    res = engine.predict(img_path)
                _log(f'page {page_index+1} done (infer {time.time()-t_i0:.2f}s)')
            except Exception as e:
                # If a single page fails, continue and record empty
                res = []
                _err(f"inference failed on page {page_index+1}: {e}", e)

            # Normalize per-block
            blocks = []
            # 保存原始 engine 输出（未拍平）到 debug 目录，便于排查
            if debug_dir:
                try:
                    with open(os.path.join(debug_dir, f"page_{page_index+1}_engine_raw.json"), 'w', encoding='utf-8') as rf:
                        json.dump(res, rf, ensure_ascii=False)
                except Exception:
                    pass

            raw_list = _flatten_ppstruct_output(res)
            if debug_dir:
                try:
                    with open(os.path.join(debug_dir, f"page_{page_index+1}_raw.json"), 'w', encoding='utf-8') as rf:
                        json.dump(raw_list, rf, ensure_ascii=False)
                except Exception:
                    pass

            for i, b in enumerate(raw_list):
                try:
                    bbox = _norm_bbox(b.get('bbox'))
                    if not bbox or len(bbox) != 4:
                        continue
                    x1, y1, x2, y2 = [float(x) for x in bbox]
                    # fix reversed coords
                    if x2 < x1: x1, x2 = x2, x1
                    if y2 < y1: y1, y2 = y2, y1
                    # clamp to image
                    x1 = max(0.0, min(x1, img_w))
                    y1 = max(0.0, min(y1, img_h))
                    x2 = max(0.0, min(x2, img_w))
                    y2 = max(0.0, min(y2, img_h))
                    # 允许更小的框通过，以防过度过滤
                    if x2 - x1 < 1 or y2 - y1 < 1:
                        continue
                    btype = (b.get('type') or 'block').lower()
                    score = b.get('score') if isinstance(b.get('score'), (int, float)) else None
                    extra_fields = {}
                    # Keep minimal extra fields if present
                    for key in ('res', 'layout', 'cls_label', 'cls_score'):
                        if key in b:
                            extra_fields[key] = b[key]
                    blocks.append({
                        'id': f"{btype}_{page_index+1}_{i+1}",
                        'page': page_index + 1,
                        'type': btype,
                        'bbox': [round(x1, 2), round(y1, 2), round(x2, 2), round(y2, 2)],
                        'img_size': [img_w, img_h],
                        'source': 'pp-structure-v2',
                        **({'score': float(score)} if score is not None else {}),
                        **({'extra': extra_fields} if extra_fields else {}),
                    })
                except Exception as be:
                    _err(f"normalize block failed on page {page_index+1}")
                    continue

            # 简单重试：如果没有任何块，降低 DPI 再推理一次
            if not blocks:
                try:
                    alt_dpi = max(120, int(dpi * 0.6))
                    if alt_dpi != dpi:
                        _log(f'retry page {page_index+1} with dpi={alt_dpi}')
                        pix2 = page.get_pixmap(dpi=alt_dpi, alpha=False)
                        img_w2, img_h2 = pix2.width, pix2.height
                        img_path2 = os.path.join(td, f"page_{page_index+1}_alt.png")
                        pix2.save(img_path2)
                        t_i1 = time.time()
                        try:
                            res2 = engine(img_path2)
                        except TypeError:
                            res2 = engine.predict(img_path2)
                        raw_list2 = _flatten_ppstruct_output(res2)
                        _log(f'page {page_index+1} alt done (infer {time.time()-t_i1:.2f}s)')
                        if debug_dir:
                            try:
                                with open(os.path.join(debug_dir, f"page_{page_index+1}_raw_alt.json"), 'w', encoding='utf-8') as rf:
                                    json.dump(list(raw_list2), rf, ensure_ascii=False)
                            except Exception:
                                pass
                        for i, b in enumerate(list(raw_list2)):
                            try:
                                bbox = _norm_bbox(b.get('bbox'))
                                if not bbox or len(bbox) != 4:
                                    continue
                                x1, y1, x2, y2 = [float(x) for x in bbox]
                                if x2 < x1: x1, x2 = x2, x1
                                if y2 < y1: y1, y2 = y2, y1
                                x1 = max(0.0, min(x1, img_w2))
                                y1 = max(0.0, min(y1, img_h2))
                                x2 = max(0.0, min(x2, img_w2))
                                y2 = max(0.0, min(y2, img_h2))
                                if x2 - x1 < 1 or y2 - y1 < 1:
                                    continue
                                btype = (b.get('type') or 'block').lower()
                                score = b.get('score') if isinstance(b.get('score'), (int, float)) else None
                                extra_fields = {}
                                for key in ('res', 'layout', 'cls_label', 'cls_score'):
                                    if key in b:
                                        extra_fields[key] = b[key]
                                blocks.append({
                                    'id': f"{btype}_{page_index+1}_{i+1}_alt",
                                    'page': page_index + 1,
                                    'type': btype,
                                    'bbox': [round(x1, 2), round(y1, 2), round(x2, 2), round(y2, 2)],
                                    'img_size': [img_w2, img_h2],
                                    'source': 'pp-structure-v2',
                                    **({'score': float(score)} if score is not None else {}),
                                    **({'extra': extra_fields} if extra_fields else {}),
                                })
                            except Exception as be:
                                _err(f"normalize alt block failed on page {page_index+1}")
                                continue
                except Exception:
                    pass

            pages[str(page_index + 1)] = blocks

    # 保持与“仅版面分析 + 可选表格识别”的需求一致，不做 OCR 重试

    doc.close()
    return pages


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--input', required=True, help='input PDF path')
    ap.add_argument('--output', required=True, help='output JSON path')
    # 下面的参数保留但不影响引擎固定配置（便于向下兼容）
    ap.add_argument('--dpi', default=str(DEFAULT_DPI), help='render DPI for PDF->image (fixed by runner config)')
    ap.add_argument('--ocr', default=str(ENGINE_OCR).lower(), help='ignored; engine uses fixed OCR setting')
    ap.add_argument('--table', default=str(ENGINE_TABLE).lower(), help='ignored; engine uses fixed TABLE setting')
    ap.add_argument('--debug-dir', default=None, help='save debug PNG and raw JSON per page')
    args = ap.parse_args()

    ensure_modules()
    # 简短环境提示（如不需要可注释掉）
    try:
        import paddle
        import paddleocr
        ver = getattr(paddleocr, '__version__', 'unknown')
        print(f"[pp-structure] PaddleOCR {ver}; Paddle {paddle.__version__}")
    except Exception:
        pass

    # 即使命令行传入，也统一使用文件顶部固定配置
    dpi = int(args.dpi) if str(args.dpi).isdigit() else DEFAULT_DPI
    # First try V3 direct path; if succeeds, exit 0 early
    if try_run_v3_pdf(args.input, args.output, dpi, args.debug_dir):
        sys.exit(0)

    # Fallback: image rendering + engine per page
    pages = run(args.input, dpi=dpi, ocr=ENGINE_OCR, table=ENGINE_TABLE, debug_dir=args.debug_dir)
    _write_output_json(args.output, pages)


if __name__ == '__main__':
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:
        _err('fatal error in runner', e)
        raise
