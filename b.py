from PyPDF2 import PdfReader, PdfWriter

input_path = "test.pdf"
output_path = "fixed_test.pdf"

reader = PdfReader(input_path)
writer = PdfWriter()

for page in reader.pages:
    writer.add_page(page)

with open(output_path, "wb") as f:
    writer.write(f)

print("✅ 修复完成，保存为", output_path)