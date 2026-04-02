#include<iostream>
using namespace std;
#include<map>
#include<vector>
#include<fstream>
#include<climits>


class min_heap{
  public: 
  vector<pair<int,string>>h;
  int idx = 0;
  void heapify_upward(int i){
    while(i>0 && h[(i-1)/2].first>h[i].first){
      swap((h[(i-1)/2]),(h[i]));
      i = (i-1)/2;
    }
  }

  void heapify_downward(int i){
    int smallest = i;
    int left = 2*i+1;
    int right = 2*i+2;
    if(left<idx && h[left].first<h[smallest].first){
      smallest = left;
    }
    if(right<idx && h[right].first<h[smallest].first){
      smallest = right;
    }
    if(smallest!=i){
      swap((h[smallest]),(h[i]));
      heapify_downward(smallest);
    }
  }
  void insert(pair<int,string>value){
    h.push_back(value);
    int i = idx;
    idx++;
    heapify_upward(i);
  }
  void delete_root(){
    swap(h[0],h[idx-1]);
    h.pop_back();
    idx--;
    heapify_downward(0);
  }
};

class edge{
  public: 
      string destination;
      int distance;
      int time;
      int cost;
      edge(string dest,int dist,int t,int c){
        destination = dest;
        distance = dist;
        time = t;
        cost = c;
  }
};

void dijakstra(string start,string end,string pref,map<string,vector<edge>>source){
  map<string,int>p;
  for(auto &i: source){
    p[i.first] = INT_MAX;
  }
  p[start] = 0;
  map<string,int>parent;

}



int main(){
 map<string, vector<edge>>source;
 ifstream file("location_data.txt");
 string src,dest;
 int dist,t,c;
 while(file>>src>>dest>>dist>>t>>c){
  source[src].push_back({dest,dist,t,c});
 }
 file.close();
 string start;
 string end;
 string pref;
 cin>>start;
 cin>>end;
 cin>>pref;

  return 0;
}