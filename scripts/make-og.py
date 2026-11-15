"""Draws public/og.png (1200x630), the link-preview image used by iMessage, WhatsApp, Slack, X…
Run: python scripts/make-og.py  (needs Pillow; uses Windows/macOS system fonts if present)."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

W, H, S = 1200, 630, 2  # draw at 2x, downsample for clean edges
PAPER, INK, INK2, LINE, BAR = (232, 236, 241), (22, 32, 44), (82, 96, 112), (195, 204, 215), (0, 0, 0)

def font(names, size):
    for n in names:
        for d in ("C:/Windows/Fonts", "/System/Library/Fonts", "/Library/Fonts", "/usr/share/fonts/truetype/dejavu"):
            p = Path(d) / n
            if p.exists():
                return ImageFont.truetype(str(p), size * S)
    return ImageFont.load_default()

serif_b = font(["georgiab.ttf", "Georgia Bold.ttf", "DejaVuSerif-Bold.ttf"], 92)
sans = font(["segoeui.ttf", "SFNS.ttf", "DejaVuSans.ttf"], 34)
sans_s = font(["segoeuisl.ttf", "segoeui.ttf", "DejaVuSans.ttf"], 26)
mono = font(["consola.ttf", "Menlo.ttc", "DejaVuSansMono.ttf"], 24)

img = Image.new("RGB", (W * S, H * S), PAPER)
d = ImageDraw.Draw(img)
s = lambda v: int(v * S)

# left: name + promise
d.text((s(72), s(150)), "RedactPal", font=serif_b, fill=INK)
d.text((s(76), s(272)), "Redact screenshots, PDFs & text", font=sans, fill=INK)
d.text((s(76), s(318)), "before you share them.", font=sans, fill=INK)
d.text((s(76), s(410)), "Free  ·  Open source  ·  Nothing is uploaded", font=sans_s, fill=INK2)

# right: a little "document" with lines, some blacked out
x0, y0, x1, y1 = 760, 120, 1128, 510
d.rounded_rectangle((s(x0), s(y0), s(x1), s(y1)), radius=s(18), fill=(246, 248, 250), outline=LINE, width=s(2))
rows = [
    ("To: ", "████████████████"),
    ("Card ", "███████████████"),
    ("Phone ", "█████████"),
    ("API_KEY=", "██████████████"),
    ("Ship it on Friday", None),
]
y = y0 + 44
for label, bar in rows:
    d.text((s(x0 + 30), s(y)), label, font=mono, fill=INK2)
    if bar:
        lw = d.textlength(label, font=mono) / S
        bw = min(x1 - 30 - (x0 + 30 + lw), 22 + len(bar) * 12)
        d.rounded_rectangle((s(x0 + 30 + lw + 4), s(y + 2), s(x0 + 30 + lw + 4 + bw), s(y + 30)), radius=s(4), fill=BAR)
    y += 66

out = Path(__file__).resolve().parent.parent / "public" / "og.png"
img.resize((W, H), Image.LANCZOS).save(out, optimize=True)
print("wrote", out, out.stat().st_size, "bytes")
