/**
 * Sanitization utilities — URL normalization (dedup §23), hint cleaning,
 * and display-safe filename handling.
 */

/**
 * Normalize an external URL for dedup comparison:
 *   1. strip query string and fragment
 *   2. lowercase scheme and host
 *   3. remove trailing slash on the path (root "/" kept)
 * Returns null for unparseable input.
 */
function normalizeUrl(rawUrl) {
    if (typeof rawUrl !== 'string' || rawUrl.length === 0 || rawUrl.length > 2048) {
        return null;
    }

    let url;
    try {
        url = new URL(rawUrl);
    } catch {
        return null;
    }

    url.search = '';
    url.hash = '';

    url.protocol = url.protocol.toLowerCase();
    if (url.hostname) {
        url.hostname = url.hostname.toLowerCase();
    }

    let out = url.toString();
    if (out.length > 1 && out.endsWith('/')) {
        out = out.slice(0, -1);
    }

    return out;
}

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

/** Clean a contextual-hint value: trim, strip control chars, collapse whitespace, cap length. */
function sanitizeHint(value, maxLen = 120) {
    if (typeof value !== 'string') return null;
    const cleaned = value
        .replace(CONTROL_CHARS, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLen);
    return cleaned.length > 0 ? cleaned : null;
}

const HINT_KEYS = ['name', 'location', 'username', 'organization', 'keyword'];

/** Pick + clean known hint keys from an arbitrary object. */
function sanitizeHints(source) {
    const hints = {};
    for (const key of HINT_KEYS) {
        const v = sanitizeHint(source ? source[key] : undefined);
        if (v) hints[key] = v;
    }
    return hints;
}

/** Display-only original filename: basename, no traversal chars, capped. */
function safeDisplayName(originalName) {
    if (typeof originalName !== 'string') return 'unnamed';
    const base = originalName.split(/[\\/]/).pop().replace(CONTROL_CHARS, '').trim();
    return (base.length > 0 ? base : 'unnamed').slice(0, 200);
}

module.exports = { normalizeUrl, sanitizeHint, sanitizeHints, safeDisplayName };
