/**
 * Perceptual hashing utilities — plain JavaScript, zero image deps.
 *
 * All three fingerprints are computed from ONE shared raw buffer:
 * a 32×32 single-channel (grayscale) buffer produced by
 * FingerprintService.normalize(). Implements documentation rule R6
 * (one pixel buffer feeds every hash so results stay comparable).
 *
 *   pHash — 2D DCT-II, top-left 8×8 low-frequency coefficients,
 *           median-thresholded → 64 bits.
 *   dHash — grid-averaged to a 9×8 cell lattice, horizontal
 *           gradient comparisons → 64 bits.
 *   aHash — averaged down to 8×8 blocks, mean-thresholded → 64 bits.
 *
 * Every hash is returned as a fixed-length 16-char lowercase hex string.
 */

const RAW_SIZE = 32;
const N = RAW_SIZE;

/* ── Precomputed DCT cosine table ──────────────────────────── */
/* COS[u][x] = cos(((2x+1) · u · π) / (2N))                     */

const SQRT_1_N = Math.sqrt(1 / N);
const SQRT_2_N = Math.sqrt(2 / N);

const COS = new Array(N);
for (let u = 0; u < N; u++) {
    COS[u] = new Float64Array(N);
    for (let x = 0; x < N; x++) {
        COS[u][x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N));
    }
}

function alpha(u) {
    return u === 0 ? SQRT_1_N : SQRT_2_N;
}

/** 1D DCT-II of `input` into `output` using the precomputed table. */
function dct1d(input, output) {
    for (let u = 0; u < N; u++) {
        let sum = 0;
        const row = COS[u];
        for (let x = 0; x < N; x++) {
            sum += input[x] * row[x];
        }
        output[u] = sum * alpha(u);
    }
}

/**
 * 2D DCT-II (separable row/column passes).
 * Returns a flat Float64Array of size N*N (row-major).
 */
function dct2d(pixels) {
    const rows = new Float64Array(N * N);
    const out = new Float64Array(N * N);
    const tmpIn = new Float64Array(N);
    const tmpOut = new Float64Array(N);

    // Row pass.
    for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) tmpIn[x] = pixels[y * N + x];
        dct1d(tmpIn, tmpOut);
        for (let u = 0; u < N; u++) rows[y * N + u] = tmpOut[u];
    }

    // Column pass.
    for (let u = 0; u < N; u++) {
        for (let y = 0; y < N; y++) tmpIn[y] = rows[y * N + u];
        dct1d(tmpIn, tmpOut);
        for (let v = 0; v < N; v++) out[v * N + u] = tmpOut[v];
    }

    return out;
}

function assertRawBuffer(buffer) {
    if (!buffer || buffer.length !== RAW_SIZE * RAW_SIZE) {
        throw new Error(`Expected a ${RAW_SIZE}×${RAW_SIZE} grayscale raw buffer (${RAW_SIZE * RAW_SIZE} bytes).`);
    }
}

/* ── pHash ─────────────────────────────────────────────────── */

function phashFromRaw(buffer) {
    assertRawBuffer(buffer);

    const coeffs = dct2d(buffer);

    // Top-left 8×8 low-frequency block.
    const low = new Float64Array(64);
    for (let v = 0; v < 8; v++) {
        for (let u = 0; u < 8; u++) {
            low[v * 8 + u] = coeffs[v * N + u];
        }
    }

    // Median over the block excluding the DC term [0][0].
    const rest = Array.from(low.slice(1)).sort((a, b) => a - b);
    const median = rest[Math.floor(rest.length / 2)];

    const bits = new Array(64);
    for (let i = 0; i < 64; i++) {
        bits[i] = low[i] > median ? 1 : 0;
    }

    return bitsToHex(bits);
}

/* ── dHash (grid-average variant — keeps the single-buffer rule) ── */

const DHASH_COLS = 9;
const DHASH_ROWS = 8;

function dhashFromRaw(buffer) {
    assertRawBuffer(buffer);

    const colBounds = [];
    const rowBounds = [];
    for (let i = 0; i <= DHASH_COLS; i++) colBounds.push(Math.round((i * RAW_SIZE) / DHASH_COLS));
    for (let j = 0; j <= DHASH_ROWS; j++) rowBounds.push(Math.round((j * RAW_SIZE) / DHASH_ROWS));

    const cell = new Array(DHASH_ROWS);
    for (let j = 0; j < DHASH_ROWS; j++) {
        cell[j] = new Float64Array(DHASH_COLS);
        for (let i = 0; i < DHASH_COLS; i++) {
            let sum = 0;
            let count = 0;
            for (let y = rowBounds[j]; y < rowBounds[j + 1]; y++) {
                for (let x = colBounds[i]; x < colBounds[i + 1]; x++) {
                    sum += buffer[y * RAW_SIZE + x];
                    count++;
                }
            }
            cell[j][i] = count > 0 ? sum / count : 0;
        }
    }

    const bits = new Array(64);
    for (let j = 0; j < DHASH_ROWS; j++) {
        for (let i = 0; i < DHASH_COLS - 1; i++) {
            bits[j * 8 + i] = cell[j][i] > cell[j][i + 1] ? 1 : 0;
        }
        bits[j * 8 + 7] = 0; // pad column → fixed 64-bit layout
    }

    return bitsToHex(bits);
}

/* ── aHash ─────────────────────────────────────────────────── */

function ahashFromRaw(buffer) {
    assertRawBuffer(buffer);

    // Average 4×4 pixel blocks down to an 8×8 lattice, then mean-threshold.
    const small = new Float64Array(64);
    for (let by = 0; by < 8; by++) {
        for (let bx = 0; bx < 8; bx++) {
            let sum = 0;
            for (let dy = 0; dy < 4; dy++) {
                for (let dx = 0; dx < 4; dx++) {
                    sum += buffer[(by * 4 + dy) * RAW_SIZE + (bx * 4 + dx)];
                }
            }
            small[by * 8 + bx] = sum / 16;
        }
    }

    let mean = 0;
    for (let i = 0; i < 64; i++) mean += small[i];
    mean /= 64;

    const bits = new Array(64);
    for (let i = 0; i < 64; i++) {
        bits[i] = small[i] > mean ? 1 : 0;
    }

    return bitsToHex(bits);
}

/* ── Bit packing ───────────────────────────────────────────── */

function bitsToHex(bits) {
    let hex = '';
    for (let i = 0; i < 64; i += 4) {
        const nibble =
            (bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3];
        hex += nibble.toString(16);
    }
    return hex;
}

/** Convenience: all three fingerprints from one raw buffer. */
function fingerprintsFromRaw(buffer) {
    return {
        phash: phashFromRaw(buffer),
        dhash: dhashFromRaw(buffer),
        ahash: ahashFromRaw(buffer)
    };
}

module.exports = {
    RAW_SIZE,
    phashFromRaw,
    dhashFromRaw,
    ahashFromRaw,
    fingerprintsFromRaw,
    bitsToHex
};

