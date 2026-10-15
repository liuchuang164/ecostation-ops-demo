import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Maximize2,
  Minimize2,
  Plus,
  Minus,
  LocateFixed,
  Scan,
  X,
  MapPin,
  RotateCcw,
  Info,
} from "lucide-react";
import Map from "ol/Map";
import View from "ol/View";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import Overlay from "ol/Overlay";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import {
  defaults as defaultControls,
  Attribution,
  ScaleLine,
} from "ol/control";
import { Fill, Stroke, Style, Text, Circle as CircleStyle } from "ol/style";
import { fromLonLat } from "ol/proj";
import { boundingExtent, isEmpty } from "ol/extent";
import type { Station } from "./model";
import { useTheme, readVisualPalette, type ThemeId } from "./theme";
import { validateStationCoordinate } from "./stationCoordinates";
import {
  BASEMAP_MODE,
  createBasemapLayers,
  loadLocalBasemap,
  VIEW_PROJECTION,
} from "./mapBasemap";
import "ol/ol.css";
import "./stationMap.css";

type StationStatus = "normal" | "attention" | "unknown";
interface Props {
  stations: Station[];
  visibleStationIds: string[];
  selectedId: string;
  locationRequest: number;
  getStatus: (id: string) => StationStatus;
  getIncident: (id: string) => string | null;
  onSelect: (id: string) => void;
  onViewDetails: () => void;
}
const statusLabels: Record<StationStatus, string> = {
  normal: "观测正常",
  attention: "需要关注",
  unknown: "状态待确认",
};

export function StationMap(props: Props) {
  const theme = useTheme();
  const palette = readVisualPalette();
  const paletteRef = useRef(palette);
  paletteRef.current = palette;
  const applyMapColors = useRef<(theme: ThemeId) => void>(() => undefined);
  const pointColor = (status: StationStatus) =>
    status === "normal"
      ? palette.success
      : status === "attention"
        ? palette.warning
        : palette.mapUnknown;
  const currentProps = useRef(props);
  currentProps.current = props;
  const [expanded, setExpanded] = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);
  const [popupHost] = useState(() => document.createElement("div"));
  const [baseStatus, setBaseStatus] = useState<
    "loading" | "online" | "fallback" | "local"
  >(BASEMAP_MODE === "local" ? "local" : "loading");
  const [localReady, setLocalReady] = useState(false);
  const [localError, setLocalError] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const sourceRef = useRef<VectorSource<Feature<Point>> | null>(null);
  const layerRef = useRef<VectorLayer<VectorSource<Feature<Point>>> | null>(
    null,
  );
  const overlayRef = useRef<Overlay | null>(null);
  const expandRef = useRef<HTMLButtonElement>(null);
  const shrinkRef = useRef<HTMLButtonElement>(null);
  const retryRef = useRef<() => void>(() => undefined);
  const nativeActive = useRef(false);
  const selectionRef = useRef({
    id: props.selectedId,
    request: props.locationRequest,
  });

  const visibleKey = [...props.visibleStationIds].sort().join("|");
  const coordinatesKey = props.stations
    .map((station) =>
      [
        station.id,
        station.longitude,
        station.latitude,
        station.coordinateSystem,
      ].join(":"),
    )
    .join("|");
  const visible = props.stations.filter((station) =>
    props.visibleStationIds.includes(station.id),
  );
  const unavailable = visible.filter(
    (station) => !validateStationCoordinate(station).valid,
  );
  const visibleValid = visible.filter(
    (station) => validateStationCoordinate(station).valid,
  );
  const selected = props.stations.find(
    (station) => station.id === props.selectedId,
  );
  const selectedLocation = selected
    ? validateStationCoordinate(selected)
    : null;
  const selectedVisible = props.visibleStationIds.includes(props.selectedId);
  const selectedStatus = props.getStatus(props.selectedId);

  const fitVisible = (animate = true) => {
    const map = mapRef.current;
    const source = sourceRef.current;
    if (!map || !source || !source.getFeatures().length) return;
    const extent = source.getExtent();
    if (!extent || isEmpty(extent)) return;
    map.getView().cancelAnimations();
    map.getView().fit(extent, {
      padding: [40, 48, 55, 48],
      maxZoom: source.getFeatures().length === 1 ? 12 : 11,
      duration: animate ? 350 : 0,
    });
  };
  const locateSelected = () => {
    const station = currentProps.current.stations.find(
      (station) => station.id === currentProps.current.selectedId,
    );
    if (
      !station ||
      !currentProps.current.visibleStationIds.includes(station.id)
    )
      return;
    const location = validateStationCoordinate(station);
    if (!location.valid) return;
    const map = mapRef.current;
    if (!map) return;
    setPopupOpen(true);
    map.getView().cancelAnimations();
    map.getView().animate(
      {
        center: fromLonLat(location.position, VIEW_PROJECTION),
        zoom: Math.max(map.getView().getZoom() || 10, 11),
        duration: 350,
      },
      (completed) => {
        if (completed)
          overlayRef.current?.panIntoView({
            margin: 20,
            animation: { duration: 180 },
          });
      },
    );
  };

  useEffect(() => {
    const target = targetRef.current!;
    const { localLayer, localSource, onlineLayer, onlineSource, applyColors } =
      createBasemapLayers();
    applyMapColors.current = applyColors;
    applyColors(theme);
    const source = new VectorSource<Feature<Point>>();
    const stationsLayer = new VectorLayer({
      source,
      declutter: true,
      style: (feature) => {
        const id = String(feature.getId());
        const status = currentProps.current.getStatus(id);
        const palette = paletteRef.current;
        const selected = id === currentProps.current.selectedId;
        const scale = (targetRef.current?.clientWidth || 0) >= 1250 ? 1.3 : 1;
        const styles = [];
        styles.push(
          new Style({
            image: new CircleStyle({
              declutterMode: "none",
              radius: (selected ? 8.5 : 6.5) * scale,
              fill: new Fill({
                color:
                  status === "normal"
                    ? palette.success
                    : status === "attention"
                      ? palette.warning
                      : palette.mapUnknown,
              }),
              stroke: new Stroke({
                color: selected ? palette.accent : palette.mapMarkerBorder,
                width: selected ? 3 : 2,
              }),
            }),
            text: new Text({
              text: feature.get("name"),
              offsetY: -22 * scale,
              font: `${selected ? "600" : "500"} ${Math.round(12 * scale)}px "PingFang SC", sans-serif`,
              fill: new Fill({
                color: selected ? palette.heading : palette.mapMarkerLabel,
              }),
              stroke: new Stroke({ color: palette.mapLabelHalo, width: 4 }),
              padding: [2, 3, 2, 3],
            }),
            zIndex: selected ? 21 : 10,
          }),
        );
        return styles;
      },
    });
    popupHost.className = "gis-popup-host";
    const overlay = new Overlay({
      element: popupHost,
      positioning: "bottom-center",
      offset: [0, -17],
      stopEvent: true,
      autoPan: false,
    });
    const map = new Map({
      target,
      layers: [localLayer, onlineLayer, stationsLayer],
      overlays: [overlay],
      controls: defaultControls({
        zoom: false,
        rotate: false,
        attribution: false,
      }).extend([
        new Attribution({ collapsible: false }),
        new ScaleLine({ units: "metric" }),
      ]),
      view: new View({
        projection: VIEW_PROJECTION,
        center: fromLonLat([119.95, 30.31], VIEW_PROJECTION),
        zoom: 10,
        minZoom: 3,
        maxZoom: 18,
        enableRotation: false,
      }),
    });
    mapRef.current = map;
    sourceRef.current = source;
    layerRef.current = stationsLayer;
    overlayRef.current = overlay;
    const initialCoordinates = currentProps.current.stations
      .filter((station) =>
        currentProps.current.visibleStationIds.includes(station.id),
      )
      .flatMap((station) => {
        const point = validateStationCoordinate(station);
        return point.valid ? [fromLonLat(point.position, VIEW_PROJECTION)] : [];
      });
    if (initialCoordinates.length)
      map.getView().fit(boundingExtent(initialCoordinates), {
        padding: [40, 48, 55, 48],
        maxZoom: initialCoordinates.length === 1 ? 12 : 11,
      });
    map.on("singleclick", (event) => {
      const feature = map.forEachFeatureAtPixel(
        event.pixel,
        (feature) => feature,
        { hitTolerance: 8, layerFilter: (layer) => layer === stationsLayer },
      );
      if (feature) {
        setPopupOpen(true);
        currentProps.current.onSelect(String(feature.getId()));
      } else setPopupOpen(false);
    });
    map.on("pointermove", (event) => {
      if (event.dragging) return;
      target.style.cursor = map.hasFeatureAtPixel(event.pixel, {
        hitTolerance: 8,
        layerFilter: (layer) => layer === stationsLayer,
      })
        ? "pointer"
        : "grab";
    });
    const resize = new ResizeObserver(() => {
      map.updateSize();
      stationsLayer.changed();
    });
    resize.observe(target);
    const abort = new AbortController();
    const reloadLocal = () => {
      setLocalError("");
      void loadLocalBasemap(localSource, abort.signal)
        .then(() => setLocalReady(true))
        .catch((error) => {
          if (!abort.signal.aborted) {
            setLocalReady(false);
            setLocalError(error.message);
          }
        });
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failed = false;
    let loaded = false;
    const fallback = () => {
      failed = true;
      onlineLayer.setVisible(false);
      setBaseStatus("fallback");
      if (timer) clearTimeout(timer);
    };
    const startOnline = () => {
      failed = false;
      loaded = false;
      sawTile = false;
      onlineLayer.setVisible(true);
      setBaseStatus("loading");
      onlineSource.refresh();
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (!loaded) fallback();
      }, 8000);
    };
    let sawTile = false;
    onlineSource.on("tileloadend", () => {
      if (!failed) sawTile = true;
    });
    map.on("rendercomplete", () => {
      if (sawTile && !failed && onlineLayer.getVisible()) {
        loaded = true;
        if (timer) clearTimeout(timer);
        setBaseStatus("online");
      }
    });
    onlineSource.on("tileloaderror", fallback);
    retryRef.current = () => {
      reloadLocal();
      if (BASEMAP_MODE !== "local") startOnline();
    };
    reloadLocal();
    if (BASEMAP_MODE !== "local") startOnline();
    // Development-only access lets browser QA inspect engine coordinates rather than pixels in a screenshot.
    if (import.meta.env.DEV) {
      map.set("stationSource", source);
      Object.defineProperty(target, "__ecostationMap", {
        value: map,
        configurable: true,
      });
    }
    return () => {
      abort.abort();
      if (timer) clearTimeout(timer);
      resize.disconnect();
      map.setTarget(undefined);
      map.dispose();
      mapRef.current = null;
      sourceRef.current = null;
      layerRef.current = null;
      overlayRef.current = null;
      if (import.meta.env.DEV)
        delete (target as HTMLDivElement & { __ecostationMap?: Map })
          .__ecostationMap;
    };
  }, []);

  useEffect(() => {
    const source = sourceRef.current;
    if (!source) return;
    source.clear();
    source.addFeatures(
      currentProps.current.stations
        .filter((station) =>
          currentProps.current.visibleStationIds.includes(station.id),
        )
        .flatMap((station) => {
          const point = validateStationCoordinate(station);
          if (!point.valid) return [];
          const feature = new Feature({
            geometry: new Point(fromLonLat(point.position, VIEW_PROJECTION)),
            name: station.name,
          });
          feature.setId(station.id);
          return [feature];
        }),
    );
    if (
      !currentProps.current.visibleStationIds.includes(
        currentProps.current.selectedId,
      )
    ) {
      overlayRef.current?.setPosition(undefined);
      setPopupOpen(false);
    }
  }, [visibleKey, coordinatesKey]);
  useEffect(() => {
    applyMapColors.current(theme);
    layerRef.current?.changed();
  }, [theme]);
  useEffect(() => {
    layerRef.current?.changed();
  });
  useEffect(() => {
    const previous = selectionRef.current;
    selectionRef.current = {
      id: props.selectedId,
      request: props.locationRequest,
    };
    if (
      previous.id !== props.selectedId ||
      previous.request !== props.locationRequest
    )
      locateSelected();
  }, [props.selectedId, props.locationRequest]);
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    if (!popupOpen || !selectedVisible || !selectedLocation?.valid) {
      overlay.setPosition(undefined);
      return;
    }
    overlay.setPosition(fromLonLat(selectedLocation.position, VIEW_PROJECTION));
    const frame = requestAnimationFrame(() => {
      if (!mapRef.current?.getView().getAnimating())
        overlay.panIntoView({ margin: 20, animation: { duration: 180 } });
    });
    return () => cancelAnimationFrame(frame);
  }, [popupOpen, props.selectedId, coordinatesKey, visibleKey]);

  const collapse = async () => {
    if (document.fullscreenElement === panelRef.current) {
      try {
        await document.exitFullscreen();
      } catch {
        /* Fixed viewport fallback remains closable. */
      }
    }
    setExpanded(false);
  };
  useEffect(() => {
    if (!expanded) return;
    nativeActive.current = Boolean(document.fullscreenElement);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    shrinkRef.current?.focus();
    const fullscreenChange = () => {
      if (document.fullscreenElement) nativeActive.current = true;
      else if (nativeActive.current) {
        nativeActive.current = false;
        setExpanded(false);
      }
      mapRef.current?.updateSize();
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        void collapse();
      }
      if (event.key === "Tab") {
        const controls = Array.from(
          panelRef.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], [tabindex="0"]',
          ) ?? [],
        );
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("fullscreenchange", fullscreenChange);
    document.addEventListener("keydown", keydown);
    if (panelRef.current?.requestFullscreen && !document.fullscreenElement)
      void panelRef.current.requestFullscreen().catch(() => undefined);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("fullscreenchange", fullscreenChange);
      document.removeEventListener("keydown", keydown);
      nativeActive.current = false;
      requestAnimationFrame(() => expandRef.current?.focus());
    };
  }, [expanded]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      mapRef.current?.updateSize();
      overlayRef.current?.panIntoView({ margin: 20 });
    });
    return () => cancelAnimationFrame(frame);
  }, [expanded]);

  const hiddenSelected = !selectedVisible;
  const coordinateIssue =
    selectedLocation && !selectedLocation.valid
      ? selectedLocation.reason
      : null;
  const hasMock = visible.some((station) => station.isMock);
  return (
    <>
      <div className="stationmap-placeholder" hidden={!expanded} />
      <div
        className={`stationmap gis-stationmap${expanded ? " is-expanded" : ""}`}
        ref={panelRef}
        role={expanded ? "dialog" : undefined}
        aria-modal={expanded ? true : undefined}
        aria-label={expanded ? "站点地图全屏展示" : "站点分布与运行状态"}
      >
        <div className="panelhead maphead">
          <div className="mapheading">
            <h3>站点分布与运行状态</h3>
            {expanded && <span>演示数据｜功能演示</span>}
          </div>
          <div className="maptools">
            <div className="legend">
              <span>
                <i className="dot green" />
                正常
              </span>
              <span>
                <i className="dot orange" />
                需关注
              </span>
            </div>
            <button
              ref={expanded ? shrinkRef : expandRef}
              className="map-size-button"
              aria-label={expanded ? "缩小并返回总览" : "放大站点地图"}
              aria-expanded={expanded}
              onClick={() => (expanded ? void collapse() : setExpanded(true))}
            >
              {expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
              <span>{expanded ? "缩小返回" : "全屏"}</span>
            </button>
          </div>
        </div>
        <div className="gis-map-shell">
          <div
            className="gis-map-target"
            ref={targetRef}
            tabIndex={0}
            aria-label="二维GIS站点地图，可拖动平移和缩放"
          />
          <div className="gis-coordinate-badge">
            <MapPin size={13} />
            {hasMock ? "模拟站点位置" : "站点坐标分布"}
            <span>WGS84</span>
          </div>
          <div className="gis-controls">
            <button
              aria-label="地图放大一级"
              title="放大一级"
              onClick={() => {
                const view = mapRef.current?.getView();
                if (view)
                  view.animate({
                    zoom: Math.min((view.getZoom() || 10) + 1, 18),
                    duration: 200,
                  });
              }}
            >
              <Plus size={17} />
            </button>
            <button
              aria-label="地图缩小一级"
              title="缩小一级"
              onClick={() => {
                const view = mapRef.current?.getView();
                if (view)
                  view.animate({
                    zoom: Math.max((view.getZoom() || 10) - 1, 3),
                    duration: 200,
                  });
              }}
            >
              <Minus size={17} />
            </button>
            <button
              aria-label="查看全部站点"
              title="查看全部筛选站点"
              disabled={!visibleValid.length}
              onClick={() => fitVisible()}
            >
              <Scan size={17} />
            </button>
            <button
              aria-label="定位当前站点"
              title={
                hiddenSelected
                  ? "当前站点被筛选隐藏"
                  : coordinateIssue || "定位当前选中站点"
              }
              disabled={hiddenSelected || !selectedLocation?.valid}
              onClick={locateSelected}
            >
              <LocateFixed size={17} />
            </button>
          </div>
          {baseStatus === "loading" && (
            <div className="gis-loading">正在加载地理底图…</div>
          )}
          {(baseStatus === "fallback" ||
            baseStatus === "local" ||
            (localError && baseStatus !== "online")) && (
            <div
              className={`gis-basemap-notice${localError ? " load-error" : ""}`}
              role="status"
            >
              <Info size={13} />
              <span>
                {localError
                  ? "本地底图加载失败，请重试"
                  : baseStatus === "fallback"
                    ? localReady
                      ? "在线底图暂不可用 · 已切换本地OSM简图"
                      : "在线底图暂不可用 · 本地简图加载中"
                    : "本地OSM简化地理底图 · 杭州西部"}
              </span>
              {(baseStatus === "fallback" || localError) && (
                <button onClick={() => retryRef.current()}>
                  <RotateCcw size={12} />
                  重试
                </button>
              )}
            </div>
          )}
          {!visible.length && (
            <div className="gis-empty">
              没有符合筛选条件的站点
              <br />
              <small>修改左侧搜索或状态筛选后继续查看</small>
            </div>
          )}
          {!!visible.length && !visibleValid.length && (
            <div className="gis-empty">
              当前站点坐标待补充
              <br />
              <small>已保留列表和业务记录，暂不落点</small>
            </div>
          )}
          {(hiddenSelected || coordinateIssue || unavailable.length > 0) && (
            <div className="gis-selection-notice">
              {hiddenSelected
                ? `${selected?.name ?? "当前站点"}已被筛选隐藏，选择仍保留`
                : coordinateIssue
                  ? `${selected?.name}：${coordinateIssue}`
                  : `${unavailable.length}个站点坐标待补充或需核对，未在地图落点`}
            </div>
          )}
        </div>
        {expanded && (
          <div className="gis-expanded-footer">
            <span>
              当前选中{" "}
              <b>
                {selected?.name} · {selected?.eco}
              </b>
            </span>
            <span
              className={
                selectedStatus === "attention"
                  ? "orangeText"
                  : selectedStatus === "normal"
                    ? "greenText"
                    : "muted"
              }
            >
              {statusLabels[selectedStatus]}
            </span>
            <small>
              点击点位查看信息，缩小后继续查看设备、观测和异常 · Esc 返回
            </small>
          </div>
        )}
        {createPortal(
          selected &&
            popupOpen &&
            selectedVisible &&
            selectedLocation?.valid ? (
            <div className="gis-popup">
              <button
                className="gis-popup-close"
                aria-label="关闭站点浮层"
                onClick={() => setPopupOpen(false)}
              >
                <X size={14} />
              </button>
              <h4>
                {selected.name}
                <span>{selected.eco}</span>
              </h4>
              <div className="gis-popup-status">
                <i
                  className="dot"
                  style={{ backgroundColor: pointColor(selectedStatus) }}
                />
                {statusLabels[selectedStatus]}
              </div>
              <p>
                {props.getIncident(selected.id) ||
                  (selectedStatus === "normal"
                    ? "当前无未关闭异常，观测记录持续更新。"
                    : "观测状态需要进一步核查。")}
              </p>
              <small>
                {selected.longitude?.toFixed(5)}°E ·{" "}
                {selected.latitude?.toFixed(5)}°N
                {selected.isMock ? " · 模拟" : ""}
              </small>
              <button
                className="gis-popup-details"
                aria-label="查看站点详情"
                onClick={async () => {
                  setPopupOpen(false);
                  if (expanded) await collapse();
                  props.onViewDetails();
                }}
              >
                查看站点详情 <span>→</span>
              </button>
            </div>
          ) : null,
          popupHost,
        )}
      </div>
    </>
  );
}
