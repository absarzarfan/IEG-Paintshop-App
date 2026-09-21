from pathlib import Path
import fitz

source = Path("attached_assets/PAINTSHOP_APP_1789974211721.pdf")
output = Path(".agents/outputs/paintshop-pdf-pages")
output.mkdir(parents=True, exist_ok=True)

document = fitz.open(source)
print(f"pages={document.page_count}")
for index, page in enumerate(document):
    pixmap = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
    path = output / f"page-{index + 1}.png"
    pixmap.save(path)
    print(f"{index + 1}: {page.rect.width:.0f}x{page.rect.height:.0f} -> {path}")