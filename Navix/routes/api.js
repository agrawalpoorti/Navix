const express = require('express');
const router  = express.Router();
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const RouteHistory = require('../models/RouteHistory');
const Feedback = require('../models/Feedback');

const enginePath = process.env.ENGINE_PATH || path.join(__dirname, '../../DSA_LOGIC/navix_engine');
const geocodeCache = new Map();
const legLiveCache = new Map();
const httpTimeoutMs = Number(process.env.HTTP_TIMEOUT_MS || 12000);
const httpRetryCount = Math.max(1, Number(process.env.HTTP_RETRY_COUNT || 3));
const appUserAgent = process.env.APP_USER_AGENT || 'Navix/1.0 (Educational Route Planner)';
const localContactEmail = process.env.CONTACT_EMAIL || '';
const osrmBaseUrls = [
    process.env.OSRM_BASE_URL || 'https://router.project-osrm.org',
    'https://routing.openstreetmap.de/routed-car'
];

function runEngineRoute(source, destination, preference) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(enginePath)) {
            return reject(new Error(`Engine binary not found at: ${enginePath}`));
        }
        const proc = spawn(enginePath);
        let output = '';
        let errorOutput = '';

        proc.stdin.write(`${source}\n${destination}\n${preference}\n`);
        proc.stdin.end();

        proc.stdout.on('data', (data) => {
            output += data.toString();
        });

        proc.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        proc.on('error', (err) => reject(err));

        proc.on('close', (code) => {
            const trimmed = output.trim();

            if (trimmed === 'NO_PATH') {
                return resolve({ noPath: true });
            }

            try {
                const parsed = JSON.parse(trimmed);
                return resolve({ noPath: false, result: parsed, code, stderr: errorOutput });
            } catch (e) {
                return reject(new Error(`Failed to parse engine output. Exit code: ${code}. STDERR: ${errorOutput}`));
            }
        });
    });
}

function loadKnownCities() {
    const filePath = path.join(__dirname, '../../DSA_LOGIC/location_data.txt');
    if (!fs.existsSync(filePath)) return new Set();

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').map((line) => line.trim()).filter(Boolean);
    const cities = new Set();

    for (const line of lines) {
        const [from, to] = line.split(/\s+/);
        if (from) cities.add(from);
        if (to) cities.add(to);
    }

    return cities;
}

function loadGraphData() {
    const filePath = path.join(__dirname, '../../DSA_LOGIC/location_data.txt');
    if (!fs.existsSync(filePath)) {
        return { cities: [], citySet: new Set(), edges: [] };
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').map((line) => line.trim()).filter(Boolean);
    const citySet = new Set();
    const edges = [];

    for (const line of lines) {
        const [from, to, distance, time, cost] = line.split(/\s+/);
        if (!from || !to) continue;
        citySet.add(from);
        citySet.add(to);
        edges.push({
            from,
            to,
            distance: Number(distance || 0),
            time: Number(time || 0),
            cost: Number(cost || 0)
        });
    }

    return { cities: Array.from(citySet), citySet, edges };
}

const knownCities = loadKnownCities();
const graphData = loadGraphData();
const allowedPreferences = new Set(['distance', 'time', 'cost']);
const staticLegMap = new Map();
const undirectedKey = (a, b) => [a, b].sort().join('|');

graphData.edges.forEach((edge) => {
    staticLegMap.set(undirectedKey(edge.from, edge.to), {
        distanceKm: Number(edge.distance || 0),
        durationMin: Number(edge.time || 0)
    });
});

function normalizePreference(preference) {
    const normalized = String(preference || '').toLowerCase();
    return allowedPreferences.has(normalized) ? normalized : 'distance';
}

function getIdentityFilter(req) {
    const identity = req.identity || {};
    const ownerType = identity.ownerType || 'guest';
    const ownerId = identity.ownerId || req.cookies?.guestId || '';
    return { ownerType, ownerId };
}

function withGraph(result) {
    return {
        ...result,
        graph: {
            cities: graphData.cities,
            edges: graphData.edges
        }
    };
}

function cityQuery(city) {
    if (knownCities.has(city)) {
        return `${city}, India`;
    }
    return city;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = httpTimeoutMs) {
    if (typeof fetch !== 'function') throw new Error('Fetch API unavailable in current Node runtime');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const merged = {
            ...options,
            signal: controller.signal
        };
        return await fetch(url, merged);
    } finally {
        clearTimeout(timer);
    }
}

async function fetchJsonWithRetry(url, options = {}, retries = httpRetryCount) {
    let lastError = null;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await fetchWithTimeout(url, options, httpTimeoutMs);

            if (!response.ok) {
                const canRetry = response.status === 429 || response.status >= 500;
                if (canRetry && attempt < retries) {
                    await sleep(250 * attempt);
                    continue;
                }
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            lastError = error;
            if (attempt < retries) {
                await sleep(250 * attempt);
                continue;
            }
        }
    }

    throw lastError || new Error('Request failed');
}

async function geocodeViaNominatim(city) {
    const query = encodeURIComponent(cityQuery(city));
    const emailParam = localContactEmail ? `&email=${encodeURIComponent(localContactEmail)}` : '';
    const nominatimUrls = [
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=in&q=${query}${emailParam}`,
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${query}${emailParam}`
    ];

    let lastError = null;
    for (const url of nominatimUrls) {
        try {
            const data = await fetchJsonWithRetry(url, {
                headers: {
                    'User-Agent': appUserAgent,
                    'Accept-Language': 'en'
                }
            });
            if (Array.isArray(data) && data.length > 0) {
                return { lat: Number(data[0].lat), lon: Number(data[0].lon) };
            }
            lastError = new Error(`No coordinates found for ${city} in Nominatim`);
        } catch (err) {
            lastError = err;
        }
    }
    throw lastError || new Error(`No coordinates found for ${city} in Nominatim`);
}

async function geocodeViaOpenMeteo(city) {
    const query = encodeURIComponent(cityQuery(city));
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${query}&count=1&language=en&format=json`;
    const data = await fetchJsonWithRetry(url);
    if (!data || !Array.isArray(data.results) || data.results.length === 0) {
        throw new Error(`No coordinates found for ${city} in Open-Meteo`);
    }
    return {
        lat: Number(data.results[0].latitude),
        lon: Number(data.results[0].longitude)
    };
}

async function geocodeCity(city) {
    if (geocodeCache.has(city)) return geocodeCache.get(city);

    let point = null;
    try {
        point = await geocodeViaNominatim(city);
    } catch (_) {
        point = await geocodeViaOpenMeteo(city);
    }

    geocodeCache.set(city, point);
    return point;
}

async function getLegLiveStats(fromCity, toCity) {
    const cacheKey = `${fromCity}|${toCity}`;
    if (legLiveCache.has(cacheKey)) return legLiveCache.get(cacheKey);

    const from = await geocodeCity(fromCity);
    const to = await geocodeCity(toCity);

    let lastError = null;
    for (const baseUrl of osrmBaseUrls) {
        const url = `${baseUrl}/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false&alternatives=false&steps=false`;
        try {
            const data = await fetchJsonWithRetry(url);
            if (data.code !== 'Ok' || !Array.isArray(data.routes) || data.routes.length === 0) {
                throw new Error(`OSRM returned no route`);
            }

            const route = data.routes[0];
            const stats = {
                distanceMeters: Number(route.distance || 0),
                durationSeconds: Number(route.duration || 0)
            };
            legLiveCache.set(cacheKey, stats);
            return stats;
        } catch (err) {
            lastError = err;
        }
    }
    throw new Error(`OSRM failed for ${fromCity} -> ${toCity}: ${lastError ? lastError.message : 'Unknown error'}`);
}

async function getLegLiveStatsUndirected(fromCity, toCity) {
    try {
        return await getLegLiveStats(fromCity, toCity);
    } catch (forwardError) {
        try {
            return await getLegLiveStats(toCity, fromCity);
        } catch (reverseError) {
            throw new Error(
                `OSRM failed for ${fromCity} <-> ${toCity}: ${forwardError.message}; ${reverseError.message}`
            );
        }
    }
}

async function enrichWithLiveData(engineResult) {
    const pathArr = Array.isArray(engineResult.path) ? engineResult.path : [];

    if (pathArr.length <= 1) {
        return {
            ...engineResult,
            liveData: false,
            liveSource: 'fallback',
            liveNote: 'Route has fewer than 2 points; live enrichment skipped.'
        };
    }

    let totalDistanceMeters = 0;
    let totalDurationSeconds = 0;
    let liveLegs = 0;
    let staticFallbackLegs = 0;

    for (let i = 0; i < pathArr.length - 1; i++) {
        const from = pathArr[i];
        const to = pathArr[i + 1];
        try {
            const leg = await getLegLiveStatsUndirected(from, to);
            totalDistanceMeters += leg.distanceMeters;
            totalDurationSeconds += leg.durationSeconds;
            liveLegs += 1;
        } catch (_) {
            const staticLeg = staticLegMap.get(undirectedKey(from, to));
            if (staticLeg) {
                totalDistanceMeters += staticLeg.distanceKm * 1000;
                totalDurationSeconds += staticLeg.durationMin * 60;
                staticFallbackLegs += 1;
            } else {
                throw new Error(`Live and static leg data missing for ${from} -> ${to}`);
            }
        }
    }

    const totalDistance = Math.max(1, Math.round(totalDistanceMeters / 1000));
    const totalTime = Math.max(1, Math.round(totalDurationSeconds / 60));

    // Simple road-trip estimate; can be replaced by a toll/fuel API later.
    const estimatedCostPerKm = 5;
    const totalCost = Math.round(totalDistance * estimatedCostPerKm);

    return {
        ...engineResult,
        totalDistance,
        totalTime,
        totalCost,
        liveData: liveLegs > 0,
        liveSource: liveLegs > 0 ? 'nominatim+osrm' : 'fallback',
        liveNote: staticFallbackLegs > 0
            ? `Live data used for ${liveLegs} leg(s), static fallback for ${staticFallbackLegs} leg(s).`
            : undefined
    };
}

router.post('/route', (req, res) => {
    const { source, destination, preference } = req.body;

    if (!source || !destination || !preference) {
        return res.status(400).json({ error: 'Missing fields' });
    }
    if (source === destination) {
        return res.status(400).json({ error: 'Source and destination cannot be same' });
    }

    runEngineRoute(source, destination, preference)
        .then((payload) => {
            if (payload.noPath) return res.status(404).json({ error: 'No route found' });
            return res.status(200).json(withGraph(payload.result));
        })
        .catch((e) => {
            return res.status(500).json({ error: 'Failed to parse engine output', details: e.message });
        });
});

router.post('/route-live', async (req, res) => {
    const { source, destination, preference } = req.body;

    if (!source || !destination || !preference) {
        return res.status(400).json({ error: 'Missing fields' });
    }
    if (source === destination) {
        return res.status(400).json({ error: 'Source and destination cannot be same' });
    }

    try {
        const payload = await runEngineRoute(source, destination, preference);
        if (payload.noPath) return res.status(404).json({ error: 'No route found' });

        try {
            const enriched = await enrichWithLiveData(payload.result);
            return res.status(200).json(withGraph(enriched));
        } catch (liveError) {
            return res.status(200).json({
                ...withGraph(payload.result),
                liveData: false,
                liveSource: 'fallback',
                liveNote: `Live enrichment unavailable: ${liveError.message}`
            });
        }
    } catch (e) {
        return res.status(500).json({ error: 'Failed to compute route', details: e.message });
    }
});

router.get('/graph-meta', (req, res) => {
    return res.status(200).json({
        cities: graphData.cities,
        edges: graphData.edges
    });
});

router.post('/geocode-batch', async (req, res) => {
    try {
        const citiesRaw = Array.isArray(req.body?.cities) ? req.body.cities : [];
        const cities = [...new Set(
            citiesRaw
                .map((city) => String(city || '').trim())
                .filter(Boolean)
        )].slice(0, 100);

        if (!cities.length) {
            return res.status(400).json({ error: 'No cities provided' });
        }

        const coords = {};
        const failed = [];

        for (const city of cities) {
            try {
                const point = await geocodeCity(city);
                coords[city] = [point.lat, point.lon];
            } catch (_) {
                failed.push(city);
            }
        }

        return res.status(200).json({ coords, failed });
    } catch (e) {
        return res.status(500).json({ error: 'Failed to geocode cities', details: e.message });
    }
});

router.get('/history', async (req, res) => {
    try {
        const identityFilter = getIdentityFilter(req);
        if (!identityFilter.ownerId) {
            return res.status(401).json({ error: 'Identity missing' });
        }

        const entries = await RouteHistory.find(identityFilter)
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();

        const history = entries.map((entry) => ({
            id: String(entry._id),
            createdAt: entry.createdAt,
            source: entry.source,
            destination: entry.destination,
            preference: entry.preference,
            totalDistance: entry.totalDistance,
            totalTime: entry.totalTime,
            totalCost: entry.totalCost,
            stops: entry.stops,
            path: entry.path || [],
            liveData: Boolean(entry.liveData)
        }));

        return res.status(200).json({ history });
    } catch (e) {
        return res.status(500).json({ error: 'Failed to fetch history', details: e.message });
    }
});

router.post('/history', async (req, res) => {
    try {
        const identityFilter = getIdentityFilter(req);
        if (!identityFilter.ownerId) {
            return res.status(401).json({ error: 'Identity missing' });
        }

        const {
            source,
            destination,
            preference,
            totalDistance,
            totalTime,
            totalCost,
            stops,
            path,
            liveData
        } = req.body;

        if (!source || !destination) {
            return res.status(400).json({ error: 'Missing source or destination' });
        }

        const created = await RouteHistory.create({
            ...identityFilter,
            source: String(source),
            destination: String(destination),
            preference: normalizePreference(preference),
            totalDistance: Number(totalDistance) || 0,
            totalTime: Number(totalTime) || 0,
            totalCost: Number(totalCost) || 0,
            stops: Number(stops) || 0,
            path: Array.isArray(path) ? path.map((p) => String(p)) : [],
            liveData: Boolean(liveData)
        });

        const count = await RouteHistory.countDocuments(identityFilter);
        if (count > 100) {
            const overLimit = count - 100;
            const oldest = await RouteHistory.find(identityFilter)
                .sort({ createdAt: 1 })
                .limit(overLimit)
                .select('_id')
                .lean();
            if (oldest.length) {
                await RouteHistory.deleteMany({
                    _id: { $in: oldest.map((item) => item._id) }
                });
            }
        }

        return res.status(201).json({ id: String(created._id) });
    } catch (e) {
        return res.status(500).json({ error: 'Failed to save history', details: e.message });
    }
});

router.delete('/history/:id', async (req, res) => {
    try {
        const identityFilter = getIdentityFilter(req);
        const id = req.params.id;
        if (!id) return res.status(400).json({ error: 'Missing history id' });

        const deleted = await RouteHistory.findOneAndDelete({
            _id: id,
            ...identityFilter
        });

        if (!deleted) return res.status(404).json({ error: 'History entry not found' });
        return res.status(200).json({ success: true });
    } catch (e) {
        return res.status(500).json({ error: 'Failed to delete history item', details: e.message });
    }
});

router.delete('/history', async (req, res) => {
    try {
        const identityFilter = getIdentityFilter(req);
        await RouteHistory.deleteMany(identityFilter);
        return res.status(200).json({ success: true });
    } catch (e) {
        return res.status(500).json({ error: 'Failed to clear history', details: e.message });
    }
});

router.post('/feedback', async (req, res) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ error: 'Login required to submit feedback' });
        }

        const rawMessage = String(req.body.message || '').trim();
        if (!rawMessage) {
            return res.status(400).json({ error: 'Feedback message cannot be empty' });
        }
        if (rawMessage.length > 2000) {
            return res.status(400).json({ error: 'Feedback message is too long' });
        }

        const saved = await Feedback.create({
            userId: req.user.id,
            userName: req.user.name || 'Unknown User',
            userEmail: req.user.email || '',
            message: rawMessage
        });

        return res.status(201).json({ id: String(saved._id), success: true });
    } catch (e) {
        return res.status(500).json({ error: 'Failed to submit feedback', details: e.message });
    }
});

router.get('/live-health', async (_req, res) => {
    try {
        const sampleCity = 'Delhi';
        const sampleTo = 'Agra';
        const point = await geocodeCity(sampleCity);
        const leg = await getLegLiveStatsUndirected(sampleCity, sampleTo);
        return res.status(200).json({
            ok: true,
            geocode: point,
            route: {
                from: sampleCity,
                to: sampleTo,
                distanceMeters: leg.distanceMeters,
                durationSeconds: leg.durationSeconds
            }
        });
    } catch (e) {
        return res.status(500).json({ ok: false, error: e.message });
    }
});

module.exports = router;
