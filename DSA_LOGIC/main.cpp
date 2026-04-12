#include <iostream>
#include <fstream>
#include <vector>
#include <climits>
#include <string>
#include "data_structures/Graph.h"
#include "data_structures/MinHeap.h"

using namespace std;

bool loadGraphFromFile(Graph& graph) {
    ifstream file("DSA_LOGIC/location_data.txt");
    if (!file.is_open()) {
        file.open("../DSA_LOGIC/location_data.txt");
    }
    if (!file.is_open()) {
        file.open("/Users/aanchalbhaskarshukla/Desktop/Navix/DSA_LOGIC/location_data.txt");
    }
    if (!file.is_open()) {
        return false;
    }

    string from, to;
    int distance = 0;
    int time = 0;
    int cost = 0;

    while (file >> from >> to >> distance >> time >> cost) {
        graph.addUndirectedEdge(from, to, distance, time, cost);
    }
    file.close();
    return true;
}

void printNoPath() {
    cout << "NO_PATH" << endl;
}

void printRouteAsJson(
    const vector<string>& path,
    int totalDistance,
    int totalTime,
    int totalCost
) {
    cout << "{" << endl;
    cout << "  \"path\": [";
    for (int i = 0; i < static_cast<int>(path.size()); i++) {
        cout << "\"" << path[i] << "\"";
        if (i != static_cast<int>(path.size()) - 1) cout << ", ";
    }
    cout << "]," << endl;
    cout << "  \"totalDistance\": " << totalDistance << "," << endl;
    cout << "  \"totalTime\": " << totalTime << "," << endl;
    cout << "  \"totalCost\": " << totalCost << "," << endl;
    cout << "  \"stops\": " << static_cast<int>(path.size()) - 2 << endl;
    cout << "}" << endl;
}

void dijkstra(const Graph& graph, int startId, int endId, const string& preference) {
    const int n = graph.size();
    vector<int> dist(n, INT_MAX);
    vector<int> parent(n, -1);

    dist[startId] = 0;
    MinHeap heap;
    heap.push({0, startId});

    while (!heap.empty()) {
        HeapNode current = heap.top();
        heap.pop();

        if (current.distance > dist[current.nodeId]) continue;
        if (current.nodeId == endId) break;

        const vector<Edge>& neighbors = graph.neighbors(current.nodeId);
        for (int i = 0; i < static_cast<int>(neighbors.size()); i++) {
            const Edge& edge = neighbors[i];
            int weight = getEdgeWeight(edge, preference);
            if (dist[current.nodeId] == INT_MAX) continue;

            int candidate = dist[current.nodeId] + weight;
            if (candidate < dist[edge.to]) {
                dist[edge.to] = candidate;
                parent[edge.to] = current.nodeId;
                heap.push({candidate, edge.to});
            }
        }
    }

    if (dist[endId] == INT_MAX) {
        printNoPath();
        return;
    }

    vector<int> pathIds;
    int cursor = endId;
    while (cursor != -1) {
        pathIds.push_back(cursor);
        cursor = parent[cursor];
    }

    int left = 0;
    int right = static_cast<int>(pathIds.size()) - 1;
    while (left < right) {
        int temp = pathIds[left];
        pathIds[left] = pathIds[right];
        pathIds[right] = temp;
        left++;
        right--;
    }

    vector<string> path;
    for (int i = 0; i < static_cast<int>(pathIds.size()); i++) {
        path.push_back(graph.nodeName(pathIds[i]));
    }

    int totalDistance = 0;
    int totalTime = 0;
    int totalCost = 0;

    for (int i = 0; i < static_cast<int>(pathIds.size()) - 1; i++) {
        int fromId = pathIds[i];
        int toId = pathIds[i + 1];
        const vector<Edge>& neighbors = graph.neighbors(fromId);
        for (int j = 0; j < static_cast<int>(neighbors.size()); j++) {
            const Edge& edge = neighbors[j];
            if (edge.to == toId) {
                totalDistance += edge.distance;
                totalTime += edge.time;
                totalCost += edge.cost;
                break;
            }
        }
    }

    printRouteAsJson(path, totalDistance, totalTime, totalCost);
}

int main() {
    Graph graph;
    if (!loadGraphFromFile(graph)) {
        cerr << "Error: Could not open location_data.txt" << endl;
        return 1;
    }

    string source;
    string destination;
    string preference;

    if (!(cin >> source >> destination >> preference)) {
        cerr << "Error: expected input format -> <source> <destination> <preference>" << endl;
        return 1;
    }

    if (preference != "distance" && preference != "time" && preference != "cost") {
        cerr << "Error: preference must be distance, time, or cost" << endl;
        return 1;
    }

    int sourceId = graph.findNode(source);
    int destinationId = graph.findNode(destination);

    if (sourceId == -1 || destinationId == -1) {
        printNoPath();
        return 0;
    }

    dijkstra(graph, sourceId, destinationId, preference);
    return 0;
}
