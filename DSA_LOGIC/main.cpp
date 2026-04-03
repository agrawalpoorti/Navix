#include<iostream>
#include<map>
#include<vector>
#include<fstream>
#include<climits>
using namespace std;

class min_heap {
  public:
    vector<pair<int,string>> h;
    int idx = 0;

    void heapify_upward(int i) {
        while(i > 0 && h[(i-1)/2].first > h[i].first) {
            swap(h[(i-1)/2], h[i]);
            i = (i-1)/2;
        }
    }

    void heapify_downward(int i) {
        int smallest = i;
        int left  = 2*i+1;
        int right = 2*i+2;
        if(left  < idx && h[left].first  < h[smallest].first) smallest = left;
        if(right < idx && h[right].first < h[smallest].first) smallest = right;
        if(smallest != i) {
            swap(h[smallest], h[i]);
            heapify_downward(smallest);
        }
    }

    void insert(pair<int,string> value) {
        h.push_back(value);
        int i = idx;
        idx++;
        heapify_upward(i);
    }

    pair<int,string> get_min() {
        return h[0];
    }

    void delete_root() {
        swap(h[0], h[idx-1]);
        h.pop_back();
        idx--;
        if(idx > 0) heapify_downward(0);
    }

    bool empty() {
        return idx == 0;
    }
};

class edge {
  public:
    string destination;
    int distance;
    int time;
    int cost;

    edge(string dest, int dist, int t, int c) {
        destination = dest;
        distance    = dist;
        time        = t;
        cost        = c;
    }
};

// ---- Helper: get weight based on preference ----
int get_weight(const edge& e, const string& pref) {
    if(pref == "time")     return e.time;
    if(pref == "cost")     return e.cost;
    return e.distance;  // default = distance
}

// ---- Dijkstra's Algorithm ----
void dijkstra(string start, string end, string pref, map<string, vector<edge>>& graph) {

    // Step 1 — Initialize all distances to infinity
    map<string, int>    dist;
    map<string, string> parent;

    for(auto& i : graph) {
        dist[i.first]   = INT_MAX;
        parent[i.first] = "";
    }

    // Step 2 — Distance to source is 0
    dist[start] = 0;

    // Step 3 — Insert source into min heap
    min_heap pq;
    pq.insert({0, start});

    // Step 4 — Process nodes
    while(!pq.empty()) {
        auto [d, u] = pq.get_min();
        pq.delete_root();

        // Skip if we already found a better path
        if(d > dist[u]) continue;

        // If we reached the destination, stop early
        if(u == end) break;

        // Step 5 — Relax all neighbors
        for(auto& e : graph[u]) {
            int weight     = get_weight(e, pref);
            string neighbor = e.destination;

            // If graph has a node not yet in dist, initialize it
            if(dist.find(neighbor) == dist.end()) {
                dist[neighbor]   = INT_MAX;
                parent[neighbor] = "";
            }

            if(dist[u] != INT_MAX && dist[u] + weight < dist[neighbor]) {
                dist[neighbor]   = dist[u] + weight;
                parent[neighbor] = u;
                pq.insert({dist[neighbor], neighbor});
            }
        }
    }

    // Step 6 — Check if destination is reachable
    if(dist[end] == INT_MAX) {
        cout << "NO_PATH" << endl;
        return;
    }

    // Step 7 — Reconstruct path using parent map
    vector<string> path;
    string current = end;

    while(current != "") {
        path.push_back(current);
        current = parent[current];
    }
    reverse(path.begin(), path.end());

    // Step 8 — Output as JSON for Node.js to parse
    // Calculate all three totals along the path
    int totalDistance = 0, totalTime = 0, totalCost = 0;

    for(int i = 0; i < (int)path.size() - 1; i++) {
        string from = path[i];
        string to   = path[i+1];
        for(auto& e : graph[from]) {
            if(e.destination == to) {
                totalDistance += e.distance;
                totalTime     += e.time;
                totalCost     += e.cost;
                break;
            }
        }
    }

    // Step 9 — Print JSON
    cout << "{" << endl;
    cout << "  \"path\": [";
    for(int i = 0; i < (int)path.size(); i++) {
        cout << "\"" << path[i] << "\"";
        if(i != (int)path.size()-1) cout << ", ";
    }
    cout << "]," << endl;
    cout << "  \"totalDistance\": " << totalDistance << "," << endl;
    cout << "  \"totalTime\": "     << totalTime     << "," << endl;
    cout << "  \"totalCost\": "     << totalCost     << "," << endl;
    cout << "  \"stops\": "         << (int)path.size() - 2 << endl;
    cout << "}" << endl;
}

int main() {
    // Step 1 — Load graph from file
    map<string, vector<edge>> graph;
    ifstream file("/Users/aanchalbhaskarshukla/Desktop/NAVIX/DSA_LOGIC/location_data.txt");

    if(!file.is_open()) {
        cerr << "Error: Could not open location_data.txt" << endl;
        return 1;
    }

    string src, dest;
    int dist, t, c;

    while(file >> src >> dest >> dist >> t >> c) {
        graph[src].push_back(edge(dest, dist, t, c));
        graph[dest].push_back(edge(src, dist, t, c)); // undirected graph
    }
    file.close();

    // Step 2 — Take input (from CLI args or cin)
    string start, end, pref;

    // If called from Node.js with arguments: ./navix_engine Delhi Mumbai distance
    if(false) {
        // placeholder — see below for CLI args version
    }

    cin >> start >> end >> pref;

    // Step 3 — Validate preference input
    if(pref != "distance" && pref != "time" && pref != "cost") {
        cerr << "Error: preference must be distance, time, or cost" << endl;
        return 1;
    }

    // Step 4 — Validate source and destination exist in graph
    if(graph.find(start) == graph.end()) {
        cout << "NO_PATH" << endl;
        return 0;
    }
    if(graph.find(end) == graph.end()) {
        cout << "NO_PATH" << endl;
        return 0;
    }

    // Step 5 — Run Dijkstra
    dijkstra(start, end, pref, graph);

    return 0;
}