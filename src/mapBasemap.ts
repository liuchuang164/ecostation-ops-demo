import Feature from "ol/Feature";
import GeoJSON from "ol/format/GeoJSON";
import Geometry from "ol/geom/Geometry";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import XYZ from "ol/source/XYZ";
import VectorSource from "ol/source/Vector";
import { Fill, Stroke, Style, Text } from "ol/style";
import { readVisualPalette, type ThemeId } from "./theme";

export const VIEW_PROJECTION = "EPSG:3857";
export const DATA_PROJECTION = "EPSG:4326";
export const LOCAL_BASEMAP_URL = "/maps/hangzhou-west.geojson";
export const DEFAULT_BASEMAP_URL =
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const BASEMAP_MODE =
  import.meta.env.VITE_BASEMAP_MODE === "local" ? "local" : "online";
export const BASEMAP_URL =
  import.meta.env.VITE_BASEMAP_URL || DEFAULT_BASEMAP_URL;
export const OSM_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';
export const BASEMAP_ATTRIBUTION =
  import.meta.env.VITE_BASEMAP_ATTRIBUTION || OSM_ATTRIBUTION;

function createLocalStyle() {
  const palette = readVisualPalette();
  const land = new Style({
    fill: new Fill({ color: palette.mapLand }),
    stroke: new Stroke({ color: palette.mapOutline, width: 0.5 }),
  });
  const water = new Style({
    fill: new Fill({ color: palette.mapWater }),
    stroke: new Stroke({ color: palette.mapWaterOutline, width: 1 }),
  });
  const road = new Style({
    stroke: new Stroke({ color: palette.mapRoad, width: 1.4 }),
  });
  const river = new Style({
    stroke: new Stroke({ color: palette.mapRiver, width: 1.3 }),
  });
  const boundary = new Style({
    stroke: new Stroke({
      color: palette.mapBoundary,
      width: 1,
      lineDash: [4, 4],
    }),
  });
  return function localStyle(feature: Feature<Geometry>) {
    const kind = feature.get("kind");
    if (kind === "water") return water;
    if (kind === "waterway") return river;
    if (kind === "land") return land;
    if (kind === "boundary") return boundary;
    if (kind === "place")
      return new Style({
        text: new Text({
          text: feature.get("name") || "",
          font: '12px "PingFang SC", sans-serif',
          fill: new Fill({ color: palette.mapLabel }),
          stroke: new Stroke({ color: palette.mapLabelHalo, width: 3 }),
        }),
      });
    return road;
  };
}
export function createBasemapLayers() {
  const localSource = new VectorSource<Feature<Geometry>>({
    attributions: OSM_ATTRIBUTION,
  });
  const localStyle = createLocalStyle();
  const localLayer = new VectorLayer({
    source: localSource,
    style: (feature) => localStyle(feature as Feature<Geometry>),
    declutter: true,
  });
  const onlineSource = new XYZ({
    url: BASEMAP_URL,
    projection: VIEW_PROJECTION,
    crossOrigin: "anonymous",
    attributions: BASEMAP_ATTRIBUTION,
    maxZoom: 19,
    transition: 0,
  });
  const onlineLayer = new TileLayer({
    source: onlineSource,
    opacity: 0.68,
    className: "gis-online-basemap",
    visible: BASEMAP_MODE !== "local",
  });
  const applyColors = (theme: ThemeId) => {
    const style = createLocalStyle();
    localLayer.setStyle((feature) => style(feature as Feature<Geometry>));
    onlineLayer.setOpacity(theme === "tech" ? 0.66 : 0.68);
  };
  return { localSource, localLayer, onlineSource, onlineLayer, applyColors };
}
export async function loadLocalBasemap(
  source: VectorSource<Feature<Geometry>>,
  signal: AbortSignal,
) {
  const response = await fetch(LOCAL_BASEMAP_URL, { signal });
  if (!response.ok)
    throw new Error(`本地地理底图加载失败（${response.status}）`);
  const data = await response.json();
  if (data.type !== "FeatureCollection" || !Array.isArray(data.features))
    throw new Error("本地底图格式无效");
  const features = new GeoJSON().readFeatures(data, {
    dataProjection: DATA_PROJECTION,
    featureProjection: VIEW_PROJECTION,
  }) as Feature<Geometry>[];
  source.clear();
  source.addFeatures(features);
  return features.length;
}
