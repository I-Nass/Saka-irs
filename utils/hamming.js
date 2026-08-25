/**
 * Hamming distance over fixed-length hex strings (64-bit hashes → 16 hex chars).
 * Uses BigInt XOR + Kernighan popcount — plain JS, no dependencies.
 */

const HEX_RE = /^[0-9a-f]+$/;

/**
 * Count differing bits between two equal-length hash strings.
 * @param {string} hexA 16-char lowercase hex
 * @param {string} hexB 16-char lowercase hex
 * @returns {number} Hamming distance (0–64 for 64-bit hashes)
 */
function hammingDistanceHex(hexA, hexB) {
    if (typeof hexA !== 'string' || typeof hexB !== 'string') {
        throw new TypeError('Hash inputs must be strings.');
    }

    const a = hexA.toLowerCase();
    const b = hexB.toLowerCase();

    if (!HEX_RE.test(a) || !HEX_RE.test(b)) {
        throw new TypeError('Hash inputs must be hexadecimal.');
    }

    if (a.length !== b.length) {
        throw new Error(`Hash length mismatch: ${a.length} vs ${b.length}.`);
    }

    let xored = BigInt('0x' + a) ^ BigInt('0x' + b);
    let distance = 0;

    while (xored !== 0n) {
        xored &= xored - 1n; // clear lowest set bit
        distance++;
    }

    return distance;
}

module.exports = { hammingDistanceHex };
