/**
 * utils/forensics.js
 * Local digital forensics — Error Level Analysis (ELA).
 * Recreates the FotoForensics methodology 100% offline using sharp.
 */

const sharp = require('sharp');

/**
 * Generate an Error Level Analysis (ELA) visualization.
 * Resaves the image at a known JPEG quality, computes absolute per-pixel
 * differences, and magnifies the variance.
 *
 * Edited, cloned, or spliced elements stand out with higher or contrasting
 * error levels compared to original camera sensor noise.
 *
 * @param {Buffer} inputBuffer Original image buffer
 * @param {object} [opts] Options: { quality: 90, scale: 20 }
 * @returns {Promise<Buffer>} WebP ELA heat map
 */
async function generateELA(inputBuffer, { quality = 90, scale = 20 } = {}) {
    // 1. Normalize and auto-orient original, cap width to 1200px for fast interactive rendering
    const basePipeline = sharp(inputBuffer)
        .rotate()
        .flatten({ background: '#ffffff' })
        .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true });

    const { data: origPixels, info } = await basePipeline
        .clone()
        .raw()
        .toBuffer({ resolveWithObject: true });

    // 2. Re-save at a uniform JPEG quality (FotoForensics standard: 90-95%)
    const resavedJpeg = await basePipeline
        .clone()
        .jpeg({ quality })
        .toBuffer();

    // 3. Decode resaved JPEG into identical raw dimensions
    const resavedPixels = await sharp(resavedJpeg)
        .resize(info.width, info.height)
        .raw()
        .toBuffer();

    // 4. Pixel-by-pixel difference scaled by magnification factor
    const diff = Buffer.alloc(origPixels.length);
    for (let i = 0; i < origPixels.length; i++) {
        const delta = Math.abs(origPixels[i] - resavedPixels[i]);
        diff[i] = Math.min(255, delta * scale);
    }

    // 5. Render ELA difference buffer as high-quality WebP
    return sharp(diff, {
        raw: {
            width: info.width,
            height: info.height,
            channels: info.channels
        }
    })
    .webp({ quality: 90 })
    .toBuffer();
}

module.exports = { generateELA };

