from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "assets" / "source"
BRAND = ROOT / "public" / "assets" / "brand"
STORE = ROOT / "public" / "assets" / "store"
CATEGORIES = ROOT / "public" / "assets" / "categories"
VACANCY = ROOT / "public" / "assets" / "vacancy"
OG = ROOT / "public" / "og"
FONT_REGULAR = Path("/System/Library/Fonts/Supplemental/Arial.ttf")
FONT_BOLD = Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf")


@dataclass(frozen=True)
class CategoryCrop:
    slug: str
    name: str
    box: tuple[int, int, int, int]


CATEGORY_CROPS = [
    CategoryCrop("podveska", "Подвеска", (80, 135, 255, 300)),
    CategoryCrop("elektrika", "Электрика", (390, 150, 565, 310)),
    CategoryCrop("filtry-i-masla", "Фильтры и масла", (675, 145, 855, 320)),
    CategoryCrop("tormoznaya-sistema", "Тормозная система", (1000, 140, 1185, 325)),
    CategoryCrop("kuzov-i-optika", "Кузов и оптика", (45, 545, 290, 720)),
    CategoryCrop("dvigatel-i-transmissiya", "Двигатель и трансмиссия", (390, 545, 575, 735)),
    CategoryCrop("aksessuary", "Аксессуары", (685, 540, 850, 735)),
    CategoryCrop("ves-assortiment", "Весь ассортимент", (1010, 540, 1185, 735)),
]


def ensure_dirs() -> None:
    for folder in (BRAND, STORE, CATEGORIES, VACANCY, OG):
        folder.mkdir(parents=True, exist_ok=True)


def remove_near_white(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, a = pixels[x, y]
            if r > 245 and g > 245 and b > 245:
                pixels[x, y] = (255, 255, 255, 0)
    return rgba


def remove_dark_background(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, a = pixels[x, y]
            brightness = max(r, g, b)
            blue_signal = b > 95 and b > r * 1.15 and b > g * 1.05
            if brightness < 72 and not blue_signal:
                pixels[x, y] = (r, g, b, 0)
                continue
            alpha = min(255, max(0, int((brightness - 46) * 2.0)))
            if blue_signal:
                alpha = max(alpha, 180)
            pixels[x, y] = (r, g, b, alpha)
    bbox = rgba.getbbox()
    if bbox:
        rgba = rgba.crop(bbox)
    return ImageOps.contain(rgba, (260, 220))


def save_web_versions(image: Image.Image, target: Path, max_width: int | None = None) -> dict:
    img = image.copy()
    if max_width and img.width > max_width:
        ratio = max_width / img.width
        img = img.resize((max_width, int(img.height * ratio)), Image.Resampling.LANCZOS)
    target.parent.mkdir(parents=True, exist_ok=True)
    webp = target.with_suffix(".webp")
    avif = target.with_suffix(".avif")
    img.save(webp, "WEBP", quality=86, method=6)
    img.save(avif, "AVIF", quality=74)
    return {"webp": str(webp.relative_to(ROOT)), "avif": str(avif.relative_to(ROOT))}


def write_svg_wrapper(path: Path, image_path: Path, width: int, height: int) -> None:
    mime = "image/png"
    payload = base64.b64encode(image_path.read_bytes()).decode("ascii")
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'width="{width}" height="{height}" role="img">'
        f'<image href="data:{mime};base64,{payload}" width="{width}" height="{height}"/>'
        "</svg>\n"
    )
    path.write_text(svg, encoding="utf-8")


def category_svg(slug: str) -> str:
    base_start = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" '
        'fill="none" role="img" aria-hidden="true">\n'
        '  <g stroke-linecap="round" stroke-linejoin="round" stroke-width="4">\n'
    )
    base_end = "  </g>\n</svg>\n"
    white = 'stroke="#FFFFFF"'
    blue = 'stroke="#2563EB"'
    icons = {
        "podveska": f"""
    <path {white} d="M28 96 96 28"/>
    <circle {white} cx="25" cy="99" r="11"/>
    <circle {white} cx="101" cy="23" r="11"/>
    <path {white} d="M47 79 34 66"/>
    <path {white} d="M80 46 93 59"/>
    <path {blue} d="M47 67c10 3 20-2 24-12"/>
    <path {white} d="M53 83c-9-11-8-25 2-35"/>
    <path {white} d="M73 44c10 10 11 24 2 35"/>
""",
        "elektrika": f"""
    <rect {white} x="18" y="36" width="92" height="54" rx="6"/>
    <path {white} d="M37 36v-9h18v9"/>
    <path {white} d="M73 36v-9h18v9"/>
    <path {blue} d="M42 54v20"/>
    <path {blue} d="M32 64h20"/>
    <path {blue} d="M78 64h22"/>
""",
        "filtry-i-masla": f"""
    <ellipse {white} cx="42" cy="40" rx="20" ry="8"/>
    <path {white} d="M22 40v45c0 5 9 9 20 9s20-4 20-9V40"/>
    <path {white} d="M30 49v34"/>
    <path {white} d="M42 51v36"/>
    <path {white} d="M54 49v34"/>
    <path {white} d="M80 32h18l13 13v38c0 7-6 13-13 13H77c-7 0-13-6-13-13V51z"/>
    <path {white} d="M80 32v19H64"/>
    <path {blue} d="M89 58c8 9 12 16 12 22 0 7-5 12-12 12s-12-5-12-12c0-6 4-13 12-22z"/>
""",
        "tormoznaya-sistema": f"""
    <circle {white} cx="58" cy="64" r="34"/>
    <circle {white} cx="58" cy="64" r="10"/>
    <circle {white} cx="58" cy="35" r="2"/>
    <circle {white} cx="87" cy="64" r="2"/>
    <circle {white} cx="58" cy="93" r="2"/>
    <circle {white} cx="29" cy="64" r="2"/>
    <path {blue} d="M88 30c13 8 21 21 21 34 0 12-6 23-16 31"/>
    <path {white} d="M93 37h12c5 0 9 4 9 9v36c0 5-4 9-9 9H93"/>
    <path {blue} d="M101 49v30"/>
""",
        "kuzov-i-optika": f"""
    <path {white} d="M18 77c9-22 23-34 43-36l35 16"/>
    <path {white} d="M25 82h51c13 0 23-5 33-14"/>
    <path {blue} d="M28 71h30c-4 9-13 14-27 14"/>
    <path {white} d="M35 88h14"/>
    <path {white} d="M84 87h20"/>
    <path {blue} d="M61 55h24"/>
""",
        "dvigatel-i-transmissiya": f"""
    <path {white} d="M31 47h57l13 13v35H31z"/>
    <path {white} d="M48 47V34h24v13"/>
    <path {white} d="M18 62h13v25H18"/>
    <path {white} d="M101 66h11v21h-11"/>
    <path {white} d="M42 95v12h37V95"/>
    <circle {blue} cx="70" cy="73" r="14"/>
    <path {blue} d="M70 53v8"/>
    <path {blue} d="M70 85v8"/>
    <path {blue} d="M50 73h8"/>
    <path {blue} d="M82 73h8"/>
""",
        "aksessuary": f"""
    <path {white} d="M45 23h26c8 0 14 6 14 14v20"/>
    <path {white} d="M38 46h36c12 0 22 10 22 22v24H32V56c0-6 3-10 6-10z"/>
    <path {white} d="M32 92h64"/>
    <path {blue} d="M51 55v28"/>
    <path {blue} d="M75 55v28"/>
    <path {blue} d="M48 69h30"/>
    <path {white} d="M28 97h72"/>
""",
        "ves-assortiment": f"""
    <rect {white} x="22" y="22" width="20" height="20" rx="4"/>
    <rect {white} x="54" y="22" width="20" height="20" rx="4"/>
    <rect {white} x="86" y="22" width="20" height="20" rx="4"/>
    <rect {white} x="22" y="54" width="20" height="20" rx="4"/>
    <rect {white} x="54" y="54" width="20" height="20" rx="4"/>
    <rect {white} x="86" y="54" width="20" height="20" rx="4"/>
    <rect {white} x="22" y="86" width="20" height="20" rx="4"/>
    <rect {white} x="54" y="86" width="20" height="20" rx="4"/>
    <rect {blue} x="86" y="86" width="20" height="20" rx="4"/>
"""
    }
    return base_start + icons[slug] + base_end


def write_category_vector(path: Path, slug: str) -> None:
    path.write_text(category_svg(slug), encoding="utf-8")


def load_font(path: Path, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    if path.exists():
        return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


def prepare_brand(manifest: dict) -> None:
    source = Image.open(SOURCE / "logo.jpg").convert("RGB")
    transparent = remove_near_white(source)
    bbox = transparent.getbbox()
    if bbox:
        transparent = transparent.crop(bbox)
    transparent.save(BRAND / "logo-transparent.png")
    save_web_versions(source, BRAND / "logo", max_width=960)

    mark = transparent.crop((0, 0, min(300, transparent.width), transparent.height))
    mark_bbox = mark.getbbox()
    if mark_bbox:
        mark = mark.crop(mark_bbox)
    mark = ImageOps.contain(mark, (512, 512))
    square = Image.new("RGBA", (512, 512), (255, 255, 255, 0))
    square.alpha_composite(mark, ((512 - mark.width) // 2, (512 - mark.height) // 2))
    square.save(BRAND / "logo-mark.png")
    square.save(BRAND / "apple-touch-icon.png")
    square.save(ROOT / "public" / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    write_svg_wrapper(BRAND / "favicon.svg", BRAND / "logo-mark.png", 512, 512)
    manifest["brand"] = {
        "source": "public/assets/source/logo.jpg",
        "logo": "public/assets/brand/logo.webp",
        "logo_avif": "public/assets/brand/logo.avif",
        "mark": "public/assets/brand/logo-mark.png",
        "favicon": "public/favicon.ico",
        "favicon_svg": "public/assets/brand/favicon.svg",
        "note": "favicon.svg is a bitmap wrapper because the approved source is JPG, not vector SVG."
    }


def prepare_store_photos(manifest: dict) -> None:
    photos = {
        "facade": "facade.jpg",
        "building": "building.jpg",
        "entrance": "entrance.jpg"
    }
    manifest["store_photos"] = {}
    for slug, filename in photos.items():
        image = Image.open(SOURCE / filename).convert("RGB")
        ImageOps.exif_transpose(image)
        manifest["store_photos"][slug] = {
            "source": f"public/assets/source/{filename}",
            "optimized": save_web_versions(image, STORE / slug, max_width=1280),
            "sizes": {}
        }
        for width in (640, 960):
            resized = ImageOps.contain(image, (width, width * 2))
            out = STORE / f"{slug}-{width}.webp"
            resized.save(out, "WEBP", quality=84, method=6)
            manifest["store_photos"][slug]["sizes"][str(width)] = str(out.relative_to(ROOT))

    vacancy = Image.open(SOURCE / "seller_consultant.jpg").convert("RGB")
    manifest["vacancy"] = {
        "source": "public/assets/source/seller_consultant.jpg",
        "optimized": save_web_versions(vacancy, VACANCY / "seller-consultant", max_width=1280)
    }


def prepare_categories(manifest: dict) -> None:
    source = Image.open(SOURCE / "category_icons.jpg").convert("RGB")
    manifest["categories"] = {}
    for item in CATEGORY_CROPS:
        crop = source.crop(item.box)
        icon = remove_dark_background(crop)
        png = CATEGORIES / f"{item.slug}.png"
        icon.save(png)
        icon.save(CATEGORIES / f"{item.slug}.webp", "WEBP", quality=90, method=6)
        write_category_vector(CATEGORIES / f"{item.slug}.svg", item.slug)
        manifest["categories"][item.slug] = {
            "name": item.name,
            "source": "public/assets/source/category_icons.jpg",
            "png": str(png.relative_to(ROOT)),
            "webp": f"public/assets/categories/{item.slug}.webp",
            "svg": f"public/assets/categories/{item.slug}.svg",
            "note": "Pure SVG icon redrawn to match the approved JPG mockup and logo style."
        }


def prepare_og(manifest: dict) -> None:
    base = Image.open(SOURCE / "facade.jpg").convert("RGB")
    og = ImageOps.fit(base, (1200, 630), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
    overlay = Image.new("RGBA", og.size, (17, 24, 39, 85))
    og_rgba = og.convert("RGBA")
    og_rgba.alpha_composite(overlay)
    draw = ImageDraw.Draw(og_rgba)
    title_font = load_font(FONT_BOLD, 34)
    address_font = load_font(FONT_REGULAR, 24)
    draw.rectangle((0, 540, 1200, 630), fill=(17, 24, 39, 210))
    draw.text(
        (48, 552),
        "Автозапчасти на Салтыкова-Щедрина",
        fill=(255, 255, 255, 255),
        font=title_font
    )
    draw.text(
        (48, 594),
        "Талдом, ул. Салтыкова-Щедрина, д. 19",
        fill=(209, 213, 219, 255),
        font=address_font
    )
    og_rgba.convert("RGB").save(OG / "store-front.webp", "WEBP", quality=88, method=6)
    og_rgba.convert("RGB").save(OG / "store-front.jpg", "JPEG", quality=88, optimize=True)
    manifest["open_graph"] = {
        "image": "public/og/store-front.webp",
        "fallback_jpeg": "public/og/store-front.jpg",
        "source": "public/assets/source/facade.jpg"
    }


def main() -> None:
    ensure_dirs()
    manifest: dict = {
        "generated_by": "scripts/prepare-assets.py",
        "principle": "Use only approved archive materials; optimize and crop without replacing visual style."
    }
    prepare_brand(manifest)
    prepare_store_photos(manifest)
    prepare_categories(manifest)
    prepare_og(manifest)
    (ROOT / "public" / "assets" / "assets-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )


if __name__ == "__main__":
    main()
