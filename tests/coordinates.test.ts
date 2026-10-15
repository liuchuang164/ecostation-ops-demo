import { test } from "node:test";
import assert from "node:assert/strict";
import { initialState, metrics, transition, type State } from "../src/model.ts";
import {
  MOCK_STATION_COORDINATES,
  getInitialStationCoordinates,
  migrateStationCoordinates,
  validateStationCoordinate,
  WEB_MERCATOR_MAX_LATITUDE,
} from "../src/stationCoordinates.ts";

function previousDemoState() {
  let state = initialState();
  state = transition(state, { type: "create", id: "INC-D" });
  const old = structuredClone(state);
  for (const [index, station] of old.stations.entries()) {
    // Recreate the actual legacy format even when new initial data drops x/y.
    Object.assign(station, {
      x: [19, 49, 78, 26, 67, 84][index],
      y: [27, 22, 32, 68, 64, 78][index],
    });
    for (const key of [
      "longitude",
      "latitude",
      "coordinateSystem",
      "coordinateSource",
      "isMock",
    ])
      delete (station as unknown as Record<string, unknown>)[key];
  }
  return old;
}

test("固定模拟经纬度按稳定站点 ID 保存，顺序为经度、纬度", () => {
  for (const [id, fields] of Object.entries(MOCK_STATION_COORDINATES)) {
    const coordinate = validateStationCoordinate(fields);
    assert.equal(coordinate.valid, true, id);
    assert.deepEqual(coordinate.position, [fields.longitude, fields.latitude]);
    assert.equal(fields.isMock, true);
    assert.match(fields.coordinateSource, /固定模拟/);
  }
  assert.deepEqual(
    getInitialStationCoordinates("D"),
    MOCK_STATION_COORDINATES.D,
  );
  assert.equal(
    validateStationCoordinate(getInitialStationCoordinates("REAL-NEW")).reason,
    "坐标待补充",
  );
});

test("旧本地演示迁移仅补齐位置，任务、日志、观测与指标保持原样", () => {
  const old = previousDemoState();
  const before = structuredClone(old);
  const upgraded = migrateStationCoordinates(old);
  assert.notEqual(upgraded, old);
  assert.equal(upgraded.tasks, old.tasks);
  assert.equal(upgraded.logs, old.logs);
  assert.equal(upgraded.incidents, old.incidents);
  assert.equal(upgraded.devices, old.devices);
  assert.equal(upgraded.observations, old.observations);
  assert.equal(upgraded.series, old.series);
  assert.deepEqual(metrics(upgraded as State), metrics(old as State));
  assert.deepEqual(old, before, "迁移不得修改输入数据");
  assert.equal(upgraded.tasks.length, 1);
  assert.equal(upgraded.logs.length, 1);
  for (const station of upgraded.stations)
    assert.deepEqual(getInitialStationCoordinates(station.id), {
      longitude: station.longitude,
      latitude: station.latitude,
      coordinateSystem: station.coordinateSystem,
      coordinateSource: station.coordinateSource,
      isMock: station.isMock,
    });
  assert.equal(
    migrateStationCoordinates(upgraded),
    upgraded,
    "多次加载迁移应幂等",
  );
});

test("已有可信坐标、明确缺失、真实标识与非旧虚构站点不得被模拟数据覆盖", () => {
  const old = previousDemoState();
  const existing = {
    ...old.stations[0],
    longitude: 121.2,
    latitude: 31.3,
    coordinateSystem: "WGS84",
    coordinateSource: "现场 GNSS 核实",
    isMock: false,
  };
  const missing = {
    ...old.stations[1],
    longitude: null,
    latitude: null,
    coordinateSystem: "WGS84",
    coordinateSource: "坐标待补充",
    isMock: false,
  };
  const realWithoutCoords = { ...old.stations[2], isMock: false };
  const partial = { ...old.stations[3], longitude: 120.1 };
  const unknown = { ...old.stations[4], id: "REAL-42", name: "真实试验站" };
  const explicitUndefined = { ...old.stations[5], longitude: undefined };
  const state = {
    ...old,
    stations: [
      existing,
      missing,
      realWithoutCoords,
      partial,
      unknown,
      explicitUndefined,
    ],
  };
  const migrated = migrateStationCoordinates(state);
  assert.equal(migrated, state);
  assert.equal(validateStationCoordinate(missing).reason, "坐标待补充");
  assert.equal(
    validateStationCoordinate(realWithoutCoords).reason,
    "坐标待补充",
  );
  assert.deepEqual(validateStationCoordinate(existing).position, [121.2, 31.3]);
});

test("拒绝非有限、颠倒、米制、零点占位、未知坐标系与投影纬度范围", () => {
  const base = getInitialStationCoordinates("A");
  for (const coordinate of [
    { longitude: NaN, latitude: 30 },
    { longitude: Infinity, latitude: 30 },
    { longitude: 30.3, latitude: 120.1 },
    { longitude: 13369339, latitude: 3548273 },
    { longitude: 181, latitude: 30 },
    { longitude: 119, latitude: WEB_MERCATOR_MAX_LATITUDE + 0.01 },
    { longitude: 0, latitude: 0 },
  ])
    assert.equal(
      validateStationCoordinate({ ...base, ...coordinate }).valid,
      false,
    );
  assert.equal(
    validateStationCoordinate({ ...base, coordinateSystem: "GCJ-02" }).valid,
    false,
  );
  assert.equal(
    validateStationCoordinate({ ...base, coordinateSystem: "BD-09" }).valid,
    false,
  );
  assert.equal(
    validateStationCoordinate({ ...base, coordinateSystem: "" }).reason,
    "坐标系待确认",
  );
  assert.equal(
    validateStationCoordinate({ ...base, coordinateSystem: 4326 } as never)
      .valid,
    false,
  );
  assert.equal(
    validateStationCoordinate({ ...base, coordinateSystem: "EPSG:4326" }).valid,
    true,
  );
});
