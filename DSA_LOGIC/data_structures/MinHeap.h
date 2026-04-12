#ifndef MIN_HEAP_H
#define MIN_HEAP_H

#include <vector>

struct HeapNode {
    int distance;
    int nodeId;
};

class MinHeap {
  private:
    std::vector<HeapNode> data;

    void heapifyUp(int index) {
        while (index > 0) {
            int parent = (index - 1) / 2;
            if (data[parent].distance <= data[index].distance) break;
            swapNodes(parent, index);
            index = parent;
        }
    }

    void heapifyDown(int index) {
        const int size = static_cast<int>(data.size());
        while (true) {
            int smallest = index;
            int left = (2 * index) + 1;
            int right = (2 * index) + 2;

            if (left < size && data[left].distance < data[smallest].distance) {
                smallest = left;
            }
            if (right < size && data[right].distance < data[smallest].distance) {
                smallest = right;
            }
            if (smallest == index) break;
            swapNodes(index, smallest);
            index = smallest;
        }
    }

    void swapNodes(int i, int j) {
        HeapNode temp = data[i];
        data[i] = data[j];
        data[j] = temp;
    }

  public:
    bool empty() const {
        return data.empty();
    }

    void push(const HeapNode& node) {
        data.push_back(node);
        heapifyUp(static_cast<int>(data.size()) - 1);
    }

    HeapNode top() const {
        return data[0];
    }

    void pop() {
        if (data.empty()) return;
        data[0] = data.back();
        data.pop_back();
        if (!data.empty()) {
            heapifyDown(0);
        }
    }
};

#endif
