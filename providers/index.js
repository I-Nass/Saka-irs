/**
 * Provider registry — duck-typed contract (documentation §8).
 * A provider is any module exporting { name, sourceType, matchMethod,
 * isEnabled(), search(input) }. Adding a provider = adding one file here.
 */

const LocalHashProvider = require('./LocalHashProvider');
const OpenverseCorpusProvider = require('./OpenverseCorpusProvider');
const WikimediaCorpusProvider = require('./WikimediaCorpusProvider');
const TraceMoeProvider = require('./TraceMoeProvider');
const SerpApiProvider = require('./SerpApiProvider');
const GoogleVisionProvider = require('./GoogleVisionProvider');

// Fast local first, then free corpora, then metered external lookups.
const PROVIDERS = [
    LocalHashProvider,
    OpenverseCorpusProvider,
    WikimediaCorpusProvider,
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
