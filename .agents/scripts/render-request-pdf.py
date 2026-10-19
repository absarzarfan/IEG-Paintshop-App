from pathlib import Path
import fitz
source = Path('attached_assets/0519_001_1792125986315.pdf')
out = Path('.agents/outputs/request-pdf-page')
doc = fitz.open(source)
print(f'pages={len(doc)}')
for i, page in enumerate(doc):
    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    dest = out.with_name(f'{out.name}-{i+1}.png')
    pix.save(dest)
    print(f'rendered={dest} size={pix.width}x{pix.height}')
    print('text:', repr(page.get_text()[:500]))
