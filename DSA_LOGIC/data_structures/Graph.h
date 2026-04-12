#ifndef GRAPH_H
#define GRAPH_H

#include <string>
#include <vector>
#include "Edge.h"

class Graph {
  private:
    std::vector<std::string> nodeNames;
    std::vector<std::vector<Edge>> adjacency;

  public:
    int findNode(const std::string& name) const {
        for (int i = 0; i < static_cast<int>(nodeNames.size()); i++) {
            if (nodeNames[i] == name) return i;
        }
        return -1;
    }

    int addNode(const std::string& name) {
        int existing = findNode(name);
        if (existing != -1) return existing;
        nodeNames.push_back(name);
        adjacency.push_back(std::vector<Edge>());
        return static_cast<int>(nodeNames.size()) - 1;
    }

    void addUndirectedEdge(const std::string& from, const std::string& to, int distance, int time, int cost) {
        int fromId = addNode(from);
        int toId = addNode(to);
        adjacency[fromId].push_back(Edge(toId, distance, time, cost));
        adjacency[toId].push_back(Edge(fromId, distance, time, cost));
    }

    const std::vector<Edge>& neighbors(int nodeId) const {
        return adjacency[nodeId];
    }

    int size() const {
        return static_cast<int>(nodeNames.size());
    }

    const std::string& nodeName(int nodeId) const {
        return nodeNames[nodeId];
    }
};

#endif
