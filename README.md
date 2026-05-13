# Navix - Smart Travel Route Planner

Navix is a full-stack travel route planning project that combines:
- A C++ Dijkstra engine (custom data structures)
- A Node.js + Express backend
- EJS frontend pages with route graph + map visualization
- MongoDB storage for users, route history, and feedback

It computes the optimal route between two cities using graph algorithms, supports preference-based optimization (`distance`, `time`, `cost`), and also shows alternative paths for comparison.

## What This Project Does

- Finds the **most optimal path** using Dijkstra's algorithm from the C++ engine
- Supports optimization by:
  - distance
  - time
  - cost
- Shows **other possible paths** (alternatives) on result page
- Renders:
  - graph visualization (vis-network)
  - geographic map route (Leaflet + OpenStreetMap)
- Uses live enrichment APIs (OSRM + geocoding) with fallback strategy
- Stores route history (read-only, delete allowed)
- Supports guest and logged-in user identities
- Supports signup/login/logout with JWT cookie auth
- Accepts logged-in user feedback and stores it in MongoDB

## Tech Stack

- Frontend: EJS, CSS, client-side JavaScript
- Backend: Node.js, Express
- Database: MongoDB + Mongoose
- Auth: JWT (cookie-based), bcryptjs
- Algorithm engine: C++ (custom Graph, Edge, MinHeap)
- Visualization: Leaflet, vis-network
- External APIs:
  - OpenStreetMap Nominatim (geocoding)
  - Open-Meteo geocoding fallback
  - OSRM routing services

## Repository Structure

```text
.
|-- DSA_LOGIC/
|   |-- main.cpp
|   |-- location_data.txt
|   |-- navix_engine               # compiled binary consumed by backend
|   `-- data_structures/
|       |-- Edge.h
|       |-- Graph.h
|       `-- MinHeap.h
|-- Navix/
|   |-- app.js                     # Express app entry
|   |-- routes/
|   |   |-- api.js
|   |   `-- auth.js
|   |-- models/
|   |   |-- User.js
|   |   |-- RouteHistory.js
|   |   `-- Feedback.js
|   |-- views/
|   |   |-- layouts/
|   |   |-- includes/
|   |   `-- parts/
|   |-- public/
|   |   |-- css/style.css
|   |   `-- images_videos/
|   `-- package.json
`-- README.md
```

## How Routing Works (End-to-End)

1. User selects source, destination, preference on `/plan`.
2. Frontend calls `POST /api/route-live`.
3. Backend runs C++ `navix_engine` with stdin input: source, destination, preference.
4. C++ returns JSON route from Dijkstra.
5. Backend attempts live enrichment (OSRM + geocoding):
   - if successful, returns live totals
   - if partial failures, falls back on static edge values for affected legs
6. Frontend saves result to sessionStorage and redirects to `/result`.
7. Result page renders:
   - primary optimal path (Dijkstra)
   - alternative paths (client-side DFS on graph metadata)
   - graph edges with different colors for optimal vs alternatives
   - map polylines with different colors for optimal vs alternatives

## DSA Engine Details

The C++ engine in `DSA_LOGIC/main.cpp`:
- Loads graph from `location_data.txt`
- Builds undirected weighted graph
- Uses custom `MinHeap` + `Graph` + `Edge` (no STL priority_queue)
- Runs Dijkstra based on selected preference weight
- Emits JSON output:

```json
{
  "path": ["CityA", "CityB", "CityC"],
  "totalDistance": 123,
  "totalTime": 150,
  "totalCost": 240,
  "stops": 1
}
```

If no route exists, output is:

```text
NO_PATH
```

## Data Format (`location_data.txt`)

Each line must be:

```text
FromCity ToCity DistanceKm TimeMin CostUnits
```

Example:

```text
Delhi Gurgaon 30 40 60
Delhi Noida 25 35 50
```

## Setup (Local)

### 1) Prerequisites

- Node.js 18+
- npm
- MongoDB running locally (`mongodb://127.0.0.1:27017`)
- g++ (to build C++ engine if needed)

### 2) Install dependencies

```bash
cd Navix
npm install
```

### 3) Build C++ engine (if binary missing/outdated)

From repository root:

```bash
g++ -std=c++17 -O2 DSA_LOGIC/main.cpp -o DSA_LOGIC/navix_engine
```

### 4) Configure environment

Create `Navix/.env`:

```env
MONGO_URI=mongodb://127.0.0.1:27017/navix
JWT_SECRET=your_secure_secret_here
ENGINE_PATH=/absolute/path/to/DSA_LOGIC/navix_engine
HTTP_TIMEOUT_MS=12000
HTTP_RETRY_COUNT=3
APP_USER_AGENT=Navix/1.0 (Educational Project)
CONTACT_EMAIL=your_email@example.com
# optional
# OSRM_BASE_URL=https://router.project-osrm.org
```

### 5) Run server

```bash
cd Navix
npm start
```

App runs at:

```text
http://localhost:8080
```

You can also run from the repository root:

```bash
npm start
```

## Deployment

This project is prepared for Node.js hosting platforms such as Render, Railway, Fly.io, or any server that can run npm scripts.

### Required environment variables

Use `Navix/.env.example` as the template. In production, set at least:

```env
NODE_ENV=production
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_long_random_secret
CONTACT_EMAIL=your_email@example.com
APP_USER_AGENT=Navix/1.0 (your_email@example.com)
```

The app reads the platform-provided `PORT` automatically. Do not commit real secrets.

### Build and start commands

From the repository root:

```bash
npm install
npm run build
npm start
```

The build command installs the nested Express app dependencies and compiles the C++ routing engine. If the native engine is unavailable, the backend still keeps route planning available through the JavaScript fallback.

### Render

`render.yaml` is included for blueprint deployment:

- Build command: `npm install && npm run build`
- Start command: `npm start`
- Health check path: `/health`

Set `MONGO_URI`, `JWT_SECRET`, and `CONTACT_EMAIL` in the Render dashboard before deploying.

## API Summary

### Routing

- `POST /api/route`
  - Base route from C++ engine only
- `POST /api/route-live`
  - Base route + live enrichment (with fallback)
- `GET /api/graph-meta`
  - Returns cities and edges from `location_data.txt`

### Map/Live helpers

- `POST /api/geocode-batch`
  - Batch geocode city names
- `GET /api/live-health`
  - Quick local live API health check

### History

- `GET /api/history`
- `POST /api/history`
- `DELETE /api/history/:id`
- `DELETE /api/history`

### Feedback

- `POST /api/feedback` (login required)

### Auth

- `POST /auth/signup`
- `POST /auth/login`
- `POST /auth/logout`

## Authentication and Identity Model

- Guests receive a `guestId` cookie.
- Logged-in users receive `authToken` JWT cookie.
- History entries are stored with:
  - `ownerType`: `guest` or `user`
  - `ownerId`: guestId or userId
- On login/signup, guest history is migrated to the authenticated user.

## Result Visualization

On `/result` page:
- Optimal path from Dijkstra is highlighted
- Alternative routes are listed in a separate section
- Graph edges:
  - optimal edges: strong highlight
  - alternative edges: separate dashed color
- Map lines:
  - optimal route: dominant line
  - alternative routes: different dashed colors

## Database Collections

- `users`
- `routehistories`
- `feedbacks`

## Troubleshooting

### MongoDB connection error

If you see `ECONNREFUSED 127.0.0.1:27017`, ensure MongoDB service is running.

### Engine binary not found

Set `ENGINE_PATH` correctly in `.env` or rebuild `DSA_LOGIC/navix_engine`.

### Live enrichment failed

Use:

```text
GET /api/live-health
```

If this fails, check internet connectivity and API limits.

### Map unavailable: failed to fetch

This project uses backend batch geocoding (`/api/geocode-batch`) with client fallback; restart server and hard refresh browser.

## Current Notes

- `User` schema currently stores both `passwordHash` and `password`; storing raw password is not recommended.

## Team

- Aanchal Bhaskar Shukla
- Poorti Agrawal
- Anshima Kushwaha
- Ishita Kulshreshtha

