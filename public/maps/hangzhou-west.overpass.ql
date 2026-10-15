// OpenStreetMap source extract for local simplified reference basemap.
// WGS84 bbox: south 30.0, west 119.35, north 30.6, east 120.4.
// Retrieved with two sequential requests (lines/places, then water).
// This application DOES NOT query Overpass at runtime.
[out:json][timeout:30];
(
  way["highway"~"^(motorway|trunk|primary)$"](30.0,119.35,30.6,120.4);
  way["waterway"="river"](30.0,119.35,30.6,120.4);
  node["place"~"^(city|town|suburb)$"](30.0,119.35,30.6,120.4);
);
out body geom;

// Separate second request (do not run directly with both out blocks combined):
// [out:json][timeout:30];
// (
//   way["natural"="water"]["name"](30.0,119.35,30.6,120.4);
//   relation["natural"="water"]["name"](30.0,119.35,30.6,120.4);
// );
// out body geom;
