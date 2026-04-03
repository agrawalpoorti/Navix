const express = require('express');
const router  = express.Router();
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const RouteHistory = require('../models/RouteHistory');

const enginePath = '/Users/aanchalbhaskarshukla/Desktop/Navix/DSA_LOGIC/navix_engine';
const geocodeCache = new Map();

function runEngineRoute(source, destination, preference) {
    return new Promise((resolve, reject) => {
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

async function geocodeCity(city) {
    if (geocodeCache.has(city)) return geocodeCache.get(city);
    if (typeof fetch !== 'function') throw new Error('Fetch API unavailable in current Node runtime');

    const query = encodeURIComponent(cityQuery(city));
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${query}`;

    const response = await fetch(url, {
        headers: { 'User-Agent': 'Navix/1.0 (Educational Project)' }
    });

    if (!response.ok) {
        throw new Error(`Geocoding failed for ${city}: HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
        throw new Error(`No coordinates found for ${city}`);
    }

    const point = {
        lat: Number(data[0].lat),
        lon: Number(data[0].lon)
    };
    geocodeCache.set(city, point);
    return point;
}

async function getLegLiveStats(fromCity, toCity) {
    if (typeof fetch !== 'function') throw new Error('Fetch API unavailable in current Node runtime');

    const from = await geocodeCity(fromCity);
    const to = await geocodeCity(toCity);
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false&alternatives=false&steps=false`;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`OSRM failed for ${fromCity} -> ${toCity}: HTTP ${response.status}`);
    }

    const data = await response.json();
    if (data.code !== 'Ok' || !Array.isArray(data.routes) || data.routes.length === 0) {
        throw new Error(`OSRM returned no route for ${fromCity} -> ${toCity}`);
    }

    const route = data.routes[0];
    return {
        distanceMeters: Number(route.distance || 0),
        durationSeconds: Number(route.duration || 0)
    };
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

    for (let i = 0; i < pathArr.length - 1; i++) {
        const leg = await getLegLiveStats(pathArr[i], pathArr[i + 1]);
        totalDistanceMeters += leg.distanceMeters;
        totalDurationSeconds += leg.durationSeconds;
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
        liveData: true,
        liveSource: 'nominatim+osrm'
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

module.exports = router;
