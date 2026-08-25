/**
 * MetadataService — safe EXIF extraction (exifr).
 *
 * Privacy-first shape (documentation §29): GPS presence is recorded as a
 * BOOLEAN ONLY. Raw coordinates are never stored or returned.
 */

const exifr = require('exifr');

/**
 * Extract minimal, privacy-safe metadata from an ORIGINAL image buffer
 * (extraction happens locally before any sanitized re-encode).
 */
async function extract(buffer) {
    const result = {
        hasExif: false,
        takenAt: null,
        cameraModel: null,
        hasGps: false
    };

    try {
        const parsed = await exifr.parse(buffer, {
            tiff: true,
            exif: true,
            gps: true,
            ifd0: true,
            translateValues: false,
            reviveValues: true,
            silentErrors: true
        });

        if (!parsed) return result;

        result.hasExif = Object.keys(parsed).length > 0;

        const dateVal = parsed.DateTimeOriginal || parsed.CreateDate || parsed.ModifyDate;
        if (dateVal instanceof Date && !Number.isNaN(dateVal.getTime())) {
            result.takenAt = dateVal;
        }

        const make = typeof parsed.Make === 'string' ? parsed.Make.trim() : '';
        const model = typeof parsed.Model === 'string' ? parsed.Model.trim() : '';
        if (make || model) {
            result.cameraModel = [make, model].filter(Boolean).join(' ').slice(0, 120);
        }

        result.hasGps = Number.isFinite(parsed.latitude) && Number.isFinite(parsed.longitude);

        // Defensive: never carry coordinates forward.
        delete parsed.latitude;
        delete parsed.longitude;
    } catch {
        // Unreadable metadata must never fail an ingest.
    }

    return result;
}

module.exports = { extract };
