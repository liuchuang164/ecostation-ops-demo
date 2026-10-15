import {
  getInitialStationCoordinates,
  type CoordinateFields,
} from "./stationCoordinates";
export type IncidentStatus =
  "待核查" | "核查中" | "处理中" | "待复查" | "已关闭";
export type Result = "尚未检查" | "通过" | "未通过";
export interface Station extends CoordinateFields {
  id: string;
  name: string;
  eco: string;
  role: string;
  /** Retained only for compatibility with the previous persisted demo format. */
  x?: number;
  y?: number;
}
export interface Device {
  id: string;
  stationId: string;
  name: string;
  connection: "在线" | "离线";
}
export interface ObservationTask {
  id: string;
  stationId: string;
  deviceId: string;
  name: string;
}
export interface ObservationSeries {
  id: string;
  taskId: string;
  hour: number;
  record: "已有记录" | "记录缺口" | "补传记录";
  quality: "已检查" | "待检查" | "质量风险";
  source: string;
  value: number | null;
}
export interface Incident {
  id: string;
  stationId: string;
  deviceId: string;
  taskIds: string[];
  title: string;
  kind: "gap" | "optical" | "water";
  status: IncidentStatus;
  found: string;
  recipients: string[];
}
export interface Evidence {
  id: string;
  incidentId: string;
  step: string;
  result: string;
  note: string;
  time: string;
  source: string;
}
export interface Verification {
  name: string;
  result: Result;
  note: string;
}
export interface MaintenanceTask {
  id: string;
  incidentId: string;
  stationId: string;
  taskIds: string[];
  name: string;
  status: "安排任务" | "执行处理" | "恢复复查" | "确认完成";
  owner: string;
  executor: string;
  priority: string;
  reason: string;
  records: { text: string; time: string; role: string }[];
  checks: Verification[];
  scope: string;
  conclusion: string;
  maintenanceHour?: number;
  reviewedRecordCount?: number;
  evidenceIds: string[];
}
export interface ActionLog {
  id: string;
  time: string;
  role: string;
  incidentId: string;
  action: string;
}
export interface State {
  version: 1;
  minute: number;
  stations: Station[];
  devices: Device[];
  observations: ObservationTask[];
  series: ObservationSeries[];
  incidents: Incident[];
  evidence: Evidence[];
  tasks: MaintenanceTask[];
  logs: ActionLog[];
}
export const checksFor = (kind: Incident["kind"]) =>
  kind === "gap"
    ? [
        "设备连接正常",
        "对应记录已核对（仅补传实际保存记录）",
        "后续新增记录连续",
        "气象观测任务在复查范围内恢复",
      ]
    : kind === "optical"
      ? ["窗口是否清洁", "诊断是否正常", "新增数据是否通过质量检查"]
      : ["供水与充水排气已核对", "具备蒸发条件", "后续实际计量与现场读数一致"];
export function initialState(): State {
  const stations = ["森林", "草地", "农田", "湿地", "灌丛", "城市生态"].map(
    (eco, i) => ({
      id: "ABCDEF"[i],
      name: `站点${"ABCDEF"[i]}`,
      eco: eco + "观测",
      role: "站点负责人",
      ...getInitialStationCoordinates("ABCDEF"[i]),
    }),
  );
  const devices: Device[] = stations.flatMap((s) => [
    {
      id: s.id + "-met",
      stationId: s.id,
      name: "气象采集设备",
      connection: "在线",
    },
    {
      id: s.id + "-soil",
      stationId: s.id,
      name: "土壤水分传感器",
      connection: "在线",
    },
  ]);
  devices.push(
    {
      id: "D-li",
      stationId: "D",
      name: "LI-7500DS 二氧化碳/水汽分析仪",
      connection: "在线",
    },
    {
      id: "E-et",
      stationId: "E",
      name: "255-700E 参考蒸散发仪",
      connection: "在线",
    },
  );
  const observations: ObservationTask[] = devices.map((d) => ({
    id: d.id + "-obs",
    stationId: d.stationId,
    deviceId: d.id,
    name:
      d.id === "D-li"
        ? "碳水观测"
        : d.id === "E-et"
          ? "参考蒸散观测"
          : d.id.endsWith("soil")
            ? "土壤水分观测"
            : "气象连续观测",
  }));
  const series: ObservationSeries[] = observations.flatMap((o) =>
    Array.from({ length: 24 }, (_, hour) => ({
      id: o.id + "-" + hour,
      taskId: o.id,
      hour,
      record:
        o.id === "B-met-obs" && hour >= 8 && hour <= 11
          ? "记录缺口"
          : "已有记录",
      quality:
        o.id === "D-li-obs" && hour >= 7
          ? "质量风险"
          : hour === 23 || (o.id === "E-et-obs" && hour >= 16)
            ? "待检查"
            : "已检查",
      source: "平台记录（模拟）",
      value:
        o.id === "B-met-obs" && hour >= 8 && hour <= 11
          ? null
          : o.id === "D-li-obs"
            ? Math.round(92 - hour * 2.1 + Math.sin(hour * 1.9) * 2)
            : o.id === "E-et-obs"
              ? Math.min(8, Math.floor(hour / 2)) * 0.2 + 2
              : 20 + Math.sin(hour) * 2,
    })),
  );
  return {
    version: 1,
    minute: 0,
    stations,
    devices,
    observations,
    series,
    incidents: [
      {
        id: "INC-B",
        stationId: "B",
        deviceId: "B-met",
        taskIds: ["B-met-obs"],
        title: "气象观测记录出现缺口",
        kind: "gap",
        status: "待核查",
        found: "2026-10-12 12:10",
        recipients: ["站点负责人", "运维人员"],
      },
      {
        id: "INC-D",
        stationId: "D",
        deviceId: "D-li",
        taskIds: ["D-li-obs"],
        title: "光学信号持续走低",
        kind: "optical",
        status: "待核查",
        found: "2026-10-12 13:20",
        recipients: ["站点负责人", "数据审核人员"],
      },
      {
        id: "INC-E",
        stationId: "E",
        deviceId: "E-et",
        taskIds: ["E-et-obs"],
        title: "参考蒸散累计计量停滞",
        kind: "water",
        status: "待核查",
        found: "2026-10-12 14:00",
        recipients: ["站点负责人", "运维人员"],
      },
    ],
    evidence: [],
    tasks: [],
    logs: [],
  };
}
export const time = (s: State) => {
  const d = new Date(Date.UTC(2026, 9, 13, 0, s.minute));
  return d.toISOString().slice(0, 16).replace("T", " ");
};
export const metrics = (s: State) => {
  const open = s.incidents.filter((i) => i.status !== "已关闭");
  return [
    s.stations.length,
    new Set(open.map((i) => i.stationId)).size,
    new Set(open.flatMap((i) => i.taskIds)).size,
    open.length,
    s.tasks.filter((t) => t.status === "恢复复查").length,
  ];
};
export type Command =
  | { type: "evidence"; id: string; step: string; result: string; note: string }
  | { type: "create"; id: string }
  | {
      type: "assign";
      id: string;
      owner: string;
      executor: string;
      priority: string;
      reason: string;
    }
  | { type: "start" | "review" | "finish" | "return"; id: string }
  | { type: "record"; id: string; text: string; backfill: boolean }
  | { type: "check"; id: string; index: number; result: Result; note: string }
  | { type: "scope"; id: string; scope: string };
export function transition(prev: State, c: Command): State {
  const s = structuredClone(prev);
  s.minute += 5;
  const i = s.incidents.find((i) => i.id === c.id);
  if (!i) throw Error("事件不存在");
  const t = s.tasks.find((t) => t.incidentId === i.id);
  let action = "";
  let role = "站点负责人";
  if (c.type === "evidence") {
    if (i.status === "已关闭") throw Error("已关闭事件不可修改核查结果");
    s.evidence.push({
      id: "EV-" + s.minute,
      incidentId: i.id,
      step: c.step,
      result: c.result,
      note: c.note,
      time: time(s),
      source: "人工检查",
    });
    if (!t) i.status = c.result === "暂无法确认" ? "待核查" : "核查中";
    action = `核查${c.step}：${c.result}。${c.note}`;
  }
  if (c.type === "create") {
    if (t) throw Error("该事件已有维护任务");
    s.tasks.push({
      id: "MT-" + i.stationId,
      incidentId: i.id,
      stationId: i.stationId,
      taskIds: [...i.taskIds],
      name:
        i.kind === "gap"
          ? "恢复上传与核对对应记录"
          : i.kind === "optical"
            ? "光学窗口检查与清洁"
            : "供水检查与补水维护",
      status: "安排任务",
      owner: "",
      executor: "",
      priority: "优先处理",
      reason: "",
      records: [],
      checks: checksFor(i.kind).map((name) => ({
        name,
        result: "尚未检查",
        note: "",
      })),
      scope: "",
      conclusion: "",
      evidenceIds: s.evidence
        .filter((e) => e.incidentId === i.id)
        .map((e) => e.id),
    });
    action = "创建维护任务，携带站点、观测任务及核查证据";
  }
  if (c.type === "assign") {
    if (!t || t.status !== "安排任务") throw Error("仅安排阶段可修改人员");
    if (!c.owner || !c.executor || !c.reason.trim())
      throw Error("请填写负责人、执行人员和安排依据");
    Object.assign(t, {
      owner: c.owner,
      executor: c.executor,
      priority: c.priority,
      reason: c.reason,
    });
    action = `安排任务：${c.owner} / ${c.executor}；${c.priority}；依据：${c.reason}`;
  }
  if (c.type === "start") {
    if (!t || t.status !== "安排任务" || !t.owner || !t.executor || !t.reason)
      throw Error("请先保存完整任务安排");
    t.status = "执行处理";
    i.status = "处理中";
    action = "开始处理";
  }
  if (c.type === "record") {
    if (!t || t.status !== "执行处理" || !c.text.trim())
      throw Error("请在执行阶段填写处理记录");
    if (c.backfill) {
      if (
        i.kind !== "gap" ||
        s.evidence
          .filter((e) => e.incidentId === i.id && e.step === "站内原始记录")
          .at(-1)?.result !== "记录完整"
      )
        throw Error("仅有站内记录完整的核查证据时允许补传");
      s.series
        .filter((r) => i.taskIds.includes(r.taskId) && r.record === "记录缺口")
        .forEach((r) => {
          r.record = "补传记录";
          r.value = 20 + Math.sin(r.hour) * 2;
          r.quality = "待检查";
          r.source = "人工确认站内实际保存记录后补传（模拟）";
        });
    }
    t.records.push({
      text:
        c.text +
        (c.backfill ? "；已确认并补传站内实际保存的08:00–12:00记录" : ""),
      time: time(s),
      role: t.executor,
    });
    t.maintenanceHour ??= s.minute / 60;
    action = c.text;
    role = t.executor;
  }
  if (c.type === "review") {
    if (!t || t.status !== "执行处理" || !t.records.length)
      throw Error("请先完成处理记录");
    if (t.records.length <= (t.reviewedRecordCount ?? 0))
      throw Error("请先补充处理记录");
    t.reviewedRecordCount = t.records.length;
    s.minute += 90;
    t.status = "恢复复查";
    i.status = "待复查";
    t.checks.forEach((v) => {
      v.result = "尚未检查";
      v.note = "";
    });
    t.scope = "";
    action = "提交恢复复查，演示观察时间推进90分钟；检查项目全部重新待检";
  }
  if (c.type === "check") {
    if (!t || t.status !== "恢复复查") throw Error("当前不在复查阶段");
    t.checks[c.index] = {
      ...t.checks[c.index],
      result: c.result,
      note: c.note,
    };
    role = "数据审核人员";
    action = `检查${t.checks[c.index].name}：${c.result} ${c.note}`;
    if (c.result === "未通过") {
      t.status = "执行处理";
      i.status = "处理中";
      action = `复查未通过：${t.checks[c.index].name}。${c.note}；退回继续处理`;
    }
  }
  if (c.type === "scope") {
    if (!t || t.status !== "恢复复查") throw Error("当前不在复查阶段");
    t.scope = c.scope;
    role = "数据审核人员";
    action = "保存复查范围：" + c.scope;
  }
  if (c.type === "return") {
    if (!t || t.status !== "恢复复查") throw Error("当前不在复查阶段");
    t.status = "执行处理";
    i.status = "处理中";
    action = "复查未通过：人工退回继续处理";
  }
  if (c.type === "finish") {
    if (
      !t ||
      t.status !== "恢复复查" ||
      !t.scope.trim() ||
      t.checks.some((v) => v.result !== "通过")
    )
      throw Error("必需检查项全部通过并填写复查范围后才能完成");
    t.status = "确认完成";
    i.status = "已关闭";
    t.conclusion = "本次复查范围内观测恢复，历史缺口与质量标记保留";
    action = "确认完成：" + t.scope;
    role = "数据审核人员";
  }
  s.logs.push({
    id: "LOG-" + s.minute,
    time: time(s),
    role,
    incidentId: i.id,
    action,
  });
  return s;
}
