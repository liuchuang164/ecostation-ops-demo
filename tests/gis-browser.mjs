import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { initialState, transition } from "../src/model.ts";
const url = process.env.DEMO_URL || "http://127.0.0.1:5173";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const scriptErrors = [];
page.on("pageerror", (error) => scriptErrors.push(error.message));
const before = transition(initialState(), { type: "create", id: "INC-D" });
for (const [index, station] of before.stations.entries()) {
  for (const key of [
    "longitude",
    "latitude",
    "coordinateSystem",
    "coordinateSource",
    "isMock",
  ])
    delete station[key];
  station.x = [19, 49, 78, 26, 67, 84][index];
  station.y = [27, 22, 32, 68, 64, 78][index];
}
await page.addInitScript((saved) => {
  if (!localStorage.getItem("gis-test-seeded")) {
    localStorage.setItem("ecostation-demo-v1", JSON.stringify(saved));
    localStorage.setItem("gis-test-seeded", "yes");
  }
}, before);
await page.goto(url);
await page.getByRole("heading", { name: "站点分布与运行状态" }).waitFor();
await page.waitForFunction(
  () =>
    document
      .querySelector(".gis-map-target")
      ?.__ecostationMap?.get("stationSource")
      ?.getFeatures().length === 6,
);
await page.waitForFunction(() => {
  const map = document.querySelector(".gis-map-target").__ecostationMap;
  return map.getLayers().item(0).getSource().getFeatures().length > 100;
});
// Allow the online source to succeed or explicitly fall back.
await page.waitForFunction(() => !document.querySelector(".gis-loading"), {
  timeout: 20000,
});
const migrated = await page.evaluate(() =>
  JSON.parse(localStorage.getItem("ecostation-demo-v1")),
);
assert.deepEqual(migrated.tasks, before.tasks);
assert.deepEqual(migrated.logs, before.logs);
assert.deepEqual(migrated.incidents, before.incidents);
assert.equal(migrated.stations[0].isMock, true);
const coordinates = await page.evaluate(() =>
  document
    .querySelector(".gis-map-target")
    .__ecostationMap.get("stationSource")
    .getFeatures()
    .map((feature) => ({
      id: feature.getId(),
      coordinate: feature.getGeometry().getCoordinates(),
    }))
    .sort((a, b) => a.id.localeCompare(b.id)),
);
for (const feature of coordinates) {
  const station = migrated.stations.find((s) => s.id === feature.id);
  const expected = [
    ((station.longitude * Math.PI) / 180) * 6378137,
    Math.log(Math.tan(Math.PI / 4 + (station.latitude * Math.PI) / 360)) *
      6378137,
  ];
  assert(
    Math.hypot(
      feature.coordinate[0] - expected[0],
      feature.coordinate[1] - expected[1],
    ) < 0.001,
  );
}
await page.screenshot({ path: "screenshots/gis-home.png", fullPage: true });
await page.locator(".station").filter({ hasText: "站点D" }).click();
await page.waitForFunction(() =>
  document.querySelector(".gis-popup h4")?.textContent.includes("站点D"),
);
assert.match(await page.locator(".summarytitle").innerText(), /站点D/);
assert.match(await page.locator(".gis-popup-status").innerText(), /需要关注/);
const dStyle = await page.evaluate(() => {
  const map = document.querySelector(".gis-map-target").__ecostationMap;
  const layer = map.getLayers().item(2);
  const feature = map.get("stationSource").getFeatureById("D");
  const styles = layer.getStyleFunction()(
    feature,
    map.getView().getResolution(),
  );
  return styles.map((style) => ({
    fill: style.getImage()?.getFill()?.getColor(),
    stroke: style.getImage()?.getStroke()?.getColor(),
  }));
});
assert.equal(dStyle[0].stroke, "#1677ff");
assert.equal(dStyle[0].fill, "#ed8b2c");
const engineIdentity = await page.evaluate(() => {
  const map = document.querySelector(".gis-map-target").__ecostationMap;
  map.set("qaIdentity", "stable-instance");
  return map.getView().getCenter();
});
// Viewport operations change pixels, never the stored feature coordinate.
const viewport = page.locator(".gis-map-target");
const box = await viewport.boundingBox();
await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.8);
await page.mouse.down();
await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.7, {
  steps: 12,
});
await page.mouse.up();
await page.getByRole("button", { name: "地图放大一级" }).click();
await page.getByRole("button", { name: "地图缩小一级" }).click();
await page.getByRole("button", { name: "放大站点地图" }).click();
await page.getByRole("dialog", { name: "站点地图全屏展示" }).waitFor();
await page.screenshot({
  path: "screenshots/gis-fullscreen.png",
  fullPage: true,
});
await page
  .getByRole("button", { name: "縮小并返回总览".replace("縮", "缩") })
  .click();
assert.equal(
  await page.evaluate(() =>
    document.querySelector(".gis-map-target").__ecostationMap.get("qaIdentity"),
  ),
  "stable-instance",
);
const layouts = [];
for (const [width, height] of [
  [1920, 1080],
  [2560, 1440],
  [3840, 2160],
  [1366, 768],
]) {
  await page.setViewportSize({ width, height });
  await page.screenshot({
    path: `screenshots/gis-home-${width}.png`,
    fullPage: true,
  });
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }));
  assert(dimensions.width <= width);
  if (width >= 1920) assert(dimensions.height <= height);
  layouts.push({ viewport: [width, height], document: dimensions });
}
const afterCoordinates = await page.evaluate(() =>
  document
    .querySelector(".gis-map-target")
    .__ecostationMap.get("stationSource")
    .getFeatures()
    .map((feature) => ({
      id: feature.getId(),
      coordinate: feature.getGeometry().getCoordinates(),
    }))
    .sort((a, b) => a.id.localeCompare(b.id)),
);
assert.deepEqual(afterCoordinates, coordinates);
await page.setViewportSize({ width: 1920, height: 1080 });
await page.getByRole("button", { name: "正常", exact: true }).click();
await page.waitForFunction(
  () =>
    document
      .querySelector(".gis-map-target")
      .__ecostationMap.get("stationSource")
      .getFeatures().length === 3,
);
assert.match(
  await page.locator(".gis-selection-notice").innerText(),
  /站点D已被筛选隐藏/,
);
assert.equal(await page.locator(".gis-popup").count(), 0);
assert.match(await page.locator(".summarytitle").innerText(), /站点D/);
await page.getByLabel("搜索站点").fill("不存在的站点");
await page.waitForFunction(
  () =>
    document
      .querySelector(".gis-map-target")
      .__ecostationMap.get("stationSource")
      .getFeatures().length === 0,
);
assert.match(await page.locator(".gis-empty").innerText(), /没有符合/);
await page.getByLabel("搜索站点").fill("");
await page.getByRole("button", { name: "全部", exact: true }).click();
await page.getByRole("button", { name: "查看全部站点", exact: true }).click();
// Click an actual projected point through map hit detection.
await page.waitForTimeout(500);
const ePixel = await page.evaluate(() => {
  const target = document.querySelector(".gis-map-target");
  const map = target.__ecostationMap;
  const pixel = map.getPixelFromCoordinate(
    map.get("stationSource").getFeatureById("E").getGeometry().getCoordinates(),
  );
  const box = target.getBoundingClientRect();
  return { x: box.x + pixel[0], y: box.y + pixel[1] };
});
await page.mouse.click(ePixel.x, ePixel.y);
await page.waitForFunction(() =>
  document.querySelector(".gis-popup h4")?.textContent.includes("站点E"),
);
assert.match(await page.locator(".station.selected").innerText(), /站点E/);
assert.match(await page.locator(".summarytitle").innerText(), /站点E/);
await page.getByRole("button", { name: "查看站点详情", exact: true }).click();
assert.equal(await page.locator(".gis-popup").count(), 0);
// State refresh does not reset a user-adjusted map view.
await page.evaluate(() => {
  const map = document.querySelector(".gis-map-target").__ecostationMap;
  map.getView().cancelAnimations();
  map.getView().setCenter([13350000, 3550000]);
  map.getView().setZoom(9);
});
const manualView = await page.evaluate(() =>
  document
    .querySelector(".gis-map-target")
    .__ecostationMap.getView()
    .getCenter(),
);
await page.getByRole("button", { name: "导出记录", exact: true }).click();
assert.deepEqual(
  await page.evaluate(() =>
    document
      .querySelector(".gis-map-target")
      .__ecostationMap.getView()
      .getCenter(),
  ),
  manualView,
);
// Missing/unsupported real coordinates remain listed, without a fictitious point.
await page.evaluate(() => {
  const state = JSON.parse(localStorage.getItem("ecostation-demo-v1"));
  state.stations.find((s) => s.id === "A").longitude = null;
  state.stations.find((s) => s.id === "A").isMock = false;
  state.stations.find((s) => s.id === "B").coordinateSystem = "GCJ-02";
  localStorage.setItem("ecostation-demo-v1", JSON.stringify(state));
});
await page.reload();
await page.waitForFunction(
  () =>
    document
      .querySelector(".gis-map-target")
      ?.__ecostationMap?.get("stationSource")
      .getFeatures().length === 4,
);
await page.locator(".station").filter({ hasText: "站点A" }).click();
assert.match(
  await page.locator(".gis-selection-notice").innerText(),
  /坐标待补充/,
);
assert(await page.getByRole("button", { name: "定位当前站点" }).isDisabled());
// Force online failure and verify the sourced local fallback plus retry entry.
const offline = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
});
const offlineErrors = [];
offline.on("pageerror", (e) => offlineErrors.push(e.message));
await offline.route("https://tile.openstreetmap.org/**", (route) =>
  route.abort(),
);
await offline.goto(url);
await offline
  .getByText("在线底图暂不可用 · 已切换本地OSM简图", { exact: true })
  .waitFor({ timeout: 20000 });
assert(
  await offline.getByRole("button", { name: "重试", exact: true }).isVisible(),
);
await offline.screenshot({
  path: "screenshots/gis-local-fallback.png",
  fullPage: true,
});
assert.equal(offlineErrors.length, 0);
assert.equal(scriptErrors.length, 0, scriptErrors.join("\n"));
fs.writeFileSync(
  "screenshots/gis-validation.json",
  JSON.stringify(
    {
      layouts,
      initialCoordinates: coordinates,
      selectedDStyle: dStyle,
      oldStatePreserved: true,
      engineStable: true,
      errors: scriptErrors,
      offlineFallback: true,
    },
    null,
    2,
  ),
);
console.log("GIS browser checks passed", layouts);
await browser.close();
