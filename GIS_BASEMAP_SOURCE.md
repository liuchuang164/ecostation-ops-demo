# GIS 底图来源与离线数据说明

本项目的站点经纬度与底图是两类数据。底图提供真实地理参考；演示站点位置是否模拟由站点数据中的 `isMock` 和坐标来源单独注明，底图地物本身不是虚构站址。

## 在线底图

默认使用 OpenStreetMap 标准二维 XYZ 瓦片，无需密钥：

```text
https://tile.openstreetmap.org/{z}/{x}/{y}.png
```

地理数据为 WGS84；XYZ 瓦片采用 Web Mercator（EPSG:3857）。OpenLayers 将 `[经度, 纬度]` 的 EPSG:4326 站点和本地 GeoJSON 明确转换到 EPSG:3857 视图。不能将 GCJ-02、BD-09 经纬度直接用于该底图。

地图上必须保留可见的 `© OpenStreetMap contributors` 来源标注，并链接至 <https://www.openstreetmap.org/copyright>。OSM 数据适用 [Open Database License 1.0（ODbL）](https://opendatacommons.org/licenses/odbl/1-0/)。

OSM 瓦片服务是尽力提供的公共服务，没有可用性保证；本演示只请求当前交互视野需要的瓦片，遵循浏览器缓存和正常 Referer，禁止批量抓取、瓦片预取、制作离线瓦片包和默认绕过缓存。离线降级使用下述 OSM **矢量数据提取**，并非缓存 OSM 公共服务器瓦片。生产部署应配置适合使用量、地区连通性和服务要求的合规服务。官方规则：[OSMF Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/)。

在线 URL 可通过项目地图环境配置替换为兼容 EPSG:3857 的 XYZ 服务，同时设置其真实来源标注；具体字段见 `.env.example` 和 README。浏览器公开的服务凭证应按提供方规则限制域名，不在组件中写死。

## CARTO 浅色底图核验

CARTO 官方支持 Positron（`light_all`、`light_nolabels`）等浅色样式。但截至 2026-10-12，官方文档明确说明 raster 服务需要 API key，无 key 会返回带 `API key required` 水印的瓦片。因此本项目未将旧 CARTO 无密钥地址作为默认可用服务，也没有填写虚假 key。

如已有合法 key，可以通过地图 URL 环境配置选择相应端点并附带 `?key=…`；需同时保留 OpenStreetMap 与 CARTO 来源标注。权威来源：[CARTO Basemaps](https://carto.com/basemaps/)、[CARTO 官方 basemap-styles README](https://github.com/CartoDB/basemap-styles)、[CARTO attribution](https://carto.com/attribution/)。

## 本地简化底图

文件：`public/maps/hangzhou-west.geojson`。

- 真实来源：OpenStreetMap，经公开只读 [Overpass API](https://overpass-api.de/api/interpreter) 两次顺序提取。
- 下载日：2026-10-12。
- 道路、水系、地名数据时间：`2026-10-12T07:56:36Z`。
- 湖泊水面数据时间：`2026-10-12T07:58:33Z`。
- 查询范围：经度 119.35–120.40，纬度 30.00–30.60，覆盖杭州西部、临安、余杭及周边。
- GeoJSON 坐标：WGS84 / EPSG:4326，顺序 `[longitude, latitude]`。
- 文件大小：约 787 KB；共 773 个聚合或独立要素。
- 分类：25 个 `place`，495 个 `road`，115 个 `waterway`，138 个 `water`。
- `properties.kind` 为上述分类；`name` 为 OSM 的 `name:zh` 或 `name`，`class` 为原始道路/水域分类。
- 每个要素保留 `osm_id` 或 `osm_ids`，可在 `https://www.openstreetmap.org/{type}/{id}` 核对原对象。
- 元数据中保留许可、坐标顺序、OSM 数据时间、原始提取 SHA-256 和简化方式。
- 范围查询返回与范围相交的完整 OSM 对象；未裁断其跨范围几何，所以文件内个别线或水面延伸到查询框之外。

本地图显示真实主要道路、河流、湖泊/水库和地区地名，是有限范围的简化地理参考。它不包含完整路网、全部小水域、地形高程或行政区界；不能用于导航、测量、规划审查或证明站点实际部署位置。地图降级时需明确显示“本地 OSM 简化底图”及来源。

### 简化方式

提取仅包含 motorway/trunk/primary 主要道路、river 主水系、带名称的自然水面和 city/town/suburb 地名。地名显示保留城市节点和有关的主要城镇节点；并未以行政区中心替代站址。

同类别、同名称、同道路编号的线要素仅在**原始端点完全相同**时拼接，保留 OSM 对象 ID 数组。Douglas–Peucker 简化误差为线约 28 米、水面轮廓约 18 米，使用 30.3° 纬度下的米近似计算误差，保留原始几何顶点并舍入到 6 位小数。水面 relation 按 outer/inner 原始成员连接为闭合面，保留岛屿孔洞。未移动任何站点或地物使其“更好看”。

处理脚本：`scripts/prepare-local-basemap.py`（仅 Python 标准库）。源查询：`public/maps/hangzhou-west.overpass.ql`。查询时依次保存道路/地名与水面 JSON，然后运行：

```bash
python3 scripts/prepare-local-basemap.py roads.json water.json public/maps/hangzhou-west.geojson
```

应用启动不需要运行脚本、不访问 Overpass、不需要另外安装 Python GIS 依赖。当前原始下载位于临时目录，不作为运行依赖；提取哈希与源要素 ID 已保存在 GeoJSON 元数据及 properties 中，查询可重现但 OSM 后续编辑会改变结果。

### 数据许可

该 GeoJSON 是 OSM 数据的简化、分类和聚合衍生提取，继续依据 **ODbL 1.0** 发布。保留来源 `© OpenStreetMap contributors`、本说明及 GeoJSON 元数据。说明文档本身不改变 OSM 数据许可。许可原文：[ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)，来源说明：[OpenStreetMap copyright](https://www.openstreetmap.org/copyright)。
