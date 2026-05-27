# qwenpaw-pet Remote Mode 设计文档

> 状态：设计已锁定，等待 PR 1 落地
> 最后更新：2026-05-27
> 受众：qwenpaw-pet 维护者 / 未来接手 remote 模式的开发者

本文档记录 qwenpaw-pet 从「同机模式」演化到「云端 QwenPaw → 用户笔记本桌宠」远程模式的完整设计过程：问题域分析、方案对比、选型理由、未来硬件机器人路径，以及落地计划。

---

## 1. 问题域

### 1.1 当前形态

`qwenpaw-pet` 现在只在 QwenPaw 与桌宠 desktop app 同机运行时工作：

```
QwenPaw plugin ──httpx.post──▶ 127.0.0.1:8765 (桌宠本地 HTTP server)
```

### 1.2 远程场景的需求

QwenPaw 部署到云端 ECS 后，希望桌宠仍能反映远端 QwenPaw 的状态。但：

- 用户笔记本在家用 NAT / CGNAT 后，**没有可被外部主动访问的公网入口**
- 云端 QwenPaw 不能反向连接到桌宠
- 必须让桌宠**主动出站**到云端，并让事件单向（或后续双向）流回桌宠

### 1.3 长期愿景

- **桌宠 desktop app** 是 v1 形态
- **实体硬件机器人**（ESP32 类 MCU 起步）是确定要做的 v2 形态
- v1 的协议选型必须为 v2 留路，避免推倒重写

---

## 2. NAT 与穿透方案的本质

所有远程方案都在绕同一条限制：**NAT 后的设备只能主动出站，无法接受入站**。

每种方案的共同基本动作都是：**处于 NAT 后的那一方先主动建立出站连接**。

| 方案 | NAT 穿透机制 |
|---|---|
| 本机 loopback POST | 不过 NAT |
| 桌宠 SSE 主动连云端 | 桌宠出站，云端从回包通道反推事件 |
| CF Tunnel / 反代 | 云端 `cloudflared` 主动出站连 CF，CF 公网代收 |
| Tailscale / WireGuard | 双方都主动出站连协调服务器，NAT 打洞 |
| Pub/Sub broker（MQTT 等） | 双方都主动出站连 broker，broker 转发 |

**前提硬约束**：桌宠在 NAT 后，所以无论哪个方案，桌宠端永远是出站方。

---

## 3. 方案演化历程

### 3.1 第一版（已实现，即将被替换）：SSE 长连接

- 云端 QwenPaw 暴露 `GET /api/qwenpaw-pet/events/stream`（SSE）
- 桌宠用 `httpx.stream` 主动出站连接，长 poll 接收事件
- 鉴权：pairing token（hash 存储 + scope 限定 SSE 端点）
- 实现：`event_hub.py`、`pair_tokens.py`、`qwenpaw_pet_desktop/remote_client.py`

**优点**：
- 实现简单，纯 stdlib + httpx
- 协议透明（HTTPS + 文本帧）

**致命缺陷**（驱动我们换方案）：
1. **要求 QwenPaw 自己有公网入口**——`--host 0.0.0.0` + 安全组开 443 + TLS 证书 + 反代，或上隧道服务
2. **fanout 不优**——hub 在 QwenPaw 进程内，新增订阅者要重连 QwenPaw
3. **协议非标准**——SSE 在嵌入式 IoT 场景（未来硬件）几乎没人用，硬件几乎都走 MQTT
4. **设备管理零基础**——没有设备影子、OTA、上线/离线检测，硬件场景全要从头写

### 3.2 第二版（最终方案）：标准 MQTT broker

- 云端 QwenPaw publish 到 MQTT topic
- 桌宠 / 未来硬件 subscribe 同一个 topic
- broker 角色由用户自选（同机自建 EMQX / 腾讯云 IoT / HiveMQ Cloud / …）

**为什么是 MQTT**：

| 维度 | SSE | WebSocket (PubNub) | **MQTT** |
|---|---|---|---|
| 行业标准 | RFC 8895 | RFC 6455 | OASIS / ISO 标准 |
| IoT 硬件支持 | ❌ | 极少 | ✅ 所有 MCU 都有 client |
| 设备影子 | 自己写 | 自己写 | ✅ 协议+broker 内置 |
| LWT 异常断开通知 | ❌ | ❌ | ✅ 内置 |
| QoS 分级 | ❌ | ❌ | ✅ 0/1/2 |
| retained 消息 | ❌ | 部分支持 | ✅ 内置 |
| vendor 锁定 | 无 | 高（专有协议） | 无（任何 broker 可替换） |
| 桌宠 Python client | httpx | pubnub SDK | paho-mqtt（纯 Python，Windows 完美兼容） |
| 硬件 ESP32 client | — | 罕见，体积大 | esp-mqtt / lwMQTT，2KB RAM 可跑 |

**结论**：MQTT 是 v1 + v2 协议层一致性的唯一选择。

---

## 4. broker 选型

### 4.1 部署模型的两条路线

| | 路线 1：统一中转 | 路线 2：自带 broker |
|---|---|---|
| 谁付费 / 谁运维 broker | 我们（QwenPaw 开发者） | 每个用户自己 |
| 适合规模 | 1000 stars 级别公开产品 | 个人单用户 |
| 多租户 | 必须 | 不需要 |
| 现阶段选择 | **暂不做** | ✅ **本期目标** |

本期实现路线 2：每个用户自己开 broker、自己付费（绝大多数情况下完全免费）。

### 4.2 broker 候选评估（个人免费场景）

经过多轮筛选，最终候选：

| broker | 状态 | 是否真免费 | CN 速度 | 海外速度 | 推荐位置 |
|---|---|---|---|---|---|
| ~~阿里云物联网平台~~ | ❌ **2025-02 停售** | — | — | — | 已出局 |
| **自建 EMQX 同 QwenPaw ECS** | ✅ | ✅ 边际成本 0 | ✅ 极快 | 看 ECS region | **首推** |
| **腾讯云 IoT Hub** | ✅ | ✅ 免费版 100 万条/月 | ✅ 原生 | ⚠️ | CN 备选 |
| **华为云 IoT 设备接入** | ✅ | ✅ 标准版部分免费 | ✅ 原生 | ⚠️ | CN 备选 |
| **HiveMQ Cloud Free** | ✅ | ✅ 100 连接永久免费 | ⚠️ 慢 | ✅ 全球 | 海外用户 |
| Mosquitto on Oracle 永免 ARM | ✅ | ✅ | 看节点 | 看节点 | 极客 |
| 云消息队列 MQTT 版 | ✅ | ❌ ¥800/月起 | — | — | 不推荐（个人付费过高）|
| EMQX Cloud 付费版 | ✅ | ❌ ¥30/月起 | — | — | 不推荐（个人付费）|
| ~~PubNub / Ably / Pusher~~ | ✅ | ✅ | — | — | 出局（非 MQTT，硬件未来不兼容）|
| ~~broker.emqx.io / test.mosquitto.org~~ | ✅ | ✅ | — | — | 出局（**无鉴权公开 broker**）|

### 4.3 为什么首推「同机 EMQX」

1. **真正零额外成本**——ECS 你本来就在付费
2. **零 vendor 风险**——阿里云 IoT 刚被砍证明 SaaS broker 政策可能突变
3. **运维简单**——docker-compose 一行起，约 10 分钟完成 TLS + ACL 配置
4. **未来硬件直接复用**——ESP32 连同一个 EMQX 即可
5. **vendor-neutral**——以后想换腾讯云 IoT 或 HiveMQ Cloud，桌宠/plugin 代码零改动

**唯一缺点**：要在 ECS 安全组开 8883 端口 + 配 TLS。比起暴露 QwenPaw 自己的 HTTP 端口，MQTT broker 的攻击面小一个数量级（只接受 MQTT 协议解析 + auth）。

**进阶规避公网暴露**：用 Tailscale 把 ECS 和用户设备拉到同一虚拟内网，EMQX 只听 `tailscale0`，**完全不开公网端口**——这是路线 2 单用户场景下安全/UX 双优的方案。

### 4.4 不推荐的方案及理由

- **PubNub / Ably / Pusher**：专有协议，硬件 SDK 罕见且重，未来切硬件 = 全栈重写
- **云消息队列 MQTT 版 / EMQX Cloud 付费版**：起步价 ¥30-800/月，个人用户场景下没必要
- **公开无鉴权 broker**：谁都能订阅你的事件，泄露隐私
- **Firebase / Supabase Realtime**：协议非 MQTT；Firebase 在 CN 被墙
- **Kafka / RabbitMQ**：消息队列定位，fanout 非首要，跑起来重

---

## 5. 系统架构

### 5.1 总体拓扑（v1 桌宠 + v2 硬件统一）

```
                    ┌────────────────────────────────────┐
                    │   broker (默认: 同机 EMQX)          │
                    │   端口 8883 (MQTT over TLS)         │
                    │   或 443 (MQTT over WebSocket)      │
                    │                                    │
   ┌──────────┐     │  Topic: pet/<user_id>/state        │     ┌──────────────┐
   │ QwenPaw  │     │  Retained: True (新订阅者立刻拿到) │     │ 桌宠 desktop │
   │ plugin   │────▶│                                    │────▶│ Win / Mac    │
   │ (publisher) │  │  Topic: pet/<user_id>/cmd          │     │ paho-mqtt    │
   └──────────┘     │  (反向通道，预留 v1.1+)            │     └──────────────┘
                    │                                    │
                    │  ACL: srv_user pub-only            │     ┌──────────────┐
                    │       app_user sub-only            │────▶│ ESP32 硬件   │
                    │                                    │     │ esp-mqtt     │
                    └────────────────────────────────────┘     └──────────────┘
                                                                  (v2 长期)
```

### 5.2 协议约定

#### Topic 命名

```
pet/<user_id>/state       # 上行: QwenPaw 状态变化 (running/done/error/idle)
pet/<user_id>/cmd         # 下行: 桌宠/硬件触发 QwenPaw 动作 (v1.1+)
pet/<user_id>/presence    # 上行: QwenPaw 在线/离线 (用 MQTT LWT)
```

`<user_id>` 是 QwenPaw 部署时生成的稳定 UUID。

#### 消息 schema

事件体延续现有 `emit_pet_event` 的 JSON 形态：

```json
{
  "event": "query.running",
  "source": "qwenpaw",
  "serial": 42,
  "ts": 1716816000000,
  "text": "Thinking…",
  "state": "running",
  "duration_ms": null
}
```

JSON-encoded UTF-8。

#### QoS / retained / LWT 策略

| Topic | QoS | retained | LWT |
|---|---|---|---|
| `pet/<user>/state` | 1 (at-least-once) | ✅ True | — |
| `pet/<user>/cmd` | 1 | False | — |
| `pet/<user>/presence` | 1 | ✅ True | ✅ Last Will = "offline" |

- **retained**：新桌宠一连上 broker 立刻收到当前状态（解决"刚开机不知道 QwenPaw 在 running 还是 idle"）
- **LWT**：QwenPaw 异常断开时 broker 自动 publish "offline"，桌宠立刻感知
- **retained 的 corner case**：QwenPaw 重启后旧 retained 仍在 broker 上——启动时 publish 一条 `{"event":"reset","state":"idle"}` 覆盖

### 5.3 鉴权

每个用户两组凭证：
- `srv_<user_id>` — pub-only on `pet/<user_id>/#`，QwenPaw plugin 用
- `app_<user_id>_<device_id>` — sub-only on `pet/<user_id>/state` 和 `pet/<user_id>/presence`，pub-only on `pet/<user_id>/cmd`，桌宠/硬件用

凭证形式（按 broker 不同）：
- 同机 EMQX：username + password（保存在 EMQX 内置 mnesia 或 HTTP plugin 查询）
- 腾讯云 IoT：三元组（ProductID + DeviceName + DeviceSecret）按腾讯云规则生成 username/password
- HiveMQ Cloud：dashboard 创建的 credential

抽象层：**plugin 和桌宠代码只认标准 MQTT 6 字段**：
```
endpoint, port, tls, username, password, topic_prefix
```

不同 broker 的差异封装在文档（README 教程）里，代码层 vendor-neutral。

### 5.4 配对链接 schema v2

```
qwenpaw-pet://pair?v=2
  &endpoint=<base64url>          # 如 mqtt.example.com
  &port=8883
  &tls=1
  &user=<base64url>
  &pass=<base64url>
  &topic=pet/user123/state
  &provider=emqx                 # UI hint, 代码层忽略
```

`pair_link.py` 需要：
- 新增 v2 schema 解析
- 保留 v1（SSE）兼容
- 字段全部 base64url 编码避免特殊字符冲突

### 5.5 双轨过渡

PR 1 落地时**保留全部 v1 SSE 代码不删**：

| 路径 | v1 SSE | v2 MQTT |
|---|---|---|
| `event_hub.py` | ✅ 同机 desktop 仍走它 | 不需要 |
| `pair_tokens.py` | ✅ v1 配对仍可用 | 不需要 |
| `router.py /events/stream` | ✅ 保留 | 不需要 |
| `remote_client.py` | ❌ 删除 SSE 实现 | ✅ 新写 paho-mqtt 实现 |
| `mqtt_publisher.py` | — | ✅ 新增 |
| `pair_link.py` | ✅ v1 解析保留 | ✅ v2 解析新增 |
| 配对链接 | v1 链接可继续工作 | v2 为新主路径 |

桌宠根据 `remote.json` 内字段判断走 v1 还是 v2。这样 v1 用户升级桌宠后不需要重新配对，迁移自然衰减。

---

## 6. 用户上手路径（路线 2 个人使用）

按用户已有云账号自动推荐：

```
┌─────────────────────────────────────────────────────────────┐
│  你的 QwenPaw 跑在哪？                                       │
│  ○ 阿里云 ECS / 腾讯云 CVM / 其他云  →  推荐: 同机 EMQX docker│
│  ○ 已有腾讯云账号不想自建            →  推荐: 腾讯云 IoT Hub   │
│  ○ 海外 / 无 CN 云账号               →  推荐: HiveMQ Cloud Free│
│  ○ 不远程，仅本机                    →  无需 broker，走旧 SSE  │
└─────────────────────────────────────────────────────────────┘
```

四份独立教程（PR 2 内）：

```
docs/mqtt-setup/
  ├─ emqx-on-ecs.md       # 首推：同机 docker-compose 起 EMQX (~10 步)
  ├─ tencent-iot-hub.md   # CN 备选
  ├─ hivemq-cloud.md      # 海外
  └─ tailscale-emqx.md    # 进阶: 同机 EMQX 只听 tailscale，零公网暴露
```

每份教程产出的最终结果完全一致：一组 6 字段配置，填进 QwenPaw 控制台 MQTT 配置卡片即可。

---

## 7. region 策略

### 7.1 当前 (v1.0)：单 region

- 用户 broker 部署在哪个 region 由用户自己决定（同机 EMQX 跟随 ECS region）
- 国内用户用上海/北京 region，海外用户用美国/欧洲 region
- 1000 stars 量级足够

### 7.2 未来 (v2+)：双 region 桥接

- 当海外用户超 30% 时再考虑
- 同机 EMQX 走 federation 桥接两个 region 的 broker
- 桌宠按地理位置自动选最近 endpoint
- **本期不实现**

---

## 8. 落地计划

### PR 1: 协议层切换（无外部依赖）

**目标**：把 v2 MQTT 路径完整跑通，不需要任何云账号

**改动**：
- 新增 `docker-compose.dev.yml` — 本地起 EMQX 5 单实例（既是开发依赖，也是 PR 2 教程产物）
- 新增 `mqtt_publisher.py` — plugin 端 publish 抽象，subscribe `event_hub`，转 MQTT publish
- 重写 `qwenpaw_pet_desktop/remote_client.py` — paho-mqtt 替换 httpx SSE
- 修改 `qwenpaw_pet_desktop/pair_link.py` — 加 v2 schema 解析（保留 v1）
- 修改 `qwenpaw_pet_desktop/runtime.py` — `remote.json` schema 支持 v2 字段
- 修改 `requirements.txt` — 加 `paho-mqtt`
- **不删** 任何 v1 SSE 代码（双轨）

**验证**：
1. 本地 EMQX docker 起来
2. QwenPaw 触发 query → 桌宠收到事件
3. 桌宠重启 → 立刻收到 retained 状态
4. v1 配对链接仍可工作（回归测试）

### PR 2: BYOB 配置 UI + 四份教程

**目标**：用户能在控制台填 MQTT 配置 + 跟着教程开通自己的 broker

**改动**：
- `frontend/src/index.tsx` 加 "MQTT 配置" 卡片（6 字段表单 + 测试连接按钮）
- 后端 `router.py` 加 `POST /api/qwenpaw-pet/mqtt-config` + `GET /api/qwenpaw-pet/mqtt-config/test`
- 配对链接生成路径切到 v2（基于已配置的 MQTT 凭证派生 sub-only 凭证）
- 新增 `docs/mqtt-setup/*.md` 四份教程
- README 主文档加 "Remote Mode 快速开始" 章节，分流到四份教程

**验证**：
- 跟着 emqx-on-ecs.md 教程 10 分钟内完成端到端配对
- v1 / v2 配对链接 UI 上都能生成（v1 保留兜底）

### PR 3 (可选 / 推迟): 自动化 broker provisioning

- 用户填一组 broker 管理员凭证（如 EMQX HTTP API token / 腾讯云 AK/SK）
- 桌宠/硬件配对时后端自动创建 sub-only 账号
- 删除桌宠时自动销毁账号
- **路线 2 个人场景下手动建账号也能接受，本 PR 优先级低**

### PR 4 (未来): 硬件 ESP32 原型

- ESP32 + `esp-mqtt`
- 同三元组 / 同 topic / 同事件 schema
- 加 `pet/<user>/cmd` 反向通道（手机/桌宠点击触发硬件动作）
- **协议层 v1 选型在这一步收割红利——零迁移成本**

---

## 9. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| broker SaaS 突然停售（如阿里云 IoT 案例） | 用户被迫迁移 | 协议层 vendor-neutral，迁移 = 改 6 字段配置 |
| 同机 EMQX 公网暴露 8883 被扫描 | 安全风险 | TLS + 强 ACL + Tailscale 进阶方案 |
| paho-mqtt 在 Windows 上的 TLS 证书 | PyInstaller 打包后 TLS 失败 | spec 文件显式打入 certifi CA bundle |
| retained 消息在 QwenPaw 重启后不一致 | 桌宠收到过期状态 | 启动时主动 publish reset 事件覆盖 |
| 桌宠 / QwenPaw clientId 冲突 | 互相踢下线 | clientId 加 hostname / uuid 后缀 |
| OpenAPI 调用频率限制（路线 1 才相关） | 配对失败 | 本期不实现自动 provisioning，规避 |
| 配对链接过长导致剪贴板/二维码不友好 | UX | base64url 编码 + 测试常见 broker 字段长度 |

---

## 10. 关键决策记录

按时间倒序的核心决策点：

| 日期 | 决策 | 替代方案 | 理由 |
|---|---|---|---|
| 2026-05-27 | broker 首推自建 EMQX 同机 | 阿里云 IoT 平台 | 阿里云 2025-02 停售，vendor 风险已实证 |
| 2026-05-27 | 路线 2 优先（用户自带 broker） | 路线 1（我们托管） | 1000 stars 阶段维护负担过重 |
| 2026-05-27 | 协议切 MQTT，不上 PubNub/Ably | 专有 WebSocket SaaS | 硬件机器人确定要做，必须用标准协议 |
| 2026-05-27 | 桌宠和未来硬件共享同一 topic/schema | 桌宠和硬件分两套协议 | 协议层一次性铺好，避免未来重写 |
| 2026-05-26 | v1 SSE 双轨保留 | 直接砍 v1 | 已配对用户平滑迁移 |
| 2026-05-26 | pairing token hash 存储 + scope 限定 | 复用 master API token | 撤销粒度细，泄露损害可控 |
| 2026-05-26 | 同机模式继续走 loopback HTTP | 同机也走 MQTT | 零外部依赖，零延迟，向后兼容 |

---

## 11. 名词表

- **NAT**: Network Address Translation，路由器共享公网 IP 的机制，副作用是外部无法主动连入
- **CGNAT**: Carrier-Grade NAT，运营商级 NAT，4G/5G 网络几乎都是
- **SSE**: Server-Sent Events，基于 HTTP 的单向流式协议
- **MQTT**: Message Queuing Telemetry Transport，IoT 行业事实标准 pub/sub 协议
- **LWT**: Last Will and Testament，MQTT 客户端异常断开时 broker 自动发布的"遗嘱"消息
- **retained**: MQTT broker 为每个 topic 保留最新一条消息，新订阅者立刻拿到
- **QoS**: Quality of Service，MQTT 的消息送达保证等级（0/1/2）
- **fanout**: 一对多分发，pub/sub 系统的核心能力
- **ACL**: Access Control List，broker 上的 topic 级权限表
- **路线 1**: 我们（QwenPaw 开发者）托管一套中转，多租户
- **路线 2**: 每个用户自己开 broker，单租户

---

## 12. 参考资料

- [MQTT v5 OASIS 标准](https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html)
- [EMQX 文档](https://docs.emqx.com/)
- [paho-mqtt Python 客户端](https://github.com/eclipse/paho.mqtt.python)
- [阿里云物联网平台文档（已停止维护）](https://help.aliyun.com/document_detail/30520.html)
- [HiveMQ Cloud Free Tier](https://www.hivemq.com/mqtt-cloud-broker/)
- [腾讯云 IoT Hub](https://cloud.tencent.com/product/iothub)
- [Tailscale](https://tailscale.com/)
- 当前 v1 SSE 实现：本仓库 `event_hub.py` / `qwenpaw_pet_desktop/remote_client.py`
