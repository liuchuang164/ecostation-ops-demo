/** Coordinates are stored in geographic degrees. Projection happens in the map only. */
export interface CoordinateFields {
  longitude: number | null;
  latitude: number | null;
  coordinateSystem: string;
  coordinateSource: string;
  isMock: boolean;
}

const MOCK_SOURCE = "固定模拟经纬度（杭州西部演示范围，非实际部署站址）";
const mock = (
  longitude: number,
  latitude: number,
): Readonly<CoordinateFields> =>
  Object.freeze({
    longitude,
    latitude,
    coordinateSystem: "WGS84",
    coordinateSource: MOCK_SOURCE,
    isMock: true,
  });

/** Stable IDs are the same as the business data. Never use a display order as identity. */
export const MOCK_STATION_COORDINATES: Readonly<
  Record<string, Readonly<CoordinateFields>>
> = Object.freeze({
  A: mock(119.72, 30.34),
  B: mock(119.91, 30.405),
  C: mock(120.025, 30.355),
  D: mock(120.06, 30.275),
  E: mock(119.885, 30.225),
  F: mock(120.155, 30.285),
});

/** Only use this when constructing the known fictional initial demo stations. */
export function getInitialStationCoordinates(id: string): CoordinateFields {
  const known = MOCK_STATION_COORDINATES[id];
  return known
    ? { ...known }
    : {
        longitude: null,
        latitude: null,
        coordinateSystem: "",
        coordinateSource: "坐标待补充",
        isMock: false,
      };
}

const legacyEcology: Record<string, string> = {
  A: "森林观测",
  B: "草地观测",
  C: "农田观测",
  D: "湿地观测",
  E: "灌丛观测",
  F: "城市生态观测",
};
const coordinateKeys: (keyof CoordinateFields)[] = [
  "longitude",
  "latitude",
  "coordinateSystem",
  "coordinateSource",
  "isMock",
];

interface MigratableStation {
  id: string;
  name: string;
  eco: string;
  x?: number;
  y?: number;
  longitude?: number | null;
  latitude?: number | null;
  coordinateSystem?: string;
  coordinateSource?: string;
  isMock?: boolean;
}

/**
 * Upgrade the previous fictional A–F demo format without touching business entities.
 * An explicit null, real-data flag, partial coordinates, or other metadata is respected.
 */
export function migrateStationCoordinates<
  T extends { stations: MigratableStation[] },
>(state: T): T {
  let changed = false;
  const stations = state.stations.map((station) => {
    const isKnownLegacyDemo =
      Object.hasOwn(legacyEcology, station.id) &&
      station.name === `站点${station.id}` &&
      station.eco === legacyEcology[station.id] &&
      typeof station.x === "number" &&
      Number.isFinite(station.x) &&
      typeof station.y === "number" &&
      Number.isFinite(station.y) &&
      !coordinateKeys.some((key) => Object.hasOwn(station, key));
    if (!isKnownLegacyDemo) return station;
    changed = true;
    return { ...station, ...getInitialStationCoordinates(station.id) };
  });
  return changed ? { ...state, stations } : state;
}

export type CoordinateValidation =
  | { valid: true; position: [number, number]; reason: null }
  | { valid: false; position: null; reason: string };

export const WEB_MERCATOR_MAX_LATITUDE = 85.0511287798066;

/** Validate before projection; [longitude, latitude] is also GeoJSON's axis order. */
export function validateStationCoordinate(
  station: Partial<CoordinateFields>,
): CoordinateValidation {
  const { longitude, latitude } = station;
  const invalid = (reason: string): CoordinateValidation => ({
    valid: false,
    position: null,
    reason,
  });
  if (
    longitude === null ||
    longitude === undefined ||
    latitude === null ||
    latitude === undefined
  )
    return invalid("坐标待补充");
  if (
    typeof longitude !== "number" ||
    typeof latitude !== "number" ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude)
  )
    return invalid("经纬度必须为有限数值");
  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90)
    return invalid("经纬度超出地理范围，请核对经纬度顺序与单位");
  if (Math.abs(latitude) > WEB_MERCATOR_MAX_LATITUDE)
    return invalid("纬度超出二维地图的 Web Mercator 可显示范围");
  if (longitude === 0 && latitude === 0)
    return invalid("零点占位坐标不可用，请补充核实后的站址");
  if (
    station.coordinateSystem !== undefined &&
    station.coordinateSystem !== null &&
    typeof station.coordinateSystem !== "string"
  )
    return invalid("坐标系无效，请核实并转换为 WGS84");
  const coordinateSystem = station.coordinateSystem?.trim().toUpperCase();
  if (coordinateSystem !== "WGS84" && coordinateSystem !== "EPSG:4326")
    return invalid(
      coordinateSystem
        ? `暂不支持 ${station.coordinateSystem} 坐标，请核实并转换为 WGS84`
        : "坐标系待确认",
    );
  return { valid: true, position: [longitude, latitude], reason: null };
}
