"""Create the two silent H.264 sample clips used by the unfilled TV display.

Requires Pillow and ffmpeg. Run from the project root with:
    python3 scripts/generate_placeholder_videos.py
Set FFMPEG_BIN if ffmpeg is not on PATH.
"""

import math
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

from PIL import Image, ImageDraw, ImageFont


SIZE = (640, 480)
FPS = 24
FRAMES = 96
OUTPUT = Path("web/public/placeholders")
FONT = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"


def line(draw, points, color, width):
    draw.line(points, fill=color, width=width, joint="curve")
    radius = width // 2
    for x, y in (points[0], points[-1]):
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=color)


def frame(index, variant):
    phase = 2 * math.pi * index / FRAMES
    image = Image.new("RGB", SIZE, "#16161a")
    draw = ImageDraw.Draw(image)
    for x in range(0, SIZE[0], 40):
        draw.line((x, 0, x, SIZE[1]), fill="#242429", width=1)
    for y in range(0, SIZE[1], 40):
        draw.line((0, y, SIZE[0], y), fill="#242429", width=1)
    draw.ellipse((145, 45, 495, 395), outline="#5d252a", width=3)
    draw.rectangle((0, 0, 10, SIZE[1]), fill="#e93740")

    # The motion coordinates were authored from the floor upward. Flip only the
    # figure so labels and the progress line stay right side up.
    figure = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    draw = ImageDraw.Draw(figure)
    bounce = 7 * math.sin(phase * 2) if variant == "upper" else 38 * max(0, math.sin(phase))
    hip = (320, round(165 + bounce))
    shoulder = (320, round(280 + bounce))
    draw.ellipse((293, 296 + bounce, 347, 350 + bounce), fill="#f0f0f3")
    line(draw, [hip, shoulder], "#f0f0f3", 20)
    if variant == "upper":
        reach = 70 + 65 * math.sin(phase * 2)
        line(draw, [shoulder, (375, round(245 + bounce)), (round(375 + reach), round(265 + bounce))], "#e93740", 18)
        line(draw, [shoulder, (270, round(245 + bounce)), (295, round(280 + bounce))], "#f0f0f3", 18)
        line(draw, [hip, (270, round(100 + bounce)), (245, 55)], "#f0f0f3", 20)
        line(draw, [hip, (370, round(100 + bounce)), (395, 55)], "#f0f0f3", 20)
        label = "PUNCH COMBO"
    else:
        squat = 35 * max(0, -math.sin(phase))
        line(draw, [shoulder, (250, round(300 + bounce + squat)), (215, round(350 + bounce + squat))], "#e93740", 18)
        line(draw, [shoulder, (390, round(300 + bounce + squat)), (425, round(350 + bounce + squat))], "#e93740", 18)
        line(draw, [hip, (270, round(105 + bounce)), (240, round(55 + bounce))], "#f0f0f3", 20)
        line(draw, [hip, (370, round(105 + bounce)), (400, round(55 + bounce))], "#f0f0f3", 20)
        label = "SQUAT MOTION"

    figure = figure.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    image.paste(figure, (0, 0), figure)
    draw = ImageDraw.Draw(image)
    draw.rectangle((55, 22, 585, 27), fill="#5b5b63")
    draw.rectangle((55, 22, 55 + round(530 * index / FRAMES), 27), fill="#e93740")
    font = ImageFont.truetype(FONT, 27)
    draw.text((52, 422), label, font=font, fill="#f0f0f3")
    return image


def generate(variant, ffmpeg):
    with tempfile.TemporaryDirectory(prefix="evofit-video-") as temporary:
        directory = Path(temporary)
        for index in range(FRAMES):
            frame(index, variant).save(directory / f"frame_{index:03}.png")
        subprocess.run(
            [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-framerate", str(FPS),
             "-i", str(directory / "frame_%03d.png"), "-c:v", "libx264", "-preset", "veryfast",
             "-crf", "28", "-pix_fmt", "yuv420p", "-profile:v", "baseline", "-level", "3.0",
             "-movflags", "+faststart", "-an", str(OUTPUT / f"{variant}.mp4")],
            check=True,
        )


if __name__ == "__main__":
    ffmpeg_bin = os.environ.get("FFMPEG_BIN") or shutil.which("ffmpeg")
    if not ffmpeg_bin:
        raise SystemExit("ffmpeg is required (or set FFMPEG_BIN)")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for part in ("upper", "lower"):
        generate(part, ffmpeg_bin)
        print(f"Created {OUTPUT / (part + '.mp4')}")
