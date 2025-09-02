import argparse
import os
from typing import Optional, Tuple

import cv2
import numpy as np
from PIL import Image
import imageio

try:
    import mediapipe as mp  # type: ignore
    _MEDIAPIPE_AVAILABLE = True
except Exception:
    _MEDIAPIPE_AVAILABLE = False


def read_image_bgr(path: str) -> np.ndarray:
    image = cv2.imread(path, cv2.IMREAD_COLOR)
    if image is None:
        raise FileNotFoundError(f"Could not read image at {path}")
    return image


def ensure_dir(path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)


# ---------------------- Boat removal (inpainting) ---------------------- #

def load_mask_if_exists(path: Optional[str], shape: Tuple[int, int]) -> Optional[np.ndarray]:
    if path is None:
        return None
    if not os.path.exists(path):
        return None
    mask = np.array(Image.open(path).convert('L'))
    mask = cv2.resize(mask, (shape[1], shape[0]), interpolation=cv2.INTER_NEAREST)
    _, mask = cv2.threshold(mask, 127, 255, cv2.THRESH_BINARY)
    return mask


def heuristic_boat_mask(image_bgr: np.ndarray) -> np.ndarray:
    h, w = image_bgr.shape[:2]
    # Heuristic: assume boat sits on left edge near mid/upper water line.
    left_width = int(0.28 * w)
    top = int(0.30 * h)
    bottom = int(0.65 * h)
    mask = np.zeros((h, w), dtype=np.uint8)
    cv2.rectangle(mask, (0, top), (left_width, bottom), 255, thickness=-1)

    # Refine with edges to avoid sky
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 60, 140)
    edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=1)
    mask = cv2.bitwise_and(mask, cv2.bitwise_not(edges))
    mask = cv2.medianBlur(mask, 11)
    return mask


def remove_boat_inpaint(image_bgr: np.ndarray, mask_path: Optional[str]) -> np.ndarray:
    h, w = image_bgr.shape[:2]
    user_mask = load_mask_if_exists(mask_path, (h, w))
    mask = user_mask if user_mask is not None else heuristic_boat_mask(image_bgr)
    # Slightly expand mask to cover ropes/edges
    mask = cv2.dilate(mask, np.ones((7, 7), np.uint8), iterations=1)
    inpainted = cv2.inpaint(image_bgr, mask, 5, cv2.INPAINT_TELEA)
    return inpainted


# ---------------------- Person segmentation and lifting ---------------------- #

def get_person_mask_mediapipe(image_bgr: np.ndarray) -> Optional[np.ndarray]:
    if not _MEDIAPIPE_AVAILABLE:
        return None
    mp_selfie = mp.solutions.selfie_segmentation
    with mp_selfie.SelfieSegmentation(model_selection=1) as segmenter:
        image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
        result = segmenter.process(image_rgb)
        mask = (result.segmentation_mask * 255).astype(np.uint8)
        _, mask_bin = cv2.threshold(mask, 200, 255, cv2.THRESH_BINARY)
        mask_bin = cv2.morphologyEx(mask_bin, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
        return mask_bin


def make_background_plate(image_bgr: np.ndarray, person_mask: np.ndarray) -> np.ndarray:
    dilated = cv2.dilate(person_mask, np.ones((11, 11), np.uint8), iterations=1)
    bg = cv2.inpaint(image_bgr, dilated, 7, cv2.INPAINT_TELEA)
    return bg


def lift_subject(image_bgr: np.ndarray, person_mask: np.ndarray, offset_px: int) -> Tuple[np.ndarray, np.ndarray]:
    h, w = image_bgr.shape[:2]
    background = make_background_plate(image_bgr, person_mask)

    # Shift person mask and person pixels upward
    translation_matrix = np.float32([[1, 0, 0], [0, 1, -offset_px]])
    shifted_mask = cv2.warpAffine(person_mask, translation_matrix, (w, h), flags=cv2.INTER_NEAREST, borderValue=0)
    person_only = cv2.bitwise_and(image_bgr, image_bgr, mask=person_mask)
    shifted_person = cv2.warpAffine(person_only, translation_matrix, (w, h), flags=cv2.INTER_LINEAR, borderValue=0)

    composite = background.copy()
    mask_3 = cv2.merge([shifted_mask] * 3)
    composite = cv2.bitwise_and(composite, cv2.bitwise_not(mask_3))
    composite = cv2.add(composite, shifted_person)

    return composite, shifted_mask


# ---------------------- Wave animation (displacement) ---------------------- #

def apply_wave_displacement(frame_bgr: np.ndarray, t: float, amplitude: float, wavelength_px: float = 160.0, speed: float = 0.9) -> np.ndarray:
    h, w = frame_bgr.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    phase = (t * speed * 2.0 * np.pi)
    vertical_factor = np.clip((yy / h) * 1.4 - 0.2, 0.0, 1.0)  # stronger near bottom
    displacement = amplitude * vertical_factor * np.sin((xx / wavelength_px) * 2.0 * np.pi + phase)

    map_x = (xx + displacement).astype(np.float32)
    map_y = yy.astype(np.float32)
    warped = cv2.remap(frame_bgr, map_x, map_y, interpolation=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    return warped


# ---------------------- Head tilt correction ---------------------- #

def estimate_head_roll_degrees(image_bgr: np.ndarray) -> Optional[float]:
    if not _MEDIAPIPE_AVAILABLE:
        return None
    mp_face = mp.solutions.face_mesh
    with mp_face.FaceMesh(static_image_mode=True, refine_landmarks=True, max_num_faces=1) as mesh:
        image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
        result = mesh.process(image_rgb)
        if not result.multi_face_landmarks:
            return None
        landmarks = result.multi_face_landmarks[0]
        # Eye outer corners: approximate roll
        left_idx = 33
        right_idx = 263
        h, w = image_bgr.shape[:2]
        p_left = landmarks.landmark[left_idx]
        p_right = landmarks.landmark[right_idx]
        x1, y1 = int(p_left.x * w), int(p_left.y * h)
        x2, y2 = int(p_right.x * w), int(p_right.y * h)
        angle_rad = np.arctan2(y2 - y1, x2 - x1)
        angle_deg = np.degrees(angle_rad)
        return angle_deg


def gently_correct_head_roll(frame_bgr: np.ndarray, original_bgr: np.ndarray, progress: float, face_center: Optional[Tuple[int, int]] = None) -> np.ndarray:
    # progress in [0,1]; 0 = original, 1 = fully corrected to 0 roll
    roll = estimate_head_roll_degrees(original_bgr)
    if roll is None:
        return frame_bgr
    target = 0.0
    current = roll * (1.0 - progress)  # linear approach to 0

    # Determine rotation center roughly at face center if provided, else image center
    h, w = frame_bgr.shape[:2]
    cx, cy = (w // 2, h // 2) if face_center is None else face_center

    rotation_matrix = cv2.getRotationMatrix2D((cx, cy), current, 1.0)
    rotated = cv2.warpAffine(frame_bgr, rotation_matrix, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    return rotated


# ---------------------- Seagull overlay ---------------------- #

def draw_seagull(canvas: np.ndarray, center: Tuple[int, int], size: int, color: Tuple[int, int, int]) -> None:
    x, y = center
    wing = size
    pt1 = (x - wing, y)
    pt2 = (x, y - int(0.4 * wing))
    pt3 = (x + wing, y)
    cv2.polylines(canvas, [np.array([pt1, pt2, pt3], dtype=np.int32)], isClosed=False, color=color, thickness=2, lineType=cv2.LINE_AA)


def overlay_seagulls(frame_bgr: np.ndarray, t: float, h_frac: float = 0.18) -> np.ndarray:
    h, w = frame_bgr.shape[:2]
    y_band = int(h * h_frac)
    y_pos = int(y_band * 0.6)

    frame = frame_bgr.copy()
    num_birds = 5
    for i in range(num_birds):
        speed = 40 + i * 18
        x = int((t * speed + i * (w / num_birds)) % (w + 100)) - 50
        size = 10 + (i % 3) * 5
        draw_seagull(frame, (x, y_pos + (i % 2) * 8), size, (240, 240, 240))
    return frame


# ---------------------- Pipeline ---------------------- #

def build_frames(
    input_path: str,
    boat_mask_path: Optional[str],
    fps: int,
    seconds: float,
    raise_px: int,
    wave_amp: float,
    head_smooth: float,
) -> Tuple[np.ndarray, list]:
    base = read_image_bgr(input_path)

    # 1) Boat removal
    boat_clean = remove_boat_inpaint(base, boat_mask_path)

    # 2) Person mask
    person_mask = get_person_mask_mediapipe(boat_clean)
    if person_mask is None:
        # Fallback: try to estimate person region with skin-tone + central blob (very rough)
        h, w = boat_clean.shape[:2]
        rough = np.zeros((h, w), dtype=np.uint8)
        cx1, cx2 = int(w * 0.35), int(w * 0.65)
        cy1, cy2 = int(h * 0.35), int(h * 0.85)
        cv2.rectangle(rough, (cx1, cy1), (cx2, cy2), 255, -1)
        person_mask = rough

    # 3) Lift subject and prepare base frame
    lifted, lifted_mask = lift_subject(boat_clean, person_mask, raise_px)

    num_frames = int(fps * seconds)
    frames = []

    for i in range(num_frames):
        t = i / fps
        progress = min(1.0, (i + 1) / num_frames)

        # 4) Animate waves on the composite background (not on the person mask)
        bg_only = cv2.bitwise_and(lifted, cv2.bitwise_not(cv2.merge([lifted_mask] * 3)))
        bg_waves = apply_wave_displacement(bg_only, t, amplitude=wave_amp)
        person_only = cv2.bitwise_and(lifted, cv2.merge([lifted_mask] * 3))
        composed = cv2.add(bg_waves, person_only)

        # 5) Gently correct head tilt over time
        corrected = gently_correct_head_roll(composed, base, progress=progress)

        # 6) Overlay seagulls across sky
        with_birds = overlay_seagulls(corrected, t)

        frames.append(cv2.cvtColor(with_birds, cv2.COLOR_BGR2RGB))

    return base, frames


def save_video(frames: list, out_path: str, fps: int) -> None:
    ensure_dir(out_path)
    writer = imageio.get_writer(out_path, fps=fps, macro_block_size=None)
    for f in frames:
        writer.append_data(f)
    writer.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Input image path, e.g., assets/input.jpg")
    parser.add_argument("--boat-mask", default=None, help="Optional boat mask path (white=boat)")
    parser.add_argument("--out", default="output/final.mp4", help="Output video path")
    parser.add_argument("--fps", type=int, default=24)
    parser.add_argument("--seconds", type=float, default=6.0)
    parser.add_argument("--raise-px", type=int, default=22, help="Pixels to raise the subject")
    parser.add_argument("--wave-amp", type=float, default=1.8, help="Wave displacement amplitude in pixels")
    parser.add_argument("--head-smooth", type=float, default=0.85, help="Smoothing factor [0-1]")

    args = parser.parse_args()

    _, frames = build_frames(
        input_path=args.input,
        boat_mask_path=args.boat_mask,
        fps=args.fps,
        seconds=args.seconds,
        raise_px=args.raise_px,
        wave_amp=args.wave_amp,
        head_smooth=args.head_smooth,
    )

    save_video(frames, args.out, args.fps)
    print(f"Saved: {args.out}")


if __name__ == "__main__":
    main()