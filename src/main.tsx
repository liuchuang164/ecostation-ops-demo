import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import * as echarts from "echarts";
import {
  Leaf,
  MapPin,
  Bell,
  Search,
  ClipboardList,
  ShieldCheck,
  LayoutDashboard,
  Maximize,
  RotateCcw,
  Download,
  ChevronRight,
  Radio,
  Trees,
  Activity,
  FlaskConical,
  Play,
  CheckCircle2,
  X,
  Info,
  Clock,
  ArrowUpRight,
} from "lucide-react";
import {
  initialState,
  metrics,
  transition,
  time,
  type State,
  type Incident,
  type Command,
  type Result,
} from "./model";
import "./style.css";
import { StationMap } from "./StationMap";
import { ThemePicker } from "./ThemePicker";
import {
  ThemeContext,
  INITIAL_THEME,
  applyTheme,
  useTheme,
  readVisualPalette,
  type ThemeId,
} from "./theme";
import "./themes.css";
import {
  migrateStationCoordinates,
  validateStationCoordinate,
} from "./stationCoordinates";
const KEY = "ecostation-demo-v1";
const navs = ["站点总览", "异常提醒", "辅助排查", "维护任务", "恢复检查"];
const icons = [LayoutDashboard, Bell, Search, ClipboardList, ShieldCheck];
function Chart({ option }: { option: echarts.EChartsOption }) {
  const ref = useRef<HTMLDivElement>(null);
  const engine = useRef<echarts.ECharts | null>(null);
  useEffect(() => {
    const chart = echarts.init(ref.current!);
    engine.current = chart;
    const resize = new ResizeObserver(() => chart.resize());
    resize.observe(ref.current!);
    if (import.meta.env.DEV)
      Object.defineProperty(ref.current!, "__ecostationChart", {
        value: chart,
        configurable: true,
      });
    return () => {
      resize.disconnect();
      chart.dispose();
      engine.current = null;
    };
  }, []);
  useEffect(() => {
    engine.current?.setOption(option, true);
  }, [option]);
  return <div ref={ref} className="chart" />;
}
function Badge({
  children,
  good = false,
}: {
  children: React.ReactNode;
  good?: boolean;
}) {
  return (
    <span className={"badge " + (good ? "good" : "warn")}>{children}</span>
  );
}
function App() {
  const [theme, setTheme] = useState<ThemeId>(INITIAL_THEME);
  const changeTheme = (theme: ThemeId) => {
    applyTheme(theme);
    setTheme(theme);
  };
  const [s, setS] = useState<State>(() => {
    try {
      const a = JSON.parse(localStorage.getItem(KEY) || "null");
      return a?.version === 1 ? migrateStationCoordinates(a) : initialState();
    } catch {
      return initialState();
    }
  });
  const [page, setPage] = useState("站点总览"),
    [sid, setSid] = useState("B"),
    [iid, setIid] = useState("INC-B"),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("全部"),
    [modal, setModal] = useState(""),
    [toast, setToast] = useState(""),
    [range, setRange] = useState("24"),
    [onlyOpen, setOnlyOpen] = useState(true),
    [locationRequest, setLocationRequest] = useState(0);
  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(s));
  }, [s]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4200);
    return () => clearTimeout(t);
  }, [toast]);
  const station = s.stations.find((x) => x.id === sid)!;
  const incident = s.incidents.find((x) => x.id === iid)!;
  const task = s.tasks.find((x) => x.incidentId === iid);
  const counts = metrics(s);
  const open = s.incidents.filter((x) => x.status !== "已关闭");
  const attention = (id: string) => open.some((x) => x.stationId === id);
  const select = (id: string) => {
    setSid(id);
    setLocationRequest((request) => request + 1);
    const inc = s.incidents.find((x) => x.stationId === id);
    if (inc) setIid(inc.id);
  };
  const focus = (i: Incident, p = "辅助排查") => {
    setSid(i.stationId);
    setIid(i.id);
    setPage(p);
    setModal("");
  };
  const act = (c: Command) => {
    try {
      setS(transition(s, c));
      setToast(
        "已保存 · " +
          (c.type === "check" && c.result === "未通过"
            ? "复查未通过，已退回继续处理"
            : "演示状态已更新"),
      );
      return true;
    } catch (e) {
      setToast((e as Error).message);
      return false;
    }
  };
  const exportData = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            说明: "模拟数据｜功能演示；非真实观测记录",
            导出时间: time(s),
            ...s,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "生态微站-模拟维护记录.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setToast("已导出模拟事件、维护记录与操作日志");
  };
  const list = s.stations
    .filter(
      (x) =>
        (x.name + x.eco).includes(search) &&
        (filter === "全部" || attention(x.id) === (filter === "需关注")),
    )
    .sort((a, b) => Number(attention(b.id)) - Number(attention(a.id)));
  const obs = s.observations.filter((o) => o.stationId === sid);
  const selectedInc = s.incidents.filter((x) => x.stationId === sid);
  const currentTasks = s.tasks.filter((t) => t.stationId === sid);
  return (
    <ThemeContext.Provider value={theme}>
      <div className="app">
        <header>
          <div className="brand">
            <span className="brandmark">
              <Leaf size={31} />
            </span>
            <div>
              <h1>生态微站智能运维</h1>
              <p>保障观测连续，让维护有据可依</p>
            </div>
          </div>
          <div className="topmeta">
            <span className="demo">
              <i />
              演示数据｜功能演示
            </span>
            <span>演示时间 {time(s)}</span>
          </div>
          <div className="headeractions">
            <ThemePicker value={theme} onChange={changeTheme} />
            <button onClick={() => setModal("场景")}>
              <Play size={15} />
              演示场景
            </button>
            <button
              title="进入或退出全屏"
              onClick={async () => {
                try {
                  if (document.fullscreenElement)
                    await document.exitFullscreen();
                  else if (document.documentElement.requestFullscreen)
                    await document.documentElement.requestFullscreen();
                  else setToast("当前环境不支持全屏，可继续使用页面");
                } catch {
                  setToast("全屏暂不可用，可继续使用页面");
                }
              }}
            >
              <Maximize size={17} />
            </button>
            <button title="重置演示" onClick={() => setModal("重置")}>
              <RotateCcw size={17} />
            </button>
          </div>
        </header>
        <nav>
          {navs.map((n, j) => {
            const Icon = icons[j];
            return (
              <button
                className={page === n ? "active" : ""}
                key={n}
                onClick={() => {
                  setPage(n);
                  if (["辅助排查", "维护任务", "恢复检查"].includes(n))
                    setSid(incident.stationId);
                }}
              >
                <Icon size={18} />
                {n}
                {n === "异常提醒" && <small>{counts[3]}</small>}
              </button>
            );
          })}
          <span className="navright">
            <span className="dot green" />
            本地演示环境 <span className="divider">/</span> 当前范围：
            {page === "站点总览" ? "全部示范站点" : station.name}
          </span>
        </nav>
        <main>
          <div className="pagetitle">
            <div>
              <span className="eyebrow">
                ECOLOGICAL OBSERVATION · OPERATIONS
              </span>
              <h2>
                {page === "站点总览"
                  ? "站点运行一张图"
                  : page === "辅助排查"
                    ? "问题辅助排查"
                    : page === "恢复检查"
                      ? "恢复检查与记录"
                      : page === "维护任务"
                        ? "维护安排与跟踪"
                        : "异常主动提醒"}
              </h2>
            </div>
            <div className="titletools">
              <span>从设备状态，看到观测连续性</span>
              <button onClick={exportData}>
                <Download size={15} />
                导出记录
              </button>
            </div>
          </div>
          <div className="metrics">
            {[
              "站点总数",
              "需关注站点",
              "受影响观测任务",
              "未关闭异常",
              "待复查任务",
            ].map((label, j) => {
              const Icon = [MapPin, Radio, Activity, Bell, ShieldCheck][j];
              return (
                <button
                  className="metric"
                  key={label}
                  onClick={() => {
                    if (j < 2) {
                      setPage("站点总览");
                      setFilter(j ? "需关注" : "全部");
                      setSearch("");
                    } else if (j === 4) {
                      setPage("恢复检查");
                    } else {
                      setPage("异常提醒");
                      setOnlyOpen(true);
                    }
                  }}
                  title={
                    [
                      "全部虚构示范站点",
                      "按未解决问题的站点去重",
                      "按未关闭事件影响的观测任务去重",
                      "含待核查、核查中、处理中、待复查",
                      "仅当前进入复查阶段的任务",
                    ][j]
                  }
                >
                  <span className={"metricicon m" + j}>
                    <Icon size={23} />
                  </span>
                  <div>
                    <span>{label}</span>
                    <strong>
                      {counts[j]}
                      <em>{j < 2 ? "个" : "项"}</em>
                    </strong>
                  </div>
                  <ArrowUpRight size={16} className="metricarrow" />
                </button>
              );
            })}
          </div>
          {page === "站点总览" ? (
            <>
              <div className="overview">
                <section className="panel stations">
                  <div className="panelhead">
                    <h3>示范站点</h3>
                    <span>共 {s.stations.length} 个</span>
                  </div>
                  <div className="search">
                    <Search size={16} />
                    <input
                      aria-label="搜索站点"
                      placeholder="搜索站点名称 / 生态类型"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <div className="segmented">
                    {["全部", "需关注", "正常"].map((f) => (
                      <button
                        className={filter === f ? "on" : ""}
                        onClick={() => setFilter(f)}
                        key={f}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                  <div className="stationlist">
                    {list.map((st) => (
                      <button
                        key={st.id}
                        className={
                          "station " + (sid === st.id ? "selected" : "")
                        }
                        onClick={() => select(st.id)}
                      >
                        <div className="stationtop">
                          <b>
                            <span
                              className={
                                "dot " + (attention(st.id) ? "orange" : "green")
                              }
                            />
                            {st.name}
                          </b>
                          <span>{st.eco}</span>
                        </div>
                        <p>
                          {attention(st.id)
                            ? s.incidents.find(
                                (i) =>
                                  i.stationId === st.id &&
                                  i.status !== "已关闭",
                              )?.title
                            : "观测正常 · 记录连续"}
                        </p>
                        <div className="stationfoot">
                          <span>
                            {validateStationCoordinate(st).valid
                              ? st.role
                              : "坐标待补充"}
                          </span>
                          <span>{time(s).slice(11)} 更新</span>
                        </div>
                      </button>
                    ))}
                    {!list.length && (
                      <div className="empty">没有符合条件的站点</div>
                    )}
                  </div>
                  <div className="quietnote">
                    <Info size={14} />
                    模拟站点位置 · 真实部署站址待核实
                  </div>
                </section>
                <section className="panel center">
                  <StationMap
                    stations={s.stations}
                    visibleStationIds={list.map((station) => station.id)}
                    selectedId={sid}
                    locationRequest={locationRequest}
                    getStatus={(id) =>
                      attention(id)
                        ? "attention"
                        : s.observations.some(
                              (observation) => observation.stationId === id,
                            )
                          ? "normal"
                          : "unknown"
                    }
                    getIncident={(id) =>
                      open.find((event) => event.stationId === id)?.title ??
                      null
                    }
                    onSelect={select}
                    onViewDetails={() =>
                      requestAnimationFrame(() =>
                        document.querySelector(".summary")?.scrollIntoView({
                          behavior: "smooth",
                          block: "nearest",
                        }),
                      )
                    }
                  />
                  <div className="summary">
                    <div className="summarytitle">
                      <h3>
                        {station.name}
                        <span>{station.eco}</span>
                      </h3>
                      <Badge good={!attention(sid)}>
                        {attention(sid) ? "观测待关注" : "当前观测正常"}
                      </Badge>
                    </div>
                    <div className="summarygrid">
                      <div>
                        <h4>
                          <Radio size={15} />
                          设备状态
                        </h4>
                        {s.devices
                          .filter((d) => d.stationId === sid)
                          .map((d) => (
                            <div className="kv" key={d.id}>
                              <span>{d.name}</span>
                              <span className="greenText">{d.connection}</span>
                            </div>
                          ))}
                        {sid === "B" && (
                          <div className="kv">
                            <span>平台气象记录</span>
                            <span
                              className={
                                s.series.some(
                                  (r) =>
                                    r.taskId === "B-met-obs" &&
                                    r.record === "记录缺口",
                                )
                                  ? "orangeText"
                                  : "greenText"
                              }
                            >
                              {s.series.some(
                                (r) =>
                                  r.taskId === "B-met-obs" &&
                                  r.record === "记录缺口",
                              )
                                ? "有缺口"
                                : "站内记录已补传"}
                            </span>
                          </div>
                        )}
                      </div>
                      <div>
                        <h4>
                          <Activity size={15} />
                          观测任务状态
                        </h4>
                        {obs.map((o) => (
                          <div className="kv" key={o.id}>
                            <span>{o.name}</span>
                            <span
                              className={
                                open.some((i) => i.taskIds.includes(o.id))
                                  ? "orangeText"
                                  : "greenText"
                              }
                            >
                              {open.some((i) => i.taskIds.includes(o.id))
                                ? "部分时段待核查"
                                : "当前记录连续"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="bluenote">
                      <Info size={16} />
                      {sid === "B"
                        ? "设备在线，也要检查观测记录是否完整。"
                        : "设备连接与观测质量分别检查，恢复结论以复查记录为准。"}
                    </div>
                  </div>
                </section>
                <section className="panel alerts">
                  <div className="panelhead">
                    <h3>
                      <Bell size={17} />
                      当前站点提醒
                    </h3>
                    <span>
                      {selectedInc.filter((i) => i.status !== "已关闭").length}{" "}
                      项未关闭
                    </span>
                  </div>
                  {selectedInc.map((i) => (
                    <button
                      className="alertcard"
                      key={i.id}
                      onClick={() => focus(i)}
                    >
                      <div className="alerttop">
                        <span>
                          {i.stationId} · {i.found.slice(11)} 发现
                        </span>
                        <Badge good={i.status === "已关闭"}>{i.status}</Badge>
                      </div>
                      <h4>{i.title}</h4>
                      <p>{s.devices.find((d) => d.id === i.deviceId)?.name}</p>
                      <div className="impact">
                        影响观测{" "}
                        <b>
                          {s.observations
                            .filter((o) => i.taskIds.includes(o.id))
                            .map((o) => o.name)
                            .join("、")}
                        </b>
                      </div>
                      <small>提醒对象：{i.recipients.join("、")}</small>
                      <div className="alertlink">
                        查看详情与辅助排查
                        <ChevronRight size={17} />
                      </div>
                    </button>
                  ))}
                  {!selectedInc.length && (
                    <div className="empty">
                      <ShieldCheck size={34} />
                      <p>当前站点无未关闭异常</p>
                    </div>
                  )}
                  <div className="otheralerts">
                    <h4>其他需关注站点</h4>
                    {open
                      .filter((i) => i.stationId !== sid)
                      .map((i) => (
                        <button key={i.id} onClick={() => select(i.stationId)}>
                          <span className="dot orange" />
                          <div>
                            <b>站点{i.stationId}</b>
                            <p>{i.title}</p>
                          </div>
                          <ChevronRight size={15} />
                        </button>
                      ))}
                  </div>
                  <div className="quietnote">
                    仅本地提醒关联，不发送短信或邮件
                  </div>
                </section>
              </div>
              <div className="bottomgrid">
                <section className="panel records">
                  <div className="panelhead">
                    <h3>
                      观测记录连续性 <span>{station.name}</span>
                    </h3>
                    <TimeRange range={range} setRange={setRange} />
                  </div>
                  <RecordBands s={s} sid={sid} range={range} />
                </section>
                <section className="panel progress">
                  <div className="panelhead">
                    <h3>维护进展</h3>
                    <button
                      className="textbutton"
                      onClick={() => setPage("维护任务")}
                    >
                      全部任务
                      <ChevronRight size={14} />
                    </button>
                  </div>
                  {currentTasks.map((t) => (
                    <button
                      className="taskpreview"
                      key={t.id}
                      onClick={() =>
                        focus(
                          s.incidents.find((i) => i.id === t.incidentId)!,
                          "维护任务",
                        )
                      }
                    >
                      <div>
                        <b>{t.name}</b>
                        <Badge good={t.status === "确认完成"}>{t.status}</Badge>
                      </div>
                      <p>
                        {t.owner || "待安排负责人"} · {t.priority}
                      </p>
                      <small>
                        {t.records.at(-1)?.text || "等待安排任务与核对处理依据"}
                      </small>
                    </button>
                  ))}
                  {!currentTasks.length && (
                    <div className="notask">
                      <ClipboardList size={27} />
                      <div>
                        <b>暂无维护任务</b>
                        <p>核查问题后，安排有依据的维护</p>
                      </div>
                      {selectedInc[0] && (
                        <button onClick={() => focus(selectedInc[0])}>
                          开始排查
                          <ChevronRight size={14} />
                        </button>
                      )}
                    </div>
                  )}
                </section>
              </div>
            </>
          ) : page === "异常提醒" ? (
            <section className="panel workspace">
              <div className="panelhead">
                <h3>事件列表 · {onlyOpen ? "未关闭异常" : "全部事件"}</h3>
                <div className="segmented">
                  {[true, false].map((v) => (
                    <button
                      key={String(v)}
                      className={v === onlyOpen ? "on" : ""}
                      onClick={() => setOnlyOpen(v)}
                    >
                      {v ? "未关闭" : "含已关闭"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="eventgrid">
                {s.incidents
                  .filter((i) => !onlyOpen || i.status !== "已关闭")
                  .map((i) => (
                    <button
                      className="eventcard"
                      key={i.id}
                      onClick={() => focus(i)}
                    >
                      <Badge good={i.status === "已关闭"}>{i.status}</Badge>
                      <h3>{i.title}</h3>
                      <p>
                        站点{i.stationId} ·{" "}
                        {s.devices.find((d) => d.id === i.deviceId)?.name}
                      </p>
                      <p>发现：{i.found}</p>
                      <p>提醒对象：{i.recipients.join("、")}</p>
                      <span className="blueText">查看核查证据与处理流程 →</span>
                    </button>
                  ))}
              </div>
              {!s.incidents.some((i) => !onlyOpen || i.status !== "已关闭") && (
                <div className="empty">
                  当前没有未关闭异常，可切换“含已关闭”查看历史记录。
                </div>
              )}
              <div className="bluenote">
                <Info size={16} />
                当前提醒仅关联本地角色，所有内容均为模拟数据。
              </div>
            </section>
          ) : page === "辅助排查" ? (
            <>
              <Context s={s} incident={incident} focus={focus} />
              <Investigation
                key={iid}
                s={s}
                i={incident}
                range={range}
                setRange={setRange}
                act={act}
              />
              <div className="actionbar">
                <span>核查结果保存在当前事件中，未知信息不会默认正常。</span>
                <button
                  className="primary"
                  onClick={() => {
                    if (task || act({ type: "create", id: iid }))
                      setPage("维护任务");
                  }}
                >
                  {task ? "查看维护任务" : "创建维护任务"}
                  <ChevronRight size={16} />
                </button>
              </div>
            </>
          ) : (
            <>
              <section className="panel taskselector">
                <h3>
                  {page === "恢复检查" ? "待复查与历史任务" : "维护任务列表"}
                </h3>
                {s.tasks.length ? (
                  s.tasks
                    .filter(
                      (t) =>
                        page !== "恢复检查" ||
                        t.status === "恢复复查" ||
                        t.status === "确认完成" ||
                        t.checks.some((c) => c.result === "未通过"),
                    )
                    .map((t) => (
                      <button
                        className={iid === t.incidentId ? "on" : ""}
                        key={t.id}
                        onClick={() => {
                          setIid(t.incidentId);
                          setSid(t.stationId);
                        }}
                      >
                        站点{t.stationId} · {t.name}
                        <Badge good={t.status === "确认完成"}>{t.status}</Badge>
                      </button>
                    ))
                ) : (
                  <p>暂无任务。请先进入辅助排查并创建维护任务。</p>
                )}
                {page === "恢复检查" &&
                  !s.tasks.some((t) => t.status === "恢复复查") && (
                    <span className="muted">当前无待复查任务</span>
                  )}
              </section>
              {task ? (
                <>
                  <Context s={s} incident={incident} focus={focus} />
                  <Maintenance
                    key={task.id + task.status}
                    s={s}
                    i={incident}
                    act={act}
                  />
                </>
              ) : (
                <div className="empty panel">
                  <ClipboardList size={40} />
                  <h3>当前事件尚未创建维护任务</h3>
                  <button
                    className="primary"
                    onClick={() => setPage("辅助排查")}
                  >
                    前往辅助排查
                  </button>
                </div>
              )}
            </>
          )}
          <footer>
            <span>
              <Leaf size={14} />
              生态观测 · 连续记录 · 有据维护
            </span>
            <span>所有站点与观测数据均为模拟数据</span>
            <button onClick={() => setModal("试点")}>
              试点评价说明
              <ArrowUpRight size={13} />
            </button>
          </footer>
        </main>
        {toast && (
          <div className="toast" role="status">
            <CheckCircle2 size={18} />
            {toast}
          </div>
        )}
        {modal && (
          <div className="overlay" onClick={() => setModal("")}>
            <div
              className="modal"
              role="dialog"
              aria-modal="true"
              aria-label={modal}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="panelhead">
                <h3>
                  {modal === "场景"
                    ? "选择演示场景"
                    : modal === "重置"
                      ? "重置演示"
                      : "试点评价说明"}
                </h3>
                <button aria-label="关闭弹窗" onClick={() => setModal("")}>
                  <X size={19} />
                </button>
              </div>
              {modal === "场景" ? (
                <>
                  <p className="muted">
                    聚焦对应站点与事件，保留其他场景的处理进度。
                  </p>
                  {s.incidents.map((i, j) => (
                    <button
                      className="scenario"
                      key={i.id}
                      onClick={() =>
                        focus(i, j === 0 ? "站点总览" : "辅助排查")
                      }
                    >
                      <span>0{j + 1}</span>
                      <div>
                        <h3>
                          {
                            [
                              "观测记录缺口排查",
                              "LI-7500DS窗口污染",
                              "255-700E供水异常",
                            ][j]
                          }
                        </h3>
                        <p>
                          站点{i.stationId} · {i.title}
                        </p>
                      </div>
                      <ChevronRight />
                    </button>
                  ))}
                </>
              ) : modal === "重置" ? (
                <>
                  <p>
                    将清除本地核查、任务和复查记录，恢复三个事件均待核查的初始模拟状态。
                  </p>
                  <div className="actions">
                    <button onClick={() => setModal("")}>取消</button>
                    <button
                      className="primary"
                      onClick={() => {
                        setS(initialState());
                        setSid("B");
                        setIid("INC-B");
                        setPage("站点总览");
                        setFilter("全部");
                        setSearch("");
                        setModal("");
                        setToast("已恢复初始模拟状态");
                      }}
                    >
                      确认重置演示
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <Badge>试点结果待补充</Badge>
                  {[
                    [
                      "有效观测比例",
                      "需要应有记录数量、统一质量要求及逐条质量检查结果。",
                    ],
                    [
                      "异常发现时间",
                      "需要异常实际起点与首次发现记录；起点未知时单独说明。",
                    ],
                    [
                      "平均恢复时间",
                      "需要异常发现、维护任务和观测恢复复查时间。",
                    ],
                    [
                      "人工巡检与维护投入",
                      "需要巡检、排查、处置和复查的人次与工时记录。",
                    ],
                  ].map(([a, b]) => (
                    <div className="pilot" key={a}>
                      <h4>{a}</h4>
                      <p>{b}</p>
                    </div>
                  ))}
                  <p className="bluenote">
                    同类任务、相近条件、统一口径进行比较。演示数据不用于推导真实成效。
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </ThemeContext.Provider>
  );
}
function TimeRange({
  range,
  setRange,
}: {
  range: string;
  setRange: (x: string) => void;
}) {
  return (
    <select
      aria-label="时间范围"
      value={range}
      onChange={(e) => setRange(e.target.value)}
    >
      <option value="24">近24小时</option>
      <option value="12">近12小时</option>
      <option value="6">近6小时</option>
    </select>
  );
}
function RecordBands({
  s,
  sid,
  range,
}: {
  s: State;
  sid: string;
  range: string;
}) {
  return (
    <div className="recordbody">
      <div className="legend">
        <span>
          <i className="square" />
          已有记录
        </span>
        <span>
          <i className="square restored" />
          站内补传
        </span>
        <span>
          <i className="square missing" />
          缺口
        </span>
        <span>
          <i className="square unchecked" />
          待检查 / 质量风险
        </span>
      </div>
      {s.observations
        .filter((o) => o.stationId === sid)
        .map((o) => (
          <div className="bandrow" key={o.id}>
            <span>{o.name}</span>
            <div className="band">
              {s.series
                .filter(
                  (r) => r.taskId === o.id && r.hour >= 24 - Number(range),
                )
                .map((r) => (
                  <div
                    tabIndex={0}
                    className={
                      "bar " +
                      (r.record === "记录缺口"
                        ? "missing"
                        : r.record === "补传记录"
                          ? "restored"
                          : "") +
                      (r.quality !== "已检查" && r.record !== "记录缺口"
                        ? " unchecked"
                        : "")
                    }
                    key={r.id}
                  >
                    <div className="tooltip">
                      10-12 {String(r.hour).padStart(2, "0")}:00–
                      {String(r.hour + 1).padStart(2, "0")}:00
                      <br />
                      {r.record} · {r.quality}
                      <br />
                      {r.source}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))}
      <div className="bandaxis">
        <span>10-12 {24 - Number(range)}:00</span>
        <span>固定演示观测日 · 历史质量标记保留</span>
        <span>10-13 00:00</span>
      </div>
    </div>
  );
}
function Context({
  s,
  incident: i,
  focus,
}: {
  s: State;
  incident: Incident;
  focus: (i: Incident, p?: string) => void;
}) {
  return (
    <div className="context">
      <div>
        <span className="eyebrow">{i.id} / 事件上下文</span>
        <h3>
          站点{i.stationId}
          <span className="divider">/</span>
          {i.title}
          <Badge good={i.status === "已关闭"}>{i.status}</Badge>
        </h3>
        <p>
          {s.devices.find((d) => d.id === i.deviceId)?.name} ·{" "}
          {s.observations
            .filter((o) => i.taskIds.includes(o.id))
            .map((o) => o.name)
            .join("、")}
        </p>
      </div>
      <select
        aria-label="切换事件"
        value={i.id}
        onChange={(e) =>
          focus(s.incidents.find((x) => x.id === e.target.value)!)
        }
      >
        {s.incidents.map((x) => (
          <option key={x.id} value={x.id}>
            站点{x.stationId} · {x.title}
          </option>
        ))}
      </select>
    </div>
  );
}
function DeviceChart({
  s,
  i,
  range,
}: {
  s: State;
  i: Incident;
  range: string;
}) {
  useTheme();
  const palette = readVisualPalette();
  const t = s.tasks.find((t) => t.incidentId === i.id);
  const recovered = t?.status === "确认完成";
  const optical = i.kind === "optical";
  const labels = Array.from(
    { length: 24 },
    (_, j) => `${String(j).padStart(2, "0")}:00`,
  );
  const vals = s.series
    .filter((r) => i.taskIds.includes(r.taskId))
    .sort((a, b) => a.hour - b.hour)
    .map((r) => r.value ?? 0);
  const count = Number(range);
  const xs = labels.slice(-count);
  const vs = vals.slice(-count);
  if (t?.maintenanceHour) {
    xs.push("维护");
    vs.push(vals[23]);
    if (recovered) {
      xs.push("观察+30分", "观察+60分", "观察+90分");
      vs.push(...(optical ? [79, 85, 83] : [3.6, 3.8, 4.0]));
    }
  }
  return (
    <Chart
      option={{
        animation: false,
        grid: { left: 45, right: 22, top: 35, bottom: 35 },
        backgroundColor: "transparent",
        textStyle: {
          color: palette.muted,
          fontFamily: '"PingFang SC", sans-serif',
        },
        tooltip: {
          trigger: "axis",
          backgroundColor: palette.surface,
          borderColor: palette.border,
          textStyle: { color: palette.text },
        },
        xAxis: {
          type: "category",
          data: xs,
          boundaryGap: false,
          axisLabel: { color: palette.muted, fontSize: 10 },
          axisLine: { lineStyle: { color: palette.border } },
          axisTick: { lineStyle: { color: palette.border } },
        },
        yAxis: {
          type: "value",
          name: optical ? "模拟相对值" : "模拟累计值 / mm",
          nameTextStyle: { fontSize: 10, color: palette.muted },
          axisLabel: { color: palette.muted },
          min: optical ? 30 : 2,
          splitLine: { lineStyle: { color: palette.chartGrid } },
        },
        series: [
          {
            type: "line",
            data: vs,
            step: optical ? false : "end",
            symbolSize: 5,
            lineStyle: { color: palette.accent, width: 3 },
            itemStyle: { color: palette.accent },
            areaStyle: {
              color: optical ? palette.chartArea : palette.chartAreaAlt,
            },
            markArea: {
              silent: true,
              itemStyle: { color: palette.chartWarningArea },
              label: { color: palette.warning },
              data: [
                [
                  {
                    name: optical ? "历史质量风险" : "历史停测待核查",
                    xAxis: xs.includes(optical ? "07:00" : "16:00")
                      ? optical
                        ? "07:00"
                        : "16:00"
                      : xs[0],
                  },
                  { xAxis: "23:00" },
                ],
              ],
            },
            markLine: t?.maintenanceHour
              ? {
                  symbol: "none",
                  data: [
                    {
                      xAxis: "维护",
                      label: { formatter: "维护记录", color: palette.success },
                      lineStyle: { color: palette.success },
                    },
                  ],
                }
              : undefined,
          },
        ],
      }}
    />
  );
}
function Investigation({
  s,
  i,
  range,
  setRange,
  act,
}: {
  s: State;
  i: Incident;
  range: string;
  setRange: (x: string) => void;
  act: (c: Command) => boolean;
}) {
  const [result, setResult] = useState(""),
    [note, setNote] = useState(""),
    [follow, setFollow] = useState("");
  const gap = i.kind === "gap",
    optical = i.kind === "optical";
  const ev = s.evidence.filter((e) => e.incidentId === i.id);
  const step = gap ? "站内原始记录" : optical ? "光学窗口" : "现场储水";
  const last = ev.filter((e) => e.step === step).at(-1);
  const options = gap
    ? ["记录完整", "记录有缺口", "暂无法确认"]
    : optical
      ? ["发现污迹", "存在水滴", "未见明显异常", "暂无法确认"]
      : ["确认储水耗尽", "储水充足", "暂无法确认"];
  const known = gap
    ? [
        "气象采集设备当前在线",
        "平台气象记录08:00–12:00有缺口",
        "土壤水分记录连续",
      ]
    : optical
      ? [
          "设备仍在输出数据",
          "光学信号出现持续走低趋势",
          "相关碳水观测存在质量风险",
        ]
      : [
          "累计值较长时间不增长",
          "同期气象：日照充足，26℃，湿度48%，风速2.1m/s（模拟）",
          "水位信息来源：人工现场检查",
        ];
  return (
    <div className="investigation">
      <section className="panel">
        <div className="sectiontitle">
          <span>01</span>
          <div>
            <h3>发现了什么</h3>
            <p>把相关现象放在一起</p>
          </div>
        </div>
        {known.map((x, j) => (
          <div className="fact" key={x}>
            <span className={"dot " + (j === 0 ? "green" : "orange")} />
            {x}
          </div>
        ))}
        {gap ? (
          <>
            <div className="panelhead">
              <h4>平台记录情况</h4>
              <TimeRange range={range} setRange={setRange} />
            </div>
            <RecordBands s={s} sid={i.stationId} range={range} />
            <div className="bluenote">先确认缺口出现在哪里，再判断原因。</div>
          </>
        ) : (
          <>
            <div className="panelhead">
              <h4>{optical ? "光学信号强度示意" : "参考蒸散累计计量"}</h4>
              <TimeRange range={range} setRange={setRange} />
            </div>
            <DeviceChart s={s} i={i} range={range} />
            {optical ? (
              <div className="deviceinfo">
                <img
                  src="/assets/optical-window.png"
                  alt="PPT参考：光学窗口局部，非现场核查照片"
                />
                <div>
                  <b>LI-7500DS · 光学窗口局部参考</b>
                  <p>诊断：信号走低待核查；窗口污染、水滴等影响需现场确认。</p>
                </div>
              </div>
            ) : (
              <>
                <div className="supply">
                  <div>
                    <span className="reservoir full" />
                    <div>
                      <b>正常供水</b>
                      <small>储水 → 供水管 → 蒸发面</small>
                    </div>
                  </div>
                  <div>
                    <span className="reservoir" />
                    <div>
                      <b>缺水示意</b>
                      <small>储水耗尽 → 供水中断</small>
                    </div>
                  </div>
                </div>
                <p className="muted">
                  供水关系示意，非设备结构剖面。水位：
                  {last?.result || "水位待核查"}；来源：人工现场检查。
                </p>
              </>
            )}
            <p className="quietnote">
              {optical
                ? "相对信号用于趋势演示，不代表厂家统一阈值；不推导全部碳通量正确。"
                : "停测时段保留标记，不自动补回未测得的蒸散量；参考蒸散不等于生态系统实际蒸散。"}
            </p>
          </>
        )}
      </section>
      <section className="panel">
        <div className="sectiontitle">
          <span>02</span>
          <div>
            <h3>建议怎么查</h3>
            <p>先分清情况，再缩小范围</p>
          </div>
        </div>
        <div className="checkintro">
          <h3>
            {gap
              ? "先核对站内原始记录"
              : optical
                ? "检查光学窗口，并排查水滴等影响"
                : "结合气象条件，现场检查储水与供水"}
          </h3>
          <p>
            {gap
              ? "查看同一时段，站内是否保存了完整记录。"
              : optical
                ? "查看光学窗口有无污迹、水滴或其他遮挡，结合设备诊断与数据质量检查。"
                : "查看储水量和供水状态，核对供电与采集运行。"}
          </p>
          <strong>为什么先查</strong>
          <p>
            {gap
              ? "分清是记录尚未传到平台，还是站内记录本身有缺口。"
              : optical
                ? "信号变化只能提示检查方向，不能直接确认污染物或唯一原因。"
                : "累计平台期不一定表示蒸散减弱，需要先确认供水及现场条件。"}
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (act({ type: "evidence", id: i.id, step, result, note })) {
              setResult("");
              setNote("");
            }
          }}
        >
          <h4>
            提交现场核查结果 <span className="required">必选</span>
          </h4>
          <div className="choices">
            {options.map((x) => (
              <label className={result === x ? "picked" : ""} key={x}>
                <input
                  type="radio"
                  name="result"
                  required
                  checked={result === x}
                  onChange={() => setResult(x)}
                  disabled={i.status === "已关闭"}
                />
                {x}
              </label>
            ))}
          </div>
          <label className="field">
            补充说明
            <textarea
              placeholder="记录核查时段、现场现象或仍缺少的信息"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <button
            className="primary"
            disabled={!result || i.status === "已关闭"}
          >
            保存核查结果
          </button>
          {!result && (
            <small className="muted">
              请选择实际核查结果，不默认选中答案。
            </small>
          )}
        </form>
        {last && (
          <div className="followup">
            <h4>下一步建议</h4>
            <p>
              {gap
                ? last.result === "记录完整"
                  ? "检查对应时段上传结果，核对是否延迟或未完成。"
                  : last.result === "记录有缺口"
                    ? "检查采集情况，真实不存在的记录继续保留缺口。"
                    : "仍待核查：补充站内同一时段原始记录。"
                : optical
                  ? last.result === "发现污迹"
                    ? "安排人员按厂家要求清洁窗口，之后分别检查窗口、诊断与新增数据。"
                    : last.result === "存在水滴"
                      ? "按厂家要求处理水滴影响，再核对诊断与新增数据。"
                      : "继续核查诊断、窗口与环境影响，暂不确定原因。"
                  : last.result === "确认储水耗尽"
                    ? "按说明书补充蒸馏水、充水排气并恢复供水。"
                    : "继续检查供水、供电与采集情况，不提前认定缺水。"}
            </p>
            {gap && last.result !== "暂无法确认" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (
                    act({
                      type: "evidence",
                      id: i.id,
                      step:
                        last.result === "记录完整" ? "上传情况" : "采集情况",
                      result: follow,
                      note: "",
                    })
                  )
                    setFollow("");
                }}
              >
                <input
                  aria-label="后续核查结果"
                  required
                  placeholder="填写上传或采集核查结果"
                  value={follow}
                  onChange={(e) => setFollow(e.target.value)}
                />
                <button disabled={i.status === "已关闭"}>保存后续核查</button>
              </form>
            )}
          </div>
        )}
      </section>
      <section className="panel evidence">
        <div className="sectiontitle">
          <span>03</span>
          <div>
            <h3>判断依据是什么</h3>
            <p>已知与待查分开展示</p>
          </div>
        </div>
        <h4>已掌握的信息</h4>
        {known.map((x, j) => (
          <p key={x}>
            <CheckCircle2 size={15} />
            {x}
            <small>{j === 0 ? "设备信息" : "平台记录"} · 模拟</small>
          </p>
        ))}
        <h4>还需要核查的信息</h4>
        <div className="pending">
          <Info size={16} />
          {!last || last.result === "暂无法确认"
            ? `${step}仍待现场确认`
            : "后续维护效果与新增观测质量仍需逐项复查"}
        </div>
        <h4>
          已提交核查证据 <span className="muted">{ev.length} 条</span>
        </h4>
        {ev.length ? (
          ev.map((e) => (
            <div className="evidenceitem" key={e.id}>
              <b>
                {e.step} · {e.result}
              </b>
              <p>{e.note || "未填写补充说明"}</p>
              <small>
                {e.time} · {e.source}
              </small>
            </div>
          ))
        ) : (
          <div className="empty">尚未提交核查结果</div>
        )}
        <div className="bluenote">
          {i.status === "已关闭"
            ? "本次复查范围内已恢复，历史质量标记保留。"
            : "当前结论：按已有证据推进核查，不提前认定唯一根因。"}
        </div>
      </section>
    </div>
  );
}
function Maintenance({
  s,
  i,
  act,
}: {
  s: State;
  i: Incident;
  act: (c: Command) => boolean;
}) {
  const t = s.tasks.find((t) => t.incidentId === i.id)!;
  const [owner, setOwner] = useState(t.owner),
    [executor, setExecutor] = useState(t.executor),
    [priority, setPriority] = useState(t.priority),
    [reason, setReason] = useState(t.reason),
    [record, setRecord] = useState(""),
    [backfill, setBackfill] = useState(false),
    [scope, setScope] = useState(t.scope);
  const [notes, setNotes] = useState(t.checks.map((c) => c.note));
  const allowedBackfill =
    i.kind === "gap" &&
    s.evidence
      .filter((e) => e.incidentId === i.id && e.step === "站内原始记录")
      .at(-1)?.result === "记录完整";
  const ready =
    t.status === "恢复复查" &&
    t.checks.every((c) => c.result === "通过") &&
    !!t.scope.trim();
  return (
    <>
      <div className="stepper">
        {["安排任务", "执行处理", "恢复复查", "确认完成"].map((step, j) => (
          <div className={t.status === step ? "current" : ""} key={step}>
            <span>{j + 1}</span>
            {step}
            {j < 3 && <ChevronRight size={19} />}
          </div>
        ))}
      </div>
      <div className="maintenance">
        <section className="panel">
          <div className="panelhead">
            <h3>{t.name}</h3>
            <Badge good={t.status === "确认完成"}>{t.status}</Badge>
          </div>
          <div className="taskmeta">
            任务 {t.id} · 关联 {i.id}
            <br />
            受影响观测：
            {s.observations
              .filter((o) => t.taskIds.includes(o.id))
              .map((o) => o.name)
              .join("、")}
            <br />
            携带核查证据：{t.evidenceIds.length} 条
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              act({
                type: "assign",
                id: i.id,
                owner,
                executor,
                priority,
                reason,
              });
            }}
          >
            <div className="formgrid">
              <label className="field">
                任务负责人 *
                <select
                  aria-label="任务负责人"
                  value={owner}
                  disabled={t.status !== "安排任务"}
                  onChange={(e) => setOwner(e.target.value)}
                  required
                >
                  <option value="">请选择</option>
                  {["站点负责人", "运维人员", "数据审核人员"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                执行人员 *
                <select
                  aria-label="执行人员"
                  value={executor}
                  disabled={t.status !== "安排任务"}
                  onChange={(e) => setExecutor(e.target.value)}
                  required
                >
                  <option value="">请选择</option>
                  {["运维人员", "站点负责人", "数据审核人员"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field">
              处理优先级
              <select
                aria-label="处理优先级"
                value={priority}
                disabled={t.status !== "安排任务"}
                onChange={(e) => setPriority(e.target.value)}
              >
                {["优先处理", "常规处理", "紧急处理"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label className="field">
              安排依据 *
              <textarea
                aria-label="安排依据"
                required
                value={reason}
                disabled={t.status !== "安排任务"}
                onChange={(e) => setReason(e.target.value)}
                placeholder="结合观测影响、核查证据和现场条件填写"
              />
            </label>
            {t.status === "安排任务" && (
              <div className="actions">
                <button>保存任务安排</button>
                <button
                  type="button"
                  className="primary"
                  disabled={!t.owner || !t.executor || !t.reason}
                  onClick={() => act({ type: "start", id: i.id })}
                >
                  开始处理
                </button>
              </div>
            )}
            {t.status === "安排任务" && (
              <small className="muted">
                保存负责人、执行人员与安排依据后可以开始处理。
              </small>
            )}
          </form>
          <h4 className="subheading">处理记录</h4>
          {t.records.map((r, j) => (
            <div className="evidenceitem" key={j}>
              <b>{r.text}</b>
              <small>
                {r.time} · {r.role}
              </small>
            </div>
          ))}
          {t.status === "执行处理" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (act({ type: "record", id: i.id, text: record, backfill })) {
                  setRecord("");
                  setBackfill(false);
                }
              }}
            >
              <label className="field">
                新增处理记录 *
                <textarea
                  aria-label="新增处理记录"
                  required
                  value={record}
                  onChange={(e) => setRecord(e.target.value)}
                  placeholder={
                    i.kind === "gap"
                      ? "记录检查上传、恢复上传及核对站内记录情况"
                      : i.kind === "optical"
                        ? "记录工作人员按厂家要求清洁窗口的情况"
                        : "记录按说明书补充蒸馏水、充水排气和恢复供水的情况"
                  }
                />
              </label>
              {i.kind === "gap" && (
                <label className="checkbox">
                  <input
                    type="checkbox"
                    disabled={!allowedBackfill}
                    checked={backfill}
                    onChange={(e) => setBackfill(e.target.checked)}
                  />
                  确认补传站内实际保存的08:00–12:00记录
                </label>
              )}
              {i.kind === "gap" && !allowedBackfill && (
                <small className="muted">
                  尚无“站内记录完整”证据，不允许补传缺口。
                </small>
              )}
              <div className="actions">
                <button>保存处理记录</button>
                <button
                  className="primary"
                  type="button"
                  disabled={!t.records.length}
                  onClick={() => act({ type: "review", id: i.id })}
                >
                  提交恢复复查
                </button>
              </div>
            </form>
          )}
          <div className="bluenote">
            <Info size={17} />
            {i.kind === "water"
              ? "按下补水按钮，不等于计量恢复。"
              : i.kind === "optical"
                ? "信号回升，不等于所有新增数据自动通过质量检查。"
                : "设备重新在线或填写维护记录，不能单独触发恢复通过。"}
          </div>
        </section>
        <section className="panel verification">
          <div className="panelhead">
            <h3>
              <ShieldCheck size={20} />
              恢复检查
            </h3>
            <span>数据审核人员</span>
          </div>
          <p className="muted">
            提交复查时推进90分钟模拟观察时间；逐项检查，未通过立即退回处理中。
          </p>
          {t.checks.map((c, j) => (
            <div className="verifyrow" key={c.name}>
              <div>
                <b>
                  {String(j + 1).padStart(2, "0")} · {c.name}
                </b>
                <Badge good={c.result === "通过"}>{c.result}</Badge>
              </div>
              <input
                aria-label={"检查说明" + (j + 1)}
                placeholder="填写本项检查依据（可选）"
                disabled={t.status !== "恢复复查"}
                value={notes[j]}
                onChange={(e) =>
                  setNotes(notes.map((x, k) => (k === j ? e.target.value : x)))
                }
              />
              <div className="verifybuttons">
                {(["通过", "未通过", "尚未检查"] as Result[]).map((r) => (
                  <button
                    key={r}
                    disabled={t.status !== "恢复复查"}
                    className={c.result === r ? "selected" : ""}
                    onClick={() =>
                      act({
                        type: "check",
                        id: i.id,
                        index: j,
                        result: r,
                        note: notes[j],
                      })
                    }
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <label className="field">
            复查范围 *
            <textarea
              aria-label="复查范围"
              value={scope}
              disabled={t.status !== "恢复复查"}
              placeholder="填写复查时段、对应记录与新增观测范围"
              onChange={(e) => setScope(e.target.value)}
            />
          </label>
          {t.status === "恢复复查" && (
            <button onClick={() => act({ type: "scope", id: i.id, scope })}>
              保存复查范围
            </button>
          )}
          <div className="actions">
            <button
              className="primary"
              disabled={!ready}
              onClick={() => act({ type: "finish", id: i.id })}
            >
              确认完成
            </button>
            {t.status === "恢复复查" && (
              <button onClick={() => act({ type: "return", id: i.id })}>
                退回继续处理
              </button>
            )}
          </div>
          <p className="muted">
            {t.status === "确认完成"
              ? t.conclusion
              : "完成条件：所有必需项目通过，并保存复查范围。"}
          </p>
          {i.kind === "gap" ? (
            <RecordBands s={s} sid={i.stationId} range="24" />
          ) : (
            <DeviceChart s={s} i={i} range="24" />
          )}
        </section>
      </div>
      <section className="panel audit">
        <div className="panelhead">
          <h3>
            <Clock size={17} />
            操作记录与最终结论
          </h3>
          <span>统一模拟时间线</span>
        </div>
        {s.logs
          .filter((l) => l.incidentId === i.id)
          .slice()
          .reverse()
          .map((l) => (
            <div className="log" key={l.id}>
              <time>{l.time}</time>
              <span>{l.role}</span>
              <p>{l.action}</p>
            </div>
          ))}
      </section>
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
