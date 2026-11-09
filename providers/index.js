/**
 * Provider registry — duck-typed contract (documentation §8).
 * A provider is any module exporting { name, sourceType, matchMethod,
 * isEnabled(), search(input) }. Adding a provider = adding one file here.
 */

const LocalHashProvider = require('./LocalHashProvider');
const GeoOsintProvider = require('./GeoOsintProvider');
const OpenverseCorpusProvider = require('./OpenverseCorpusProvider');
const WikimediaCorpusProvider = require('./WikimediaCorpusProvider');
const INaturalistProvider = require('./INaturalistProvider');
const TraceMoeProvider = require('./TraceMoeProvider');
const SerpApiProvider = require('./SerpApiProvider');
const GoogleVisionProvider = require('./GoogleVisionProvider');

// Fast local first, specialized OSINT & taxonomy, free corpora, then metered lookups.
const PROVIDERS = [
    LocalHashProvider,
    GeoOsintProvider,
    OpenverseCorpusProvider,
    WikimediaCorpusProvider,
    INaturalistProvider,
    TraceMoeProvider,
    SerpApiProvider,
    GoogleVisionProvider
];

function allProviders() {
    return PROVIDERS;
}

function enabledProviders() {
    return PROVIDERS.filter((p) => {
        try {
            return typeof p.isEnabled === 'function' ? p.isEnabled() : true;
        } catch {
            return false;
        }
    });
}

module.exports = { allProviders, enabledProviders };
