import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
await page.goto("http://127.0.0.1:5173");
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.getByRole("heading", { name: "站点运行一张图" }).waitFor();
await page.screenshot({ path: "screenshots/home.png", fullPage: true });
const layouts = [];
for (const [width, height] of [
  [1920, 1080],
  [2560, 1440],
  [3840, 2160],
  [1366, 768],
]) {
  await page.setViewportSize({ width, height });
  await page.screenshot({
    path: `screenshots/home-${width}.png`,
    fullPage: true,
  });
  const dim = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }));
  assert(dim.width <= width, `overflow ${width}`);
  if (width === 1920)
    assert(dim.height <= 1080, `homepage height ${dim.height}`);
  layouts.push({
    viewportWidth: width,
    viewportHeight: height,
    documentWidth: dim.width,
    documentHeight: dim.height,
  });
}
await page.setViewportSize({ width: 1920, height: 1080 });
await page.getByLabel("搜索站点").fill("农田");
assert.equal(await page.locator(".station").count(), 1);
await page.getByLabel("搜索站点").fill("");
await page.locator(".station").filter({ hasText: "站点D" }).click();
assert.match(await page.locator(".summarytitle").innerText(), /站点D/);
await page.locator(".station").filter({ hasText: "站点B" }).click();
await page.getByRole("button", { name: "开始排查", exact: true }).click();
await page.getByLabel("记录完整", { exact: true }).check();
await page.getByRole("button", { name: "保存核查结果", exact: true }).click();
await page
  .getByLabel("后续核查结果")
  .fill("已核对：对应时段上传未完成，站内原始记录完整");
await page.getByRole("button", { name: "保存后续核查" }).click();
await page.screenshot({
  path: "screenshots/investigation.png",
  fullPage: true,
});
async function createAndStart() {
  await page.getByRole("button", { name: "创建维护任务", exact: true }).click();
  await page
    .getByLabel("任务负责人", { exact: true })
    .selectOption("站点负责人");
  await page.getByLabel("执行人员", { exact: true }).selectOption("运维人员");
  await page
    .getByLabel("安排依据", { exact: true })
    .fill("影响观测任务，依据已提交现场核查证据安排维护");
  await page.getByRole("button", { name: "保存任务安排", exact: true }).click();
  await page.getByRole("button", { name: "开始处理", exact: true }).click();
}
async function record(text, fill = false) {
  await page.getByLabel("新增处理记录", { exact: true }).fill(text);
  if (fill)
    await page.getByLabel("确认补传站内实际保存的08:00–12:00记录").check();
  await page.getByRole("button", { name: "保存处理记录", exact: true }).click();
  await page.getByRole("button", { name: "提交恢复复查", exact: true }).click();
}
async function finish() {
  for (const row of await page.locator(".verifyrow").all())
    await row.getByRole("button", { name: "通过", exact: true }).click();
  assert(
    await page
      .getByRole("button", { name: "确认完成", exact: true })
      .isDisabled(),
  );
  await page
    .getByLabel("复查范围", { exact: true })
    .fill("核对对应时段记录，并观察维护后90分钟新增记录及现场读数");
  await page.getByRole("button", { name: "保存复查范围", exact: true }).click();
  await page.getByRole("button", { name: "确认完成", exact: true }).click();
}
await createAndStart();
await record("已检查并恢复上传，核对站内实际保存的对应记录", true);
await page
  .locator(".verifyrow")
  .nth(2)
  .getByRole("button", { name: "未通过", exact: true })
  .click();
assert.equal(await page.getByLabel("新增处理记录", { exact: true }).count(), 1);
await record("继续检查上传队列，确认后续新增记录持续到达平台");
await page.screenshot({ path: "screenshots/verification.png", fullPage: true });
await finish();
let saved = await page.evaluate(() =>
  JSON.parse(localStorage.getItem("ecostation-demo-v1")),
);
assert.equal(saved.incidents[0].status, "已关闭");
assert.equal(saved.series.filter((x) => x.record === "补传记录").length, 4);
for (const [label, result, text, file, id] of [
  [
    "LI-7500DS窗口污染",
    "发现污迹",
    "工作人员确认已按厂家要求清洁窗口",
    "li7500ds",
    "INC-D",
  ],
  [
    "255-700E供水异常",
    "确认储水耗尽",
    "已按说明书补充蒸馏水、充水排气并恢复供水",
    "255700e",
    "INC-E",
  ],
]) {
  await page.getByRole("button", { name: "演示场景", exact: true }).click();
  await page.getByRole("button", { name: new RegExp(label) }).click();
  if (id === "INC-E")
    assert.match(
      await page.locator(".supply").locator("..").innerText(),
      /水位待核查/,
    );
  await page.screenshot({ path: `screenshots/${file}.png`, fullPage: true });
  await page.getByLabel(result, { exact: true }).check();
  await page.getByRole("button", { name: "保存核查结果", exact: true }).click();
  await createAndStart();
  await record(text);
  assert(
    await page
      .getByRole("button", { name: "确认完成", exact: true })
      .isDisabled(),
  );
  assert.equal(
    await page
      .locator(".verifyrow .badge")
      .filter({ hasText: "尚未检查" })
      .count(),
    3,
  );
  await finish();
  await page.screenshot({
    path: `screenshots/${file}-recovered.png`,
    fullPage: true,
  });
}
await page.getByRole("button", { name: "站点总览", exact: true }).click();
saved = await page.evaluate(() =>
  JSON.parse(localStorage.getItem("ecostation-demo-v1")),
);
assert(saved.incidents.every((i) => i.status === "已关闭"));
assert(saved.series.some((r) => r.quality === "质量风险"));
await page.reload();
assert.equal(
  (
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("ecostation-demo-v1")),
    )
  ).tasks.length,
  3,
);
const downloadPromise = page.waitForEvent("download");
await page.getByRole("button", { name: "导出记录", exact: true }).click();
const download = await downloadPromise;
await download.saveAs("screenshots/export-sample.json");
assert.match(
  fs.readFileSync("screenshots/export-sample.json", "utf8"),
  /模拟数据/,
);
assert.equal(errors.length, 0, errors.join("\n"));
fs.writeFileSync(
  "screenshots/validation.json",
  JSON.stringify(
    {
      layouts,
      errors,
      routes:
        "三条路线全部通过；B含复查失败退回；状态刷新持久化；历史质量风险保留",
    },
    null,
    2,
  ),
);
await page.getByRole("button", { name: "重置演示", exact: true }).click();
await page.getByRole("button", { name: "确认重置演示" }).click();
assert.equal(
  (
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("ecostation-demo-v1")),
    )
  ).tasks.length,
  0,
);
console.log("Browser validation passed", layouts);
await browser.close();
