/**
 * utils/forensics.js
 * Local digital forensics suite — 100% offline using sharp.
 *
 * Provides three complementary forensic analysis methods:
 *   1. Error Level Analysis (ELA) — JPEG re-compression delta matrix (FotoForensics standard).
 *   2. Noise Inconsistency Analysis — Isolates high-frequency sensor PRNU/noise grain to detect
 *      smoothed, airbrushed, or spliced elements.
 *   3. Luminance Gradient Analysis — Directional Sobel edge and lighting gradients to detect
 *      conflicting shadow and illumination vectors on composites.
 */

const sharp = require('sharp');

const MAX_FORENSIC_DIM = 1200;

/**
 * Prepare a normalized, auto-oriented, alpha-flattened base pipeline.
 */
function createBasePipeline(inputBuffer) {
    return sharp(inputBuffer)
        .rotate()
        .flatten({ background: '#ffffff' })
        .resize(MAX_FORENSIC_DIM, MAX_FORENSIC_DIM, { fit: 'inside', withoutEnlargement: true });
}

/**
 * Generate an Error Level Analysis (ELA) visualization.
 * Resaves the image at a known JPEG quality, computes absolute per-pixel
 * differences, and magnifies the variance.
 *
 * @param {Buffer} inputBuffer Original image buffer
 * @param {object} [opts] Options: { quality: 90, scale: 20 }
 * @returns {Promise<Buffer>} WebP ELA heat map
 */
async function generateELA(inputBuffer, { quality = 90, scale = 20 } = {}) {
    const basePipeline = createBasePipeline(inputBuffer);

    const { data: origPixels, info } = await basePipeline
        .clone()
        .raw()
        .toBuffer({ resolveWithObject: true });

    // Re-save at a uniform JPEG quality (FotoForensics standard: 90-95%)
    const resavedJpeg = await basePipeline
        .clone()
        .jpeg({ quality: Math.min(Math.max(quality, 50), 99) })
        .toBuffer();

    // Decode resaved JPEG into identical raw dimensions
    const resavedPixels = await sharp(resavedJpeg)
        .resize(info.width, info.height)
        .raw()
        .toBuffer();

    // Pixel-by-pixel difference scaled by magnification factor
    const diff = Buffer.alloc(origPixels.length);
    const mult = Math.min(Math.max(scale, 5), 40);
    for (let i = 0; i < origPixels.length; i++) {
        const delta = Math.abs(origPixels[i] - resavedPixels[i]);
        diff[i] = Math.min(255, delta * mult);
    }

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

/**
 * Generate a Sensor Noise Inconsistency / Residual Map.
 * Isolates high-frequency spatial variation by subtracting a low-pass Gaussian blur
 * from the luminance channel, then amplifying the residual.
 *
 * Spliced, cloned, or healed patches from other cameras or airbrushed regions
 * show up as contrasting "dead zones" or mismatched noise grain.
 *
 * @param {Buffer} inputBuffer Original image buffer
 * @param {object} [opts] Options: { scale: 18 }
 * @returns {Promise<Buffer>} WebP Noise Residual visualization
 */
async function generateNoiseAnalysis(inputBuffer, { scale = 18 } = {}) {
    const basePipeline = createBasePipeline(inputBuffer);

    const { data: origGray, info } = await basePipeline
        .clone()
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

    // Compute low-pass smoothed baseline
    const smoothedBuffer = await basePipeline
        .clone()
        .grayscale()
        .blur(1.5)
        .raw()
        .toBuffer();

    const mult = Math.min(Math.max(scale, 5), 40);
    const noiseMap = Buffer.alloc(origGray.length * 3); // Output as RGB heat map

    for (let i = 0; i < origGray.length; i++) {
        // High-frequency residual = |original - smoothed|
        const residual = Math.abs(origGray[i] - smoothedBuffer[i]);
        const amp = Math.min(255, residual * mult);

        // False-color heat representation:
        // Low noise (airbrushed/smoothed) -> deep blue/purple
        // Moderate sensor noise -> cyan/green
        // High frequency / edges -> yellow/white
        const outIdx = i * 3;
        if (amp < 40) {
            noiseMap[outIdx] = 15;
            noiseMap[outIdx + 1] = 20;
            noiseMap[outIdx + 2] = Math.min(255, amp * 5);
        } else if (amp < 120) {
            noiseMap[outIdx] = Math.min(255, (amp - 40) * 2);
            noiseMap[outIdx + 1] = Math.min(255, amp * 2);
            noiseMap[outIdx + 2] = 180;
        } else {
            noiseMap[outIdx] = 255;
            noiseMap[outIdx + 1] = Math.min(255, amp);
            noiseMap[outIdx + 2] = Math.min(255, amp - 60);
        }
    }

    return sharp(noiseMap, {
        raw: {
            width: info.width,
            height: info.height,
            channels: 3
        }
    })
    .webp({ quality: 90 })
    .toBuffer();
}

/**
 * Generate a Directional Luminance Gradient map using 2D Sobel operators.
 * Highlights lighting vectors and edge contrast to detect spliced composites
 * illuminated from inconsistent angles.
 *
 * @param {Buffer} inputBuffer Original image buffer
 * @returns {Promise<Buffer>} WebP Luminance Gradient visualization
 */
async function generateLuminanceGradient(inputBuffer) {
    const basePipeline = createBasePipeline(inputBuffer);

    const { data: gray, info } = await basePipeline
        .clone()
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const width = info.width;
    const height = info.height;
    const out = Buffer.alloc(width * height * 3);

    // 3x3 Sobel kernel convolution
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;

            // Pixel neighborhood
            const p00 = gray[(y - 1) * width + (x - 1)];
            const p01 = gray[(y - 1) * width + x];
            const p02 = gray[(y - 1) * width + (x + 1)];
            const p10 = gray[y * width + (x - 1)];
            const p12 = gray[y * width + (x + 1)];
            const p20 = gray[(y + 1) * width + (x - 1)];
            const p21 = gray[(y + 1) * width + x];
            const p22 = gray[(y + 1) * width + (x + 1)];

            // Sobel horizontal & vertical gradients
            const gx = (p02 + 2 * p12 + p22) - (p00 + 2 * p10 + p20);
            const gy = (p20 + 2 * p21 + p22) - (p00 + 2 * p01 + p02);

            const magnitude = Math.min(255, Math.round(Math.sqrt(gx * gx + gy * gy)));
            const angle = Math.atan2(gy, gx); // -PI to +PI

            // Map gradient direction to hue-like RGB
            const outIdx = (y * width + x) * 3;
            const r = Math.min(255, Math.round((Math.cos(angle) + 1) * 0.5 * magnitude));
            const g = Math.min(255, Math.round((Math.sin(angle) + 1) * 0.5 * magnitude));
            const b = Math.min(255, magnitude);

            out[outIdx] = r;
            out[outIdx + 1] = g;
            out[outIdx + 2] = b;
        }
    }

    return sharp(out, {
        raw: {
            width,
            height,
            channels: 3
        }
    })
    .webp({ quality: 90 })
    .toBuffer();
}

module.exports = {
    generateELA,
    generateNoiseAnalysis,
    generateLuminanceGradient
};
