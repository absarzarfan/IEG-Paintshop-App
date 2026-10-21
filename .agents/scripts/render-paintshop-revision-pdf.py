from pathlib import Path

import fitz


source = Path("attached_assets/0519_001_1792370668628.pdf")
output_dir = Path(".agents/outputs/paintshop-revision-pdf")
output_dir.mkdir(parents=True, exist_ok=True)

document = fitz.open(source)
print(f"pages={document.page_count}")
for index, page in enumerate(document, start=1):
    image_path = output_dir / f"page-{index:02d}.png"
    pixmap = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
    pixmap.save(image_path)
    print(f"{image_path} {page.rect.width:.0f}x{page.rect.height:.0f}")
