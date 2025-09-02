import os
import sys
import math
import argparse
from dataclasses import dataclass
from typing import Tuple, Optional

import numpy as np
from PIL import Image
from moviepy.editor import ImageSequenceClip, VideoFileClip, CompositeVideoClip

import cv2
from skimage.restoration import inpaint


@dataclass
class EditConfig:
    output_fps: int = 24
    duration_sec: float = 6.0
    wave_amplitude_px: float = 6.0
    wave_wavelength_px: float = 140.0
    wave_speed: float = 0.35
    head_unrotate_deg: float = 6.0
    lift_subject_px: int = 20
    seagull_video: Optional[str] = None
    seagull_opacity: float = 0.8
    seagull_scale: float = 0.5
    lighten_factor: float = 1.08
    num_seagulls: int = 5


def read_image(path: str) -> np.ndarray:
    image = Image.open(path).convert("RGBA")
    return np.array(image)


def write_image(path: str, image: np.ndarray) -> None:
    Image.fromarray(image).save(path)


def rgba_to_bgr(image_rgba: np.ndarray) -> np.ndarray:
    if image_rgba.shape[2] == 4:
        bgr = cv2.cvtColor(image_rgba, cv2.COLOR_RGBA2BGR)
    else:
        bgr = cv2.cvtColor(image_rgba, cv2.COLOR_RGB2BGR)
    return bgr


def bgr_to_rgba(image_bgr: np.ndarray) -> np.ndarray:
    rgba = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGBA)
    return rgba


def remove_boat_with_inpaint(image_rgba: np.ndarray) -> np.ndarray:
    # Heuristic: boat is in the left third. We'll find high-contrast blob near horizon and inpaint.
    h, w, _ = image_rgba.shape
    rgb = image_rgba[:, :, :3]
    bgr = rgba_to_bgr(image_rgba)

    # Edge/contrast map
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 50, 150)

    left_region = edges[:, : w // 3]
    # Dilate to form mask blob
    kernel = np.ones((7, 7), np.uint8)
    mask_left = cv2.dilate(left_region, kernel, iterations=2)

    # Keep only upper half where the boats likely are
    horizon_band = np.zeros_like(edges)
    horizon_band[int(h * 0.35) : int(h * 0.6), : w // 2] = 255
    mask = np.zeros_like(edges)
    mask[:, : w // 3] = mask_left
    mask = cv2.bitwise_and(mask, horizon_band)

    # Clean small components
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats((mask > 0).astype(np.uint8))
    clean_mask = np.zeros_like(mask)
    for i in range(1, num_labels):
        area = stats[i, cv2.CC_STAT_AREA]
        x = stats[i, cv2.CC_STAT_LEFT]
        y = stats[i, cv2.CC_STAT_TOP]
        w_i = stats[i, cv2.CC_STAT_WIDTH]
        h_i = stats[i, cv2.CC_STAT_HEIGHT]
        if area > 200:  # keep plausible boat structure
            clean_mask[labels == i] = 255

    if clean_mask.sum() == 0:
        return image_rgba

    # Expand mask slightly to fully cover boat
    clean_mask = cv2.dilate(clean_mask, np.ones((9, 9), np.uint8), iterations=1)

    # Inpaint on RGB
    inpainted = cv2.inpaint(rgba_to_bgr(image_rgba), clean_mask, 3, cv2.INPAINT_TELEA)
    result_rgba = bgr_to_rgba(inpainted)
    result_rgba[:, :, 3] = image_rgba[:, :, 3]
    return result_rgba


def lift_subject(image_rgba: np.ndarray, lift_px: int) -> np.ndarray:
    if lift_px == 0:
        return image_rgba
    h, w, _ = image_rgba.shape
    M = np.float32([[1, 0, 0], [0, 1, -lift_px]])
    bgr = rgba_to_bgr(image_rgba)
    shifted = cv2.warpAffine(bgr, M, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    out = bgr_to_rgba(shifted)
    out[:, :, 3] = image_rgba[:, :, 3]
    return out


def subtle_head_unrotate(image_rgba: np.ndarray, degrees: float) -> np.ndarray:
    # Assume head roughly centered horizontally; use face detection if available.
    if abs(degrees) < 0.5:
        return image_rgba
    h, w, _ = image_rgba.shape
    center = (w // 2, int(h * 0.6))
    M = cv2.getRotationMatrix2D(center, -degrees, 1.0)
    bgr = rgba_to_bgr(image_rgba)
    rotated = cv2.warpAffine(bgr, M, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    out = bgr_to_rgba(rotated)
    out[:, :, 3] = image_rgba[:, :, 3]
    return out


def _create_head_mask(h: int, w: int) -> np.ndarray:
    # Elliptical soft mask centered near the subject's head
    center_x = w * 0.5
    center_y = h * 0.58
    radius_x = w * 0.35
    radius_y = h * 0.28
    yy, xx = np.mgrid[0:h, 0:w]
    norm = ((xx - center_x) ** 2) / (radius_x ** 2) + ((yy - center_y) ** 2) / (radius_y ** 2)
    mask = np.exp(-norm * 2.0)
    mask = cv2.GaussianBlur(mask.astype(np.float32), (0, 0), 9)
    mask = np.clip(mask, 0.0, 1.0)
    return mask


def _lighten_top_region(image_rgba: np.ndarray, factor: float) -> np.ndarray:
    if abs(factor - 1.0) < 0.01:
        return image_rgba
    h, w, _ = image_rgba.shape
    bgr = rgba_to_bgr(image_rgba)
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV).astype(np.float32)
    head_mask = _create_head_mask(h, w)
    v = hsv[:, :, 2]
    boosted = np.clip(v * factor, 0, 255)
    v_new = (v * (1 - head_mask) + boosted * head_mask).astype(np.float32)
    hsv[:, :, 2] = np.clip(v_new, 0, 255)
    bgr_boost = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)
    out = bgr_to_rgba(bgr_boost)
    out[:, :, 3] = image_rgba[:, :, 3]
    return out


def _ease_in_out_cubic(x: float) -> float:
    if x < 0.5:
        return 4 * x * x * x
    else:
        f = (2 * x) - 2
        return 0.5 * f * f * f + 1


def _draw_seagulls_rgba(frame_rgba: np.ndarray, t: float, num_birds: int = 5) -> np.ndarray:
    h, w, _ = frame_rgba.shape
    bgr = rgba_to_bgr(frame_rgba)
    rng = np.random.default_rng(12345)
    # deterministic pseudo-random tracks
    for i in range(num_birds):
        base_x = (w * (-0.2 + (i + 1) / (num_birds + 1)))
        speed_x = w * (0.12 + 0.05 * (i % 3))
        x = int((base_x + speed_x * t) % (w + 100) - 50)
        y_base = int(h * (0.10 + 0.12 * (i % 4)))
        y = int(y_base + 8 * math.sin(1.7 * t + i))
        wing = int(14 + i % 3 * 3)
        pts_left = np.array([[x - wing, y], [x, y + 3]], dtype=np.int32)
        pts_right = np.array([[x + wing, y], [x, y + 3]], dtype=np.int32)
        cv2.polylines(bgr, [pts_left], False, (255, 255, 255), thickness=2, lineType=cv2.LINE_AA)
        cv2.polylines(bgr, [pts_right], False, (255, 255, 255), thickness=2, lineType=cv2.LINE_AA)
    out = bgr_to_rgba(bgr)
    out[:, :, 3] = frame_rgba[:, :, 3]
    return out


def animate_waves(image_rgba: np.ndarray, cfg: EditConfig) -> ImageSequenceClip:
    base = image_rgba.copy()
    h, w, _ = base.shape

    total_frames = int(cfg.duration_sec * cfg.output_fps)
    frames = []

    yy, xx = np.mgrid[0:h, 0:w]
    water_mask = (yy > int(h * 0.55)).astype(np.float32)
    water_mask_blur = cv2.GaussianBlur((water_mask * 255).astype(np.uint8), (0, 0), 9) / 255.0
    head_mask = _create_head_mask(h, w).astype(np.float32)

    for i in range(total_frames):
        t = i / cfg.output_fps
        phase = 2 * math.pi * (cfg.wave_speed * t)
        displacement = (cfg.wave_amplitude_px * np.sin((xx / cfg.wave_wavelength_px) * 2 * math.pi + phase)).astype(np.float32)

        map_x = (xx + displacement * water_mask_blur).astype(np.float32)
        map_y = yy.astype(np.float32)

        # Gradually unrotate top region (head area) with easing
        progress = i / max(1, total_frames - 1)
        cur_deg = cfg.head_unrotate_deg * (1.0 - _ease_in_out_cubic(progress))
        center = (w // 2, int(h * 0.58))
        M = cv2.getRotationMatrix2D(center, -cur_deg, 1.0)
        bgr_base = rgba_to_bgr(base)
        bgr_rot = cv2.warpAffine(bgr_base, M, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        bgr = (bgr_rot * head_mask[..., None] + bgr_base * (1 - head_mask[..., None])).astype(np.uint8)

        warped = cv2.remap(bgr, map_x, map_y, interpolation=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        out = bgr_to_rgba(warped)
        out[:, :, 3] = base[:, :, 3]
        out = _draw_seagulls_rgba(out, t, num_birds=cfg.num_seagulls)
        frames.append(out)

    clip = ImageSequenceClip([cv2.cvtColor(f, cv2.COLOR_RGBA2RGB) for f in frames], fps=cfg.output_fps)
    return clip


def overlay_seagulls(base_clip: ImageSequenceClip, cfg: EditConfig) -> ImageSequenceClip:
    if not cfg.seagull_video or not os.path.exists(cfg.seagull_video):
        return base_clip
    birds = VideoFileClip(cfg.seagull_video).fx(
        lambda c: c.resize(cfg.seagull_scale).set_opacity(cfg.seagull_opacity)
    )
    birds = birds.set_duration(base_clip.duration).set_fps(base_clip.fps)
    composite = CompositeVideoClip([base_clip, birds.set_pos(("center", 0))])
    return composite


def process(input_path: str, output_path: str, cfg: EditConfig) -> None:
    img = read_image(input_path)
    img = remove_boat_with_inpaint(img)
    img = lift_subject(img, cfg.lift_subject_px)
    img = _lighten_top_region(img, cfg.lighten_factor)
    wave_clip = animate_waves(img, cfg)
    final_clip = overlay_seagulls(wave_clip, cfg)
    final_clip.write_videofile(output_path, codec="libx264", audio=False, fps=cfg.output_fps, preset="medium")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Photo-to-video edit with boat removal and waves")
    p.add_argument("input", help="Path to input photo")
    p.add_argument("output", help="Path to output video (e.g., out.mp4)")
    p.add_argument("--seagull-video", dest="seagull_video", default=None, help="Optional seagull overlay video (mp4 with alpha or black bg)")
    p.add_argument("--duration", type=float, default=6.0)
    p.add_argument("--fps", type=int, default=24)
    p.add_argument("--amplitude", type=float, default=6.0)
    p.add_argument("--wavelength", type=float, default=140.0)
    p.add_argument("--speed", type=float, default=0.35)
    p.add_argument("--lift", type=int, default=20)
    p.add_argument("--unrotate", type=float, default=6.0)
    return p.parse_args()


def main():
    args = parse_args()
    cfg = EditConfig(
        output_fps=args.fps,
        duration_sec=args.duration,
        wave_amplitude_px=args.amplitude,
        wave_wavelength_px=args.wavelength,
        wave_speed=args.speed,
        lift_subject_px=args.lift,
        head_unrotate_deg=args.unrotate,
        seagull_video=args.seagull_video,
    )
    process(args.input, args.output, cfg)


if __name__ == "__main__":
    main()

