#!/usr/bin/env python3
"""Convert one-off Overpass JSON extracts into an ODbL WGS84 demo basemap.

Usage: python3 scripts/prepare-local-basemap.py roads.json water.json output.geojson
Requires only Python's standard library. No network use at application runtime.
"""
import collections
import hashlib
import json
import math
import sys
from pathlib import Path

METERS_PER_DEGREE = 111320.0
X_SCALE = METERS_PER_DEGREE * math.cos(math.radians(30.3))
TOLERANCE_METERS = 28.0
BBOX = [119.35, 30.0, 120.4, 30.6]


def distance_to_segment(point, a, b):
    px, py = point[0] * X_SCALE, point[1] * METERS_PER_DEGREE
    ax, ay = a[0] * X_SCALE, a[1] * METERS_PER_DEGREE
    bx, by = b[0] * X_SCALE, b[1] * METERS_PER_DEGREE
    dx, dy = bx - ax, by - ay
    t = max(0., min(1., ((px-ax)*dx + (py-ay)*dy) / (dx*dx+dy*dy))) if dx or dy else 0.
    return math.hypot(px - ax - t*dx, py - ay - t*dy)


def simplify(points, tolerance=TOLERANCE_METERS):
    """Iterative Douglas-Peucker; all retained vertices come from OSM geometry."""
    if len(points) <= 2:
        return points
    keep = {0, len(points)-1}
    stack = [(0, len(points)-1)]
    while stack:
        start, end = stack.pop()
        if end <= start + 1:
            continue
        furthest, index = max((distance_to_segment(points[i], points[start], points[end]), i)
                              for i in range(start+1, end))
        if furthest > tolerance:
            keep.add(index)
            stack.extend(((start, index), (index, end)))
    return [points[i] for i in sorted(keep)]


def compact(points):
    result = []
    for p in points:
        item = [round(p[0], 6), round(p[1], 6)]
        if not result or item != result[-1]:
            result.append(item)
    return result


def coords(geometry):
    return [[p['lon'], p['lat']] for p in geometry if 'lon' in p and 'lat' in p]


def stitch(lines):
    """Join OSM segments only where endpoints are exactly shared; never move them."""
    pending = {i: list(line) for i, line in enumerate(lines) if len(line) > 1}
    endpoint_map = collections.defaultdict(set)
    for i, line in pending.items():
        endpoint_map[tuple(line[0])].add(i)
        endpoint_map[tuple(line[-1])].add(i)
    result = []
    while pending:
        index = next(iter(pending))
        line = pending.pop(index)
        endpoint_map[tuple(line[0])].discard(index)
        endpoint_map[tuple(line[-1])].discard(index)
        for reverse in (False, True):
            if reverse:
                line.reverse()
            while True:
                end = tuple(line[-1])
                options = endpoint_map[end] & pending.keys()
                if len(options) != 1:
                    break
                other_index = next(iter(options))
                other = pending.pop(other_index)
                endpoint_map[tuple(other[0])].discard(other_index)
                endpoint_map[tuple(other[-1])].discard(other_index)
                if other[-1] == line[-1]:
                    other.reverse()
                line.extend(other[1:])
        result.append(line)
    return result


def point_in_ring(point, ring):
    x, y = point
    inside = False
    for a, b in zip(ring, ring[1:]):
        if (a[1] > y) != (b[1] > y) and x < (b[0]-a[0]) * (y-a[1]) / (b[1]-a[1]) + a[0]:
            inside = not inside
    return inside


def signed_area(ring):
    return sum(a[0]*b[1] - b[0]*a[1] for a,b in zip(ring,ring[1:]))/2


def ring_geometry(line, outer):
    if len(line) < 4 or line[0] != line[-1]:
        return None
    # Reduce a ring in two halves so the repeated first/last vertex is not the
    # baseline of the full algorithm. Closed rings preserve their original shape.
    middle = len(line)//2
    ring = compact(simplify(line[:middle+1], 18.0)[:-1] + simplify(line[middle:],18.0))
    if len(ring) < 4:
        return None
    if ring[0] != ring[-1]:
        ring.append(ring[0])
    if (signed_area(ring) > 0) != outer:
        ring.reverse()
    return ring


def main():
    roads_path, water_path, out_path = map(Path, sys.argv[1:])
    road_data = json.loads(roads_path.read_text())
    water_data = json.loads(water_path.read_text())
    features = []
    road_groups = collections.defaultdict(list)
    road_ids = collections.defaultdict(list)
    key_places = {'青山湖街道','余杭街道','瓶窑镇','径山镇','太湖源镇','天目山镇','高虹镇',
                  '万市镇','良渚街道','三墩镇','塘栖镇','鸬鸟镇','於潜镇','板桥镇'}
    for element in road_data['elements']:
        tags = element.get('tags',{})
        osm_id = f"{element['type']}/{element['id']}"
        name = tags.get('name:zh') or tags.get('name','')
        if element['type'] == 'node' and tags.get('place'):
            if tags['place'] == 'city' or name in key_places:
                features.append({'type':'Feature','id':osm_id,
                    'properties':{'kind':'place','name':name,'placeClass':tags['place'],
                                  'osm_id':osm_id,'source':'OpenStreetMap'},
                    'geometry':{'type':'Point','coordinates':[element['lon'],element['lat']]}})
        elif element['type'] == 'way' and element.get('geometry'):
            kind = 'road' if tags.get('highway') else 'waterway'
            category = tags.get('highway') or tags.get('waterway','river')
            key = kind, category, name, tags.get('ref','')
            line = coords(element['geometry'])
            if len(line)>1:
                road_groups[key].append(line)
                road_ids[key].append(osm_id)
    for index, (key, lines) in enumerate(road_groups.items()):
        kind, category, name, ref = key
        simplified = [compact(simplify(line)) for line in stitch(lines)]
        simplified = [line for line in simplified if len(line)>1]
        if simplified:
            features.append({'type':'Feature','id':f'{kind}-group-{index}',
                'properties':{'kind':kind,'class':category,'name':name,'ref':ref,
                              'osm_ids':road_ids[key],'source':'OpenStreetMap'},
                'geometry':{'type':'MultiLineString','coordinates':simplified}})
    incomplete_relations = []
    water_member_ids = set()
    for element in water_data['elements']:
        if element['type'] != 'relation':
            continue
        outer_lines, inner_lines = [], []
        for member in element.get('members',[]):
            if member['type'] == 'way' and member.get('geometry'):
                water_member_ids.add(member['ref'])
                (inner_lines if member.get('role') == 'inner' else outer_lines).append(coords(member['geometry']))
        outers = [r for line in stitch(outer_lines) if (r:=ring_geometry(line,True))]
        inners = [r for line in stitch(inner_lines) if (r:=ring_geometry(line,False))]
        polygons = [[outer] for outer in outers]
        for inner in inners:
            for polygon in polygons:
                if point_in_ring(inner[0],polygon[0]):
                    polygon.append(inner)
                    break
        if not polygons:
            incomplete_relations.append(element['id'])
            continue
        tags = element.get('tags',{})
        osm_id = f"relation/{element['id']}"
        features.append({'type':'Feature','id':osm_id,
            'properties':{'kind':'water','name':tags.get('name:zh') or tags.get('name',''),
                          'class':tags.get('water','water'),'osm_id':osm_id,'source':'OpenStreetMap'},
            'geometry':{'type':'MultiPolygon','coordinates':polygons}})
    for element in water_data['elements']:
        if element['type'] != 'way' or element['id'] in water_member_ids:
            continue
        ring = ring_geometry(coords(element.get('geometry',[])),True)
        if ring:
            tags = element.get('tags',{})
            osm_id = f"way/{element['id']}"
            features.append({'type':'Feature','id':osm_id,
                'properties':{'kind':'water','name':tags.get('name:zh') or tags.get('name',''),
                              'class':tags.get('water','water'),'osm_id':osm_id,'source':'OpenStreetMap'},
                'geometry':{'type':'Polygon','coordinates':[ring]}})
    metadata = {'source':'OpenStreetMap via Overpass API','sourceUrl':'https://www.openstreetmap.org/',
        'license':'ODbL-1.0','licenseUrl':'https://opendatacommons.org/licenses/odbl/1-0/',
        'attribution':'© OpenStreetMap contributors','coordinateSystem':'WGS84 / EPSG:4326',
        'coordinateOrder':'[longitude, latitude]','requestedBbox':BBOX,
        'retrievedAt':'2026-10-12','osmTimestamp':road_data['osm3s']['timestamp_osm_base'],
        'waterOsmTimestamp':water_data['osm3s']['timestamp_osm_base'],
        'simplification':'Douglas-Peucker: lines 28 m; water rings 18 m; retained original OSM vertices, rounded to 6 decimals.',
        'rawSha256':{roads_path.name:hashlib.sha256(roads_path.read_bytes()).hexdigest(),
                     water_path.name:hashlib.sha256(water_path.read_bytes()).hexdigest()},
        'omittedUnclosedWaterRelations':incomplete_relations,
        'note':'Local simplified reference basemap only; not all roads, waterways or boundaries are included.'}
    collection = {'type':'FeatureCollection','name':'hangzhou-west-osm-simplified',
                  'metadata':metadata,'features':features}
    out_path.write_text(json.dumps(collection,ensure_ascii=False,separators=(',',':'))+'\n')
    print(json.dumps({'output':str(out_path),'bytes':out_path.stat().st_size,
        'features':len(features),'kinds':collections.Counter(f['properties']['kind'] for f in features),
        'omittedUnclosedWaterRelations':incomplete_relations},ensure_ascii=False))

if __name__ == '__main__':
    main()
