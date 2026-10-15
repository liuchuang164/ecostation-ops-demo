import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  metrics,
  transition,
  type State,
  type Command,
} from "../src/model.ts";
test("初始统计去重与数据完整性", () => {
  const s = initialState();
  assert.deepEqual(metrics(s), [6, 3, 3, 3, 0]);
  assert.equal(s.series.filter((r) => r.record === "记录缺口").length, 4);
  assert(
    s.series
      .filter((r) => r.record === "记录缺口")
      .every((r) => r.value === null),
  );
  s.incidents.push({ ...s.incidents[0], id: "duplicate" });
  assert.deepEqual(metrics(s), [6, 3, 3, 4, 0]);
});
for (const id of ["INC-B", "INC-D", "INC-E"])
  test(id + "完整复查状态机与拒绝越级关闭", () => {
    let s = initialState();
    const run = (c: Command) => (s = transition(s, c));
    run({
      type: "evidence",
      id,
      step: "现场核查",
      result: "暂无法确认",
      note: "",
    });
    assert.equal(s.incidents.find((i) => i.id === id)?.status, "待核查");
    run({ type: "create", id });
    assert.throws(() => run({ type: "finish", id }));
    assert.throws(() => run({ type: "start", id }));
    run({
      type: "assign",
      id,
      owner: "站点负责人",
      executor: "运维人员",
      priority: "优先处理",
      reason: "影响观测连续性",
    });
    run({ type: "start", id });
    assert.throws(() =>
      run({ type: "record", id, text: "维护", backfill: true }),
    );
    run({ type: "record", id, text: "首次维护", backfill: false });
    run({ type: "review", id });
    assert.deepEqual(metrics(s), [6, 3, 3, 3, 1]);
    assert(s.tasks[0].checks.every((c) => c.result === "尚未检查"));
    run({
      type: "check",
      id,
      index: 0,
      result: "未通过",
      note: "需要继续检查",
    });
    assert.equal(s.tasks[0].status, "执行处理");
    assert.throws(() => run({ type: "review", id }));
    run({ type: "record", id, text: "补充处理", backfill: false });
    run({ type: "review", id });
    s.tasks[0].checks.forEach((_, index) =>
      run({ type: "check", id, index, result: "通过", note: "检查确认" }),
    );
    assert.throws(() => run({ type: "finish", id }));
    run({ type: "scope", id, scope: "对应时段与后续90分钟实际观测" });
    run({ type: "finish", id });
    assert.deepEqual(metrics(s), [6, 2, 2, 2, 0]);
    assert.equal(s.series.filter((r) => r.record === "记录缺口").length, 4);
    assert.equal(s.series.filter((r) => r.quality === "质量风险").length, 17);
    assert(s.logs.every((l, j, a) => !j || l.time >= a[j - 1].time));
  });
test("仅核查确认存在的站内记录允许补传，补传仍待质量检查", () => {
  let s: State = initialState();
  for (const c of [
    {
      type: "evidence",
      id: "INC-B",
      step: "站内原始记录",
      result: "记录完整",
      note: "原始记录已查",
    },
    { type: "create", id: "INC-B" },
    {
      type: "assign",
      id: "INC-B",
      owner: "站点负责人",
      executor: "运维人员",
      priority: "优先处理",
      reason: "原始记录可补传",
    },
    { type: "start", id: "INC-B" },
    { type: "record", id: "INC-B", text: "恢复上传", backfill: true },
  ] as Command[])
    s = transition(s, c);
  assert.equal(s.series.filter((r) => r.record === "补传记录").length, 4);
  assert(
    s.series
      .filter((r) => r.record === "补传记录")
      .every((r) => r.quality === "待检查"),
  );
  assert.equal(s.incidents[0].status, "处理中");
});
