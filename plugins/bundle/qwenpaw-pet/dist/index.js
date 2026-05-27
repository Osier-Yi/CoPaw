const ae = "language", Y = "qwenpaw-pet-language-change";
function ee() {
  try {
    return localStorage.getItem(ae) || "";
  } catch {
    return "";
  }
}
function xe() {
  const e = "__qwenpawPetLanguageHook", r = Storage.prototype;
  if (r[e]) return;
  const o = r.setItem;
  r.setItem = function(i, l) {
    o.call(this, i, l), i === ae && window.dispatchEvent(new CustomEvent(Y, { detail: l }));
  }, r[e] = !0;
}
function Te(e) {
  xe();
  let r = ee();
  const o = (p) => {
    p !== r && (r = p, e(p));
  }, i = (p) => {
    o(String(p.detail ?? ""));
  }, l = (p) => {
    p.key === ae && o(p.newValue ?? "");
  };
  window.addEventListener(Y, i), window.addEventListener("storage", l);
  const s = window.setInterval(() => {
    o(ee());
  }, 500);
  return () => {
    window.removeEventListener(Y, i), window.removeEventListener("storage", l), window.clearInterval(s);
  };
}
const le = {
  en: {
    routeLabel: "Pet",
    title: "QwenPaw Pet",
    intro: "Installed pets live under your QwenPaw working directory. Start the desktop bridge, then switch the floating pet without restarting QwenPaw.",
    startDesktop: "Start desktop pet",
    importPet: "Import pet",
    refresh: "Refresh",
    petsDirectory: "Pets directory:",
    desktopHealth: "Desktop health:",
    desktopUnknown: "unknown (refresh)",
    colPreview: "Preview",
    colName: "Name",
    colFolder: "Folder",
    colManifestId: "pet.json id",
    colAction: "Action",
    switch: "Switch",
    tableEmpty: "No pets found. Run: qwenpaw-pet install-pet …",
    desktopAlreadyRunning: "Desktop pet is already running.",
    desktopStartFailed: "Could not start the desktop pet.",
    desktopReady: "Desktop pet is ready.",
    desktopStarting: "Desktop may still be starting; check pet-desktop.log if needed.",
    dropFolderOrZip: "Drop a folder or a .zip file.",
    importChooseFirst: "Drop a folder or choose a .zip file first.",
    importSuccess: 'Imported "{name}" → {path}',
    switchSuccess: 'Switched to "{name}" ({petId})',
    switchFailed: "switch failed",
    modalImportTitle: "Import pet",
    modalImportOk: "Import",
    dropzoneTitle: "Drop a folder or .zip file here",
    dropzoneHint: "or click to choose a .zip",
    importFormatHint: "Folder or unzipped archive must contain pet.json and spritesheet.webp (1536×1872).",
    selectedOne: "Selected: {path}",
    selectedMany: "Selected: {count} files (root: {root})",
    importReplace: "Replace if a pet with the same id already exists",
    modeSection: "Deployment mode",
    modeLocal: "Local",
    modeRemote: "Remote",
    modeLocalHint: "Pet desktop runs on this machine; events stream over loopback HTTP.",
    modeRemoteHint: "Pet desktop runs on the user's laptop and subscribes to this QwenPaw via SSE.",
    modeLockedByEnv: "Mode is fixed by the QWENPAW_PET_MODE environment variable.",
    modeUpdated: "Mode updated to {mode}.",
    modeUpdateFailed: "Failed to update mode.",
    pairCardTitle: "Pair a remote desktop",
    pairCardIntro: "On a desktop that has the pet app installed: open the tray menu, choose “Paste pairing link”, and paste the link below.",
    copyPairLink: "Copy pairing link",
    pairLinkCopied: "Pairing link copied to clipboard.",
    pairLinkCopyFailed: "Could not copy automatically — copy the link manually.",
    pairLinkExpires: "Pairing link expires on {date}.",
    pairLinkNoteReveal: "The token inside this link is shown once. Re-issue if you lose it.",
    pairLinkLabel: "Label (optional, e.g. “MyMac”)",
    pairLinkLabelPlaceholder: "Optional device label",
    pairedDevices: "Paired devices",
    pairedNone: "No devices paired yet.",
    pendingLinksHint: "{count} unused pairing link(s) outstanding — only devices that have actually connected are listed above.",
    cleanupPending: "Revoke unused links",
    cleanupConfirmTitle: "Revoke all unused pairing links?",
    cleanupConfirmBody: "Links that have never been used will be invalidated. Already-paired devices are unaffected.",
    cleanupSuccess: "Revoked {count} unused pairing link(s).",
    cleanupFailed: "Failed to revoke some pairing links.",
    pairedLabelUnnamed: "(unnamed)",
    pairedCreated: "Created {date}",
    pairedLastSeenNever: "Never connected",
    pairedLastSeen: "Last seen {date}",
    pairedExpires: "Expires {date}",
    revokeToken: "Revoke",
    revokeConfirmTitle: "Revoke this pairing?",
    revokeConfirmBody: "The desktop using this token will be disconnected on its next reconnect attempt.",
    revokeConfirmOk: "Revoke",
    revokeConfirmCancel: "Cancel",
    revokeSuccess: "Pairing revoked.",
    revokeFailed: "Failed to revoke pairing.",
    downloadCardTitle: "1. Download QwenPaw Pet Desktop",
    downloadCardHint: "Builds will appear here once packaging is published. For now, install the desktop via pip on the target machine.",
    pairCardHeader: "2. Pair to this QwenPaw",
    remoteModeNote: "Local desktop pet management is hidden in remote mode. Switch back to Local mode to manage pets on this machine."
  },
  zh: {
    routeLabel: "宠物",
    title: "QwenPaw 桌面宠物",
    intro: "已安装的宠物位于 QwenPaw 工作目录下。启动桌面桥接后，可在不重启 QwenPaw 的情况下切换悬浮宠物。",
    startDesktop: "启动桌面宠物",
    importPet: "导入宠物",
    refresh: "刷新",
    petsDirectory: "宠物目录：",
    desktopHealth: "桌面服务状态：",
    desktopUnknown: "未知（请刷新）",
    colPreview: "预览",
    colName: "名称",
    colFolder: "文件夹",
    colManifestId: "pet.json id",
    colAction: "操作",
    switch: "切换",
    tableEmpty: "未找到宠物。请运行：qwenpaw-pet install-pet …",
    desktopAlreadyRunning: "桌面宠物已在运行。",
    desktopStartFailed: "无法启动桌面宠物。",
    desktopReady: "桌面宠物已就绪。",
    desktopStarting: "桌面可能仍在启动中；如有问题请查看 pet-desktop.log。",
    dropFolderOrZip: "请拖入文件夹或 .zip 文件。",
    importChooseFirst: "请先拖入文件夹或选择 .zip 文件。",
    importSuccess: "已导入「{name}」→ {path}",
    switchSuccess: "已切换至「{name}」（{petId}）",
    switchFailed: "切换失败",
    modalImportTitle: "导入宠物",
    modalImportOk: "导入",
    dropzoneTitle: "将文件夹或 .zip 拖放到此处",
    dropzoneHint: "或点击选择 .zip 文件",
    importFormatHint: "文件夹或解压后的目录需包含 pet.json 与 spritesheet.webp（1536×1872）。",
    selectedOne: "已选择：{path}",
    selectedMany: "已选择：{count} 个文件（根目录：{root}）",
    importReplace: "若已存在相同 id 的宠物则覆盖",
    modeSection: "部署模式",
    modeLocal: "本机",
    modeRemote: "远端",
    modeLocalHint: "桌面宠物运行在本机，事件通过本地 HTTP 推送。",
    modeRemoteHint: "桌面宠物运行在用户笔记本上，通过 SSE 主动订阅这台 QwenPaw。",
    modeLockedByEnv: "当前模式由 QWENPAW_PET_MODE 环境变量固定，无法修改。",
    modeUpdated: "模式已切换为 {mode}。",
    modeUpdateFailed: "切换模式失败。",
    pairCardTitle: "配对远端桌面",
    pairCardIntro: "在已安装桌宠 app 的电脑上：打开托盘菜单，选择「粘贴配对链接」，然后粘贴下面这条链接。",
    copyPairLink: "复制配对链接",
    pairLinkCopied: "配对链接已复制到剪贴板。",
    pairLinkCopyFailed: "无法自动复制，请手动复制链接。",
    pairLinkExpires: "配对链接将于 {date} 过期。",
    pairLinkNoteReveal: "链接中的 token 只会显示一次，丢失后需重新生成。",
    pairLinkLabel: "标签（可选，如「MyMac」）",
    pairLinkLabelPlaceholder: "可选的设备标签",
    pairedDevices: "已配对的设备",
    pairedNone: "暂无已配对设备。",
    pendingLinksHint: "当前有 {count} 条未使用的配对链接 —— 上方仅显示真正连接过的设备。",
    cleanupPending: "撤销未使用的链接",
    cleanupConfirmTitle: "撤销所有未使用的配对链接？",
    cleanupConfirmBody: "从未被使用过的链接将被作废，已经配对的设备不受影响。",
    cleanupSuccess: "已撤销 {count} 条未使用的配对链接。",
    cleanupFailed: "部分配对链接撤销失败。",
    pairedLabelUnnamed: "（未命名）",
    pairedCreated: "创建于 {date}",
    pairedLastSeenNever: "从未连接",
    pairedLastSeen: "最近活跃 {date}",
    pairedExpires: "过期时间 {date}",
    revokeToken: "撤销",
    revokeConfirmTitle: "确认撤销此配对？",
    revokeConfirmBody: "使用此 token 的桌面端将在下次重连时收到 401 并断开。",
    revokeConfirmOk: "撤销",
    revokeConfirmCancel: "取消",
    revokeSuccess: "已撤销该配对。",
    revokeFailed: "撤销失败。",
    downloadCardTitle: "1. 下载桌面宠物 app",
    downloadCardHint: "打包好的安装包将出现在这里。当前请在目标机器上通过 pip 安装。",
    pairCardHeader: "2. 配对到这台 QwenPaw",
    remoteModeNote: "远端模式下隐藏了本机桌宠管理。如需在本机管理宠物，请切回本机模式。"
  }
};
function Re(e) {
  return String(e || "").trim().split("-")[0].toLowerCase() === "zh" ? "zh" : "en";
}
function te(e) {
  return Re(e ?? ee());
}
function pe(e, r, o) {
  let i = le[e][r] ?? le.en[r];
  if (o)
    for (const [l, s] of Object.entries(o))
      i = i.split(`{${l}}`).join(String(s));
  return i;
}
function G(e) {
  const [r, o] = e.useState(
    () => te()
  );
  e.useEffect(() => {
    const l = (s) => {
      o((p) => {
        const f = te(s);
        return p === f ? p : f;
      });
    };
    return Te((s) => l(s));
  }, []);
  const i = e.useCallback(
    (l, s) => pe(r, l, s),
    [r]
  );
  return { locale: r, tr: i };
}
const J = window.QwenPaw.host, t = J.React, De = J.antd, U = J.getApiUrl, Z = J.getApiToken, {
  Button: F,
  Card: $,
  Space: x,
  Table: Fe,
  Typography: Ae,
  message: u,
  Modal: ze,
  Checkbox: Ne,
  Radio: X,
  Input: ce,
  Popconfirm: ue,
  List: ne,
  Tag: Oe,
  Alert: me
} = De, { Title: He, Text: w, Paragraph: fe } = Ae;
function Be() {
  var e, r, o;
  try {
    const i = ((e = window.sessionStorage) == null ? void 0 : e.getItem("qwenpaw-agent-storage")) ?? ((r = window.localStorage) == null ? void 0 : r.getItem("qwenpaw-agent-storage"));
    if (!i) return null;
    const l = JSON.parse(i), s = (o = l == null ? void 0 : l.state) == null ? void 0 : o.selectedAgent;
    return typeof s == "string" && s ? s : null;
  } catch {
    return null;
  }
}
function q() {
  const e = {}, r = Z == null ? void 0 : Z();
  r && (e.Authorization = `Bearer ${r}`);
  const o = Be();
  return o && (e["X-Agent-Id"] = o), e;
}
async function oe(e) {
  const r = await fetch(U(e), { headers: q() });
  if (!r.ok)
    throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}
async function j(e, r) {
  const o = await fetch(U(e), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...q() },
    body: JSON.stringify(r)
  }), i = await o.text();
  let l = null;
  try {
    l = i ? JSON.parse(i) : null;
  } catch {
    l = { raw: i };
  }
  if (!o.ok)
    throw new Error(typeof (l == null ? void 0 : l.detail) == "string" ? l.detail : i);
  return l;
}
async function de(e) {
  const r = await fetch(U(e), {
    method: "DELETE",
    headers: q()
  }), o = await r.text();
  let i = null;
  try {
    i = o ? JSON.parse(o) : null;
  } catch {
    i = { raw: o };
  }
  if (!r.ok)
    throw new Error(typeof (i == null ? void 0 : i.detail) == "string" ? i.detail : o);
  return i;
}
function Me(e) {
  const r = new TextEncoder().encode(e);
  let o = "";
  for (let i = 0; i < r.length; i++) o += String.fromCharCode(r[i]);
  return btoa(o).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function Ue(e) {
  var r;
  try {
    if ((r = navigator.clipboard) != null && r.writeText)
      return await navigator.clipboard.writeText(e), !0;
  } catch {
  }
  try {
    const o = document.createElement("textarea");
    o.value = e, o.style.position = "fixed", o.style.opacity = "0", document.body.appendChild(o), o.select();
    const i = document.execCommand("copy");
    return document.body.removeChild(o), i;
  } catch {
    return !1;
  }
}
function W(e) {
  if (!e || typeof e != "number") return "";
  try {
    return new Date(e).toLocaleString();
  } catch {
    return String(e);
  }
}
const qe = 192, Qe = 208;
function _e({ folder: e }) {
  const r = t.useRef(null), [o, i] = t.useState(!1);
  return t.useEffect(() => {
    let l = !1;
    i(!1);
    const s = r.current;
    if (!s) return;
    const p = s.getContext("2d");
    if (p)
      return (async () => {
        try {
          const f = U(
            `/qwenpaw-pet/pets/${encodeURIComponent(e)}/spritesheet`
          ), k = await fetch(f, { headers: q() });
          if (!k.ok || l) throw new Error(String(k.status));
          const b = await k.blob(), E = await createImageBitmap(b);
          if (l) {
            E.close();
            return;
          }
          const y = 96, T = 104;
          s.width = y, s.height = T, p.imageSmoothingEnabled = !1, p.clearRect(0, 0, y, T), p.drawImage(E, 0, 0, qe, Qe, 0, 0, y, T), E.close();
        } catch {
          l || i(!0);
        }
      })(), () => {
        l = !0;
      };
  }, [e]), o ? t.createElement(w, { type: "secondary" }, "—") : t.createElement("canvas", {
    ref: r,
    width: 96,
    height: 104,
    style: {
      display: "block",
      borderRadius: 8,
      border: "1px solid rgba(0,0,0,0.08)",
      background: "rgba(0,0,0,0.02)",
      imageRendering: "pixelated"
    }
  });
}
function $e({
  info: e,
  onChange: r
}) {
  const { tr: o } = G(t), [i, l] = t.useState(null), s = (e == null ? void 0 : e.source) === "env", p = (e == null ? void 0 : e.mode) ?? "local", f = async (k) => {
    var E;
    const b = (E = k.target) == null ? void 0 : E.value;
    if (!(!b || b === p)) {
      l(b);
      try {
        await r(b);
      } finally {
        l(null);
      }
    }
  };
  return t.createElement(
    "div",
    null,
    t.createElement(
      "div",
      { style: { marginBottom: 8 } },
      t.createElement(w, { strong: !0 }, o("modeSection"))
    ),
    t.createElement(
      X.Group,
      {
        value: p,
        onChange: f,
        disabled: s || i !== null,
        optionType: "button",
        buttonStyle: "solid"
      },
      t.createElement(X.Button, { value: "local" }, o("modeLocal")),
      t.createElement(X.Button, { value: "remote" }, o("modeRemote"))
    ),
    t.createElement(
      "div",
      { style: { marginTop: 6 } },
      t.createElement(
        w,
        { type: "secondary", style: { fontSize: 12 } },
        o(p === "remote" ? "modeRemoteHint" : "modeLocalHint")
      )
    ),
    s ? t.createElement(
      "div",
      { style: { marginTop: 6 } },
      t.createElement(Oe, { color: "warning" }, o("modeLockedByEnv"))
    ) : null
  );
}
function je(e, r) {
  return `qwenpaw-pet://pair?url=${Me(e)}&token=${encodeURIComponent(
    r
  )}&v=1`;
}
function We({
  item: e,
  onRevoke: r
}) {
  const { tr: o } = G(t), [i, l] = t.useState(!1), s = e.label || o("pairedLabelUnnamed"), p = e.lastUsedAt ? o("pairedLastSeen", { date: W(e.lastUsedAt) }) : o("pairedLastSeenNever"), f = e.expiresAt ? o("pairedExpires", { date: W(e.expiresAt) }) : "", k = e.createdAt ? o("pairedCreated", { date: W(e.createdAt) }) : "";
  return t.createElement(
    ne.Item,
    {
      actions: [
        t.createElement(
          ue,
          {
            key: "rv",
            title: o("revokeConfirmTitle"),
            description: o("revokeConfirmBody"),
            okText: o("revokeConfirmOk"),
            cancelText: o("revokeConfirmCancel"),
            okButtonProps: { danger: !0, loading: i },
            onConfirm: async () => {
              l(!0);
              try {
                await r(e.id);
              } finally {
                l(!1);
              }
            }
          },
          t.createElement(
            F,
            { danger: !0, size: "small", loading: i },
            o("revokeToken")
          )
        )
      ]
    },
    t.createElement(ne.Item.Meta, {
      title: t.createElement(
        x,
        null,
        t.createElement(w, { strong: !0 }, s),
        t.createElement(
          w,
          { type: "secondary", code: !0, style: { fontSize: 11 } },
          e.id
        )
      ),
      description: t.createElement(
        "div",
        null,
        t.createElement(
          "div",
          null,
          t.createElement(w, { type: "secondary" }, p)
        ),
        f || k ? t.createElement(
          "div",
          { style: { fontSize: 12 } },
          t.createElement(
            w,
            { type: "secondary" },
            [k, f].filter(Boolean).join(" · ")
          )
        ) : null
      )
    })
  );
}
function Ge() {
  const { tr: e } = G(t), [r, o] = t.useState([]), [i, l] = t.useState(!1), [s, p] = t.useState(!1), [f, k] = t.useState(null), [b, E] = t.useState(""), y = t.useCallback(async () => {
    l(!0);
    try {
      const c = await oe("/qwenpaw-pet/pair-token");
      o(Array.isArray(c == null ? void 0 : c.tokens) ? c.tokens : []);
    } catch (c) {
      u.error((c == null ? void 0 : c.message) || String(c));
    } finally {
      l(!1);
    }
  }, []);
  t.useEffect(() => {
    y();
  }, [y]);
  const T = async () => {
    p(!0);
    try {
      const c = b.trim(), g = {};
      c && (g.label = c);
      const v = await j("/qwenpaw-pet/pair-token", g), z = v == null ? void 0 : v.token;
      if (typeof z != "string" || !z)
        throw new Error("server did not return a token");
      const K = window.location.origin, N = je(K, z), Q = typeof (v == null ? void 0 : v.expiresAt) == "number" ? v.expiresAt : null;
      k({ link: N, expiresAt: Q }), await Ue(N) ? u.success(e("pairLinkCopied")) : u.warning(e("pairLinkCopyFailed")), E(""), await y();
    } catch (c) {
      u.error((c == null ? void 0 : c.message) || String(c));
    } finally {
      p(!1);
    }
  }, P = async (c) => {
    try {
      await de(`/qwenpaw-pet/pair-token/${encodeURIComponent(c)}`), u.success(e("revokeSuccess")), k(null), await y();
    } catch (g) {
      u.error((g == null ? void 0 : g.message) || e("revokeFailed"));
    }
  }, B = t.useMemo(
    () => r.filter((c) => c.lastUsedAt != null),
    [r]
  ), h = t.useMemo(
    () => r.filter((c) => c.lastUsedAt == null),
    [r]
  ), [A, O] = t.useState(!1), H = async () => {
    if (h.length === 0) return;
    O(!0);
    let c = 0, g = 0;
    try {
      for (const v of h)
        try {
          await de(
            `/qwenpaw-pet/pair-token/${encodeURIComponent(v.id)}`
          ), c += 1;
        } catch {
          g += 1;
        }
      k(null), g === 0 ? u.success(e("cleanupSuccess", { count: c })) : u.warning(e("cleanupFailed")), await y();
    } finally {
      O(!1);
    }
  };
  return t.useEffect(() => {
    if (h.length === 0 && f == null) return;
    const c = window.setInterval(() => {
      y();
    }, 3e3);
    return () => window.clearInterval(c);
  }, [h.length, f, y]), t.createElement(
    x,
    { direction: "vertical", size: "large", style: { width: "100%" } },
    t.createElement(
      $,
      {
        size: "small",
        title: e("downloadCardTitle")
      },
      t.createElement(
        w,
        { type: "secondary" },
        e("downloadCardHint")
      )
    ),
    t.createElement(
      $,
      {
        size: "small",
        title: e("pairCardHeader")
      },
      t.createElement(
        x,
        { direction: "vertical", style: { width: "100%" } },
        t.createElement(
          fe,
          { type: "secondary", style: { marginBottom: 8 } },
          e("pairCardIntro")
        ),
        t.createElement(
          x,
          { style: { width: "100%" }, wrap: !0 },
          t.createElement(ce, {
            placeholder: e("pairLinkLabelPlaceholder"),
            value: b,
            maxLength: 64,
            style: { width: 260 },
            onChange: (c) => E(c.target.value),
            disabled: s
          }),
          t.createElement(
            F,
            {
              type: "primary",
              onClick: () => void T(),
              loading: s
            },
            e("copyPairLink")
          )
        ),
        f ? t.createElement(me, {
          type: "info",
          showIcon: !0,
          message: f.expiresAt ? e("pairLinkExpires", {
            date: W(f.expiresAt)
          }) : e("pairLinkNoteReveal"),
          description: t.createElement(
            x,
            { direction: "vertical", style: { width: "100%" } },
            t.createElement(ce.TextArea, {
              value: f.link,
              autoSize: { minRows: 2, maxRows: 4 },
              readOnly: !0,
              onFocus: (c) => {
                var g, v;
                return (v = (g = c.target).select) == null ? void 0 : v.call(g);
              }
            }),
            t.createElement(
              w,
              { type: "secondary", style: { fontSize: 12 } },
              e("pairLinkNoteReveal")
            )
          )
        }) : null
      )
    ),
    t.createElement(
      $,
      {
        size: "small",
        title: e("pairedDevices"),
        extra: t.createElement(
          F,
          {
            size: "small",
            onClick: () => void y(),
            loading: i
          },
          e("refresh")
        )
      },
      t.createElement(
        x,
        { direction: "vertical", style: { width: "100%" }, size: "small" },
        B.length === 0 ? t.createElement(
          w,
          { type: "secondary" },
          e("pairedNone")
        ) : t.createElement(ne, {
          dataSource: B,
          renderItem: (c) => t.createElement(We, {
            key: c.id,
            item: c,
            onRevoke: P
          })
        }),
        h.length > 0 ? t.createElement(
          x,
          {
            style: {
              width: "100%",
              justifyContent: "space-between"
            },
            wrap: !0
          },
          t.createElement(
            w,
            { type: "secondary", style: { fontSize: 12 } },
            e("pendingLinksHint", { count: h.length })
          ),
          t.createElement(
            ue,
            {
              title: e("cleanupConfirmTitle"),
              description: e("cleanupConfirmBody"),
              okText: e("revokeConfirmOk"),
              cancelText: e("revokeConfirmCancel"),
              okButtonProps: { danger: !0, loading: A },
              onConfirm: () => void H()
            },
            t.createElement(
              F,
              { danger: !0, size: "small", loading: A },
              e("cleanupPending")
            )
          )
        ) : null
      )
    )
  );
}
function Je() {
  const { tr: e } = G(t), [r, o] = t.useState([]), [i, l] = t.useState(""), [s, p] = t.useState(null), [f, k] = t.useState(!1), [b, E] = t.useState(!1), [y, T] = t.useState(!0), [P, B] = t.useState(!1), [h, A] = t.useState([]), [O, H] = t.useState(!1), [c, g] = t.useState(!1), v = t.useRef(null), [z, K] = t.useState(
    () => document.documentElement.classList.contains("dark-mode")
  );
  t.useEffect(() => {
    const n = new MutationObserver(() => {
      K(document.documentElement.classList.contains("dark-mode"));
    });
    return n.observe(document.documentElement, {
      attributes: !0,
      attributeFilter: ["class"]
    }), () => n.disconnect();
  }, []);
  const [N, Q] = t.useState(null), C = t.useCallback(async () => {
    k(!0);
    try {
      const [n, a] = await Promise.all([
        oe("/qwenpaw-pet/pets"),
        oe("/qwenpaw-pet/status")
      ]);
      o(n.pets || []), l(n.petsDir || ""), p(a.desktop ?? null), a != null && a.mode && (a != null && a.modeSource) && Q({ mode: a.mode, source: a.modeSource });
    } catch (n) {
      u.error((n == null ? void 0 : n.message) || String(n));
    } finally {
      k(!1);
    }
  }, []), we = t.useCallback(
    async (n) => {
      try {
        const a = await j("/qwenpaw-pet/mode", { mode: n });
        a != null && a.mode && (a != null && a.source) && Q({ mode: a.mode, source: a.source }), u.success(e("modeUpdated", { mode: n })), await C();
      } catch (a) {
        u.error((a == null ? void 0 : a.message) || e("modeUpdateFailed"));
      }
    },
    [C, e]
  );
  t.useEffect(() => {
    C();
  }, [C]);
  const M = (s == null ? void 0 : s.ok) === !0, _ = c || (s == null ? void 0 : s.starting) === !0 || (s == null ? void 0 : s.running) === !0 && !M;
  t.useEffect(() => {
    if (!_ || M) return;
    const n = window.setInterval(() => {
      C();
    }, 1500);
    return () => window.clearInterval(n);
  }, [_, M, C]), t.useEffect(() => {
    M && g(!1);
  }, [M]);
  const ge = async () => {
    if (!_) {
      g(!0);
      try {
        const n = await j("/qwenpaw-pet/desktop/start", {}), a = n == null ? void 0 : n.desktop, d = [n == null ? void 0 : n.message, n == null ? void 0 : n.hint].filter(Boolean).join(" ");
        n != null && n.alreadyRunning && (a != null && a.ok) ? u.success(d || e("desktopAlreadyRunning")) : (n == null ? void 0 : n.launchAttempted) === !1 && !(a != null && a.ok) ? typeof (n == null ? void 0 : n.message) == "string" && n.message.toLowerCase().includes("starting") ? u.warning(d || e("desktopStarting")) : u.error(d || e("desktopStartFailed")) : a != null && a.ok ? u.success(d || e("desktopReady")) : u.warning(d || e("desktopStarting")), await C();
      } catch (n) {
        u.error((n == null ? void 0 : n.message) || String(n));
      } finally {
        g(!1);
      }
    }
  }, ke = () => {
    A([]), T(!0), H(!1), E(!0);
  }, re = async (n, a, d) => {
    const m = a ? `${a}/${n.name}` : n.name;
    if (n.isFile) {
      const S = await new Promise(
        (R, L) => n.file(R, L)
      );
      d.push({ file: S, path: m });
      return;
    }
    if (!n.isDirectory) return;
    const I = n.createReader();
    for (; ; ) {
      const S = await new Promise(
        (R, L) => I.readEntries(R, L)
      );
      if (S.length === 0) break;
      for (const R of S)
        await re(R, m, d);
    }
  }, ye = async (n) => {
    var I, S, R;
    if (n.preventDefault(), H(!1), P) return;
    const a = (I = n.dataTransfer) == null ? void 0 : I.items, d = (S = n.dataTransfer) == null ? void 0 : S.files, m = [];
    if (a && a.length > 0)
      for (let L = 0; L < a.length; L++) {
        const D = a[L];
        if (D.kind !== "file") continue;
        const se = (R = D.webkitGetAsEntry) == null ? void 0 : R.call(D);
        if (se)
          await re(se, "", m);
        else {
          const V = D.getAsFile();
          V && m.push({ file: V, path: V.name });
        }
      }
    else if (d)
      for (let L = 0; L < d.length; L++) {
        const D = d[L];
        m.push({ file: D, path: D.name });
      }
    if (m.length === 0) {
      u.warning(e("dropFolderOrZip"));
      return;
    }
    A(m);
  }, he = (n) => {
    n.preventDefault(), P || H(!0);
  }, ve = (n) => {
    n.preventDefault(), H(!1);
  }, ie = () => {
    var n;
    P || (n = v.current) == null || n.click();
  }, Ee = (n) => {
    var m;
    const a = (m = n.target) == null ? void 0 : m.files;
    if (!a || a.length === 0) return;
    const d = [];
    for (let I = 0; I < a.length; I++) {
      const S = a[I];
      d.push({ file: S, path: S.name });
    }
    A(d), n.target.value = "";
  }, Se = async () => {
    if (h.length === 0) {
      u.warning(e("importChooseFirst"));
      return;
    }
    B(!0);
    try {
      const n = new FormData();
      for (const { file: I, path: S } of h)
        n.append("files", I, S);
      n.append("replace", y ? "true" : "false");
      const a = await fetch(U("/qwenpaw-pet/import-pet-upload"), {
        method: "POST",
        headers: q(),
        body: n
      }), d = await a.text();
      let m = null;
      try {
        m = d ? JSON.parse(d) : null;
      } catch {
        m = { raw: d };
      }
      if (!a.ok)
        throw new Error(typeof (m == null ? void 0 : m.detail) == "string" ? m.detail : d);
      u.success(
        e("importSuccess", {
          name: m.displayName || m.petId,
          path: m.path
        })
      ), E(!1), A([]), await C();
    } catch (n) {
      u.error((n == null ? void 0 : n.message) || String(n));
    } finally {
      B(!1);
    }
  }, be = async (n) => {
    const a = n.folder;
    try {
      const d = await j("/qwenpaw-pet/switch-pet", { pet_id: a });
      if (d && d.ok === !1)
        throw new Error(d.error || d.detail || e("switchFailed"));
      u.success(
        e("switchSuccess", { name: n.displayName, petId: a })
      ), await C();
    } catch (d) {
      u.error((d == null ? void 0 : d.message) || String(d));
    }
  }, Ce = t.useMemo(
    () => [
      {
        title: e("colPreview"),
        key: "preview",
        width: 112,
        render: (n, a) => t.createElement(_e, {
          key: a.folder,
          folder: a.folder
        })
      },
      { title: e("colName"), dataIndex: "displayName", key: "displayName" },
      { title: e("colFolder"), dataIndex: "folder", key: "folder" },
      {
        title: e("colManifestId"),
        key: "manifestId",
        render: (n, a) => a.manifestId ? String(a.manifestId) : t.createElement(w, { type: "secondary" }, "—")
      },
      {
        title: e("colAction"),
        key: "act",
        render: (n, a) => t.createElement(
          F,
          {
            type: "primary",
            size: "small",
            onClick: () => void be(a)
          },
          e("switch")
        )
      }
    ],
    [e]
  ), Le = (N == null ? void 0 : N.mode) === "remote", Pe = [
    t.createElement(
      x,
      { key: "actions", wrap: !0 },
      t.createElement(
        F,
        {
          type: "primary",
          onClick: ge,
          loading: c,
          disabled: _
        },
        e("startDesktop")
      ),
      t.createElement(F, { onClick: ke }, e("importPet")),
      t.createElement(
        F,
        { onClick: () => void C(), loading: f },
        e("refresh")
      )
    ),
    t.createElement(
      "div",
      { key: "meta" },
      t.createElement(
        w,
        { type: "secondary" },
        e("petsDirectory") + " "
      ),
      t.createElement(w, { code: !0 }, i || "—")
    ),
    t.createElement(
      "div",
      { key: "dh" },
      t.createElement(w, { strong: !0 }, e("desktopHealth") + " "),
      t.createElement(
        w,
        { type: s != null && s.ok ? "success" : "warning" },
        s ? JSON.stringify(s) : e("desktopUnknown")
      )
    ),
    t.createElement(Fe, {
      key: "tbl",
      rowKey: "folder",
      loading: f,
      dataSource: r,
      columns: Ce,
      pagination: !1,
      locale: {
        emptyText: e("tableEmpty")
      }
    })
  ], Ie = [
    t.createElement(Ge, { key: "pair-card" }),
    t.createElement(me, {
      key: "remote-note",
      type: "info",
      showIcon: !0,
      message: e("remoteModeNote")
    })
  ];
  return t.createElement(
    $,
    { style: { maxWidth: 880, margin: "24px auto" } },
    t.createElement(
      x,
      { direction: "vertical", size: "large", style: { width: "100%" } },
      [
        t.createElement(
          "div",
          { key: "h" },
          t.createElement(
            He,
            { level: 3, style: { marginBottom: 4 } },
            e("title")
          ),
          t.createElement(
            fe,
            { type: "secondary", style: { marginBottom: 0 } },
            e("intro")
          )
        ),
        t.createElement($e, {
          key: "mode",
          info: N,
          onChange: we
        }),
        ...Le ? Ie : Pe,
        t.createElement(
          ze,
          {
            key: "import-modal",
            title: e("modalImportTitle"),
            open: b,
            onOk: () => void Se(),
            okText: e("modalImportOk"),
            okButtonProps: { loading: P },
            cancelButtonProps: { disabled: P },
            onCancel: () => {
              P || E(!1);
            },
            destroyOnClose: !0
          },
          t.createElement(
            x,
            { direction: "vertical", style: { width: "100%" } },
            t.createElement(
              "div",
              {
                role: "button",
                tabIndex: 0,
                onClick: ie,
                onDrop: ye,
                onDragOver: he,
                onDragLeave: ve,
                onKeyDown: (n) => {
                  (n.key === "Enter" || n.key === " ") && (n.preventDefault(), ie());
                },
                style: {
                  border: `2px dashed ${O ? "#1677ff" : z ? "rgba(255,255,255,0.15)" : "#d9d9d9"}`,
                  borderRadius: 8,
                  padding: "32px 16px",
                  textAlign: "center",
                  cursor: P ? "not-allowed" : "pointer",
                  background: O ? "rgba(22, 119, 255, 0.06)" : z ? "rgba(255,255,255,0.04)" : "#fafafa",
                  transition: "border-color .15s ease, background .15s ease",
                  userSelect: "none",
                  color: O ? "#1677ff" : z ? "rgba(255,255,255,0.85)" : void 0
                }
              },
              // Line-art cube icon (matches the dropzone reference)
              t.createElement(
                "svg",
                {
                  width: 48,
                  height: 48,
                  viewBox: "0 0 24 24",
                  fill: "none",
                  stroke: "currentColor",
                  strokeWidth: 1.5,
                  strokeLinecap: "round",
                  strokeLinejoin: "round",
                  style: {
                    display: "block",
                    margin: "0 auto 12px",
                    opacity: 0.7
                  }
                },
                t.createElement("path", {
                  d: "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"
                }),
                t.createElement("polyline", {
                  points: "3.27 6.96 12 12.01 20.73 6.96"
                }),
                t.createElement("line", {
                  x1: "12",
                  y1: "22.08",
                  x2: "12",
                  y2: "12"
                })
              ),
              t.createElement(
                "div",
                {
                  style: {
                    fontSize: 16,
                    fontWeight: 600,
                    marginBottom: 4
                  }
                },
                e("dropzoneTitle")
              ),
              t.createElement(
                w,
                { type: "secondary" },
                e("dropzoneHint")
              )
            ),
            t.createElement("input", {
              ref: v,
              type: "file",
              accept: ".zip,application/zip",
              style: { display: "none" },
              onChange: Ee
            }),
            h.length === 0 ? t.createElement(
              w,
              { type: "secondary", style: { fontSize: 12 } },
              e("importFormatHint")
            ) : t.createElement(
              w,
              null,
              h.length === 1 ? e("selectedOne", { path: h[0].path }) : e("selectedMany", {
                count: h.length,
                root: h[0].path.split("/")[0] || h[0].path
              })
            ),
            t.createElement(
              Ne,
              {
                checked: y,
                onChange: (n) => T(!!n.target.checked),
                disabled: P
              },
              e("importReplace")
            )
          )
        )
      ]
    )
  );
}
class Ke {
  constructor() {
    this.id = "qwenpaw-pet";
  }
  setup() {
    var o, i;
    const r = te();
    (i = (o = window.QwenPaw).registerRoutes) == null || i.call(o, this.id, [
      {
        path: "/plugin/qwenpaw-pet/pets",
        component: Je,
        label: pe(r, "routeLabel"),
        icon: "🐾",
        priority: 42
      }
    ]);
  }
}
new Ke().setup();
