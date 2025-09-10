import paddleocr, os
print(paddleocr.__file__)   # 打印 paddlex 安装路径

# 列出安装目录下的文件
import os
base = os.path.dirname(paddleocr.__file__)
for root, dirs, files in os.walk(base):
    print(root, "->", dirs, files)
    break  # 只看第一层