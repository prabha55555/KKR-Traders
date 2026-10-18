/**
 * Logo upload for the Settings page: the picture is shrunk on the device (at most 400 px on the longest side) before it
 * is stored in the business settings, so bills stay light and the settings document stays well under Firestore's 1 MB.
 * A PNG keeps its transparent background; a picture that is still too large as PNG (a photo) becomes a JPEG on white.
 */

/** Longest side of the stored logo, in pixels. */
export const LOGO_MAX_SIDE = 400;
/** Largest PNG data URL kept as PNG (characters ≈ bytes); above it the logo is stored as JPEG. */
export const LOGO_PNG_LIMIT = 600_000;
const JPEG_QUALITY = 0.85;

/** Width / height scaled down (never up) to fit `maxSide`; a picture without a size (some SVGs) gets a square. */
export function fitWithin(width, height, maxSide = LOGO_MAX_SIDE) {
  if (!width || !height) return { width: maxSide, height: maxSide };
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('The picture could not be read. Please try another one.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error('This picture could not be opened. Please choose a PNG or JPG image.'));
    img.src = src;
  });
}

/** The picture drawn on a canvas of the given size (on `background` when given, else transparent). */
function drawOn(img, width, height, background) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

/** The chosen image file as a small data URL for the business logo (PNG with transparency, else JPEG). */
export async function resizeLogo(file, { maxSide = LOGO_MAX_SIDE, pngLimit = LOGO_PNG_LIMIT } = {}) {
  if (!file || !String(file.type).startsWith('image/')) {
    throw new Error('Please choose an image file (PNG or JPG).');
  }
  const img = await loadImage(await readAsDataUrl(file));
  const { width, height } = fitWithin(
    img.naturalWidth || img.width,
    img.naturalHeight || img.height,
    maxSide,
  );

  const clear = drawOn(img, width, height);
  if (!clear) throw new Error('This device could not process the picture.');
  const png = clear.toDataURL('image/png');
  if (png.startsWith('data:image/png') && png.length <= pngLimit) return png;

  const jpeg = drawOn(img, width, height, '#ffffff').toDataURL('image/jpeg', JPEG_QUALITY);
  if (!jpeg.startsWith('data:image/')) throw new Error('This device could not process the picture.');
  return jpeg;
}
