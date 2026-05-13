const RouteData = [
  {
    "ownerType": "user",
    "ownerId": "661f1a2b3c4d5e6f7890abcd",
    "source": "Delhi",
    "destination": "Gurgaon",
    "preference": "time",
    "totalDistance": 32.5,
    "totalTime": 45,
    "totalCost": 120,
    "stops": 2,
    "path": ["Delhi", "Dhaula Kuan", "NH48", "Gurgaon"],
    "liveData": true
  },
  {
    "ownerType": "user",
    "ownerId": "661f1a2b3c4d5e6f7890abce",
    "source": "Noida",
    "destination": "Connaught Place",
    "preference": "cost",
    "totalDistance": 18,
    "totalTime": 50,
    "totalCost": 40,
    "stops": 5,
    "path": ["Noida Sector 62", "Mayur Vihar", "ITO", "CP"],
    "liveData": false
  },
  {
    "ownerType": "guest",
    "ownerId": "guest_12345",
    "source": "Dwarka",
    "destination": "IGI Airport",
    "preference": "distance",
    "totalDistance": 12,
    "totalTime": 25,
    "totalCost": 80,
    "stops": 1,
    "path": ["Dwarka", "Airport Road", "IGI Airport"],
    "liveData": true
  },
  {
    "ownerType": "guest",
    "ownerId": "guest_67890",
    "source": "Rohini",
    "destination": "Karol Bagh",
    "preference": "time",
    "totalDistance": 20,
    "totalTime": 35,
    "totalCost": 60,
    "stops": 3,
    "path": ["Rohini", "Pitampura", "Shalimar Bagh", "Karol Bagh"],
    "liveData": false
  }
]

module.exports = RouteData;