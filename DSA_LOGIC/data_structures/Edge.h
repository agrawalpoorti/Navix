#ifndef EDGE_H
#define EDGE_H

#include <string>

class Edge {
  public:
    int to;
    int distance;
    int time;
    int cost;

    Edge(int toIndex, int dist, int travelTime, int travelCost)
        : to(toIndex), distance(dist), time(travelTime), cost(travelCost) {}
};

inline int getEdgeWeight(const Edge& edge, const std::string& preference) {
    if (preference == "time") return edge.time;
    if (preference == "cost") return edge.cost;
    return edge.distance;
}

#endif
