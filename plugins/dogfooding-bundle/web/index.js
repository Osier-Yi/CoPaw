const A = window.QwenPaw;
if (!A?.host?.React || !A?.host?.antd)
  throw new Error("window.QwenPaw.host not found");
const { React: o, antd: q, antdIcons: Q } = A.host, { Card: G, Button: O, Alert: p, Typography: M, Descriptions: I, Modal: H, Checkbox: L, Input: z, Space: W, Divider: Y } = q, { LoginOutlined: X, LikeOutlined: V, MehOutlined: Z, DislikeOutlined: ee } = Q, { Text: N } = M, v = "https://proxy.agentscope.design", B = "qwenpaw-proxy-v1.0", te = "qwenpaw_auth_token", E = "dogfooding-bundle", $ = "qwenpaw_dogfooding", U = "dogfooding_feedback_submitted", ne = [
  "没理解我的意图",
  "任务没有完成",
  "步骤太繁琐",
  "结果有误",
  "回复风格有问题",
  "存在安全风险",
  "响应太慢",
  "其他"
];
console.info(`[${E}] frontend runtime detected`);
function _(e, t) {
  if (!e || typeof e != "object" || e === null)
    return t;
  const n = e, { detail: s } = n;
  return typeof s == "string" ? s : Array.isArray(s) ? s.map((a) => a && typeof a == "object" && "msg" in a ? String(a.msg) : JSON.stringify(a)).filter(Boolean).join("; ") || t : typeof n.message == "string" ? n.message : t;
}
async function oe(e) {
  const t = `${v.replace(
    /\/$/,
    ""
  )}/v1/integration/sso/init`, n = await fetch(t, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Integration-Client-Secret": B
    },
    body: JSON.stringify({ redirectUri: e })
  }), s = await n.text();
  let r = null;
  if (s)
    try {
      r = JSON.parse(s);
    } catch {
      r = null;
    }
  if (!n.ok) {
    const l = s || `HTTP ${n.status}`;
    throw new Error(_(r, l));
  }
  const c = (r && typeof r == "object" ? r : {}).loginUrl?.trim();
  if (!c)
    throw new Error("SSO init 未返回 loginUrl");
  return c;
}
async function re(e, t) {
  const n = `${v.replace(
    /\/$/,
    ""
  )}/v1/integration/sso/token`, s = await fetch(n, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Integration-Client-Secret": B
    },
    body: JSON.stringify({ code: e, state: t })
  }), r = await s.text();
  let a = null;
  if (r)
    try {
      a = JSON.parse(r);
    } catch {
      a = null;
    }
  if (!s.ok) {
    const c = r || `HTTP ${s.status}`;
    throw new Error(_(a, c));
  }
  return a && typeof a == "object" ? a : {};
}
function se() {
  const e = new URL(window.location.href);
  return e.searchParams.delete("code"), e.searchParams.delete("state"), e.toString();
}
function ae() {
  const { search: e, hash: t } = window.location;
  if (e && e.length > 1)
    return new URLSearchParams(e);
  const n = t.indexOf("?");
  return n !== -1 ? new URLSearchParams(t.slice(n + 1)) : null;
}
function ie() {
  const e = ae();
  if (!e) return null;
  const t = e.get("code")?.trim() ?? "", n = e.get("state")?.trim() ?? "";
  return !t || !n ? null : { code: t, state: n };
}
function ce() {
  const e = new URL(window.location.href);
  let t = !1;
  (e.searchParams.has("code") || e.searchParams.has("state")) && (e.searchParams.delete("code"), e.searchParams.delete("state"), t = !0);
  const n = e.hash, s = n.indexOf("?");
  if (s !== -1) {
    const c = new URLSearchParams(n.slice(s + 1));
    if (c.has("code") || c.has("state")) {
      c.delete("code"), c.delete("state");
      const l = n.slice(0, s), u = c.toString();
      e.hash = u ? `${l}?${u}` : l, t = !0;
    }
  }
  if (!t) return;
  const r = e.searchParams.toString(), a = r ? `?${r}` : "";
  window.history.replaceState(
    {},
    "",
    `${e.origin}${e.pathname}${a}${e.hash}`
  );
}
function K() {
  const e = {
    "Content-Type": "application/json"
  };
  try {
    const t = localStorage.getItem(te);
    t && (e.Authorization = `Bearer ${t}`);
  } catch {
  }
  return e;
}
async function le(e) {
  const t = new URL("/api/dogfooding-account/", window.location.origin).href, n = await fetch(t, {
    method: "POST",
    headers: K(),
    body: JSON.stringify({ user_account: e })
  }), s = await n.text();
  let r = null;
  if (s)
    try {
      r = JSON.parse(s);
    } catch {
      r = null;
    }
  if (!n.ok) {
    const c = s || `HTTP ${n.status}`;
    throw new Error(_(r, c));
  }
  const a = r;
  if (!a || typeof a.ok != "boolean" || a.ok !== !0 || typeof a.path != "string")
    throw new Error("保存接口返回格式异常（期望 { ok: true, path: string }）");
  return a;
}
function D() {
  try {
    const e = localStorage.getItem(U);
    if (!e) return {};
    const t = JSON.parse(e);
    return t && typeof t == "object" ? t : {};
  } catch {
    return {};
  }
}
function ue(e, t) {
  const n = D();
  n[e] = t;
  try {
    localStorage.setItem(U, JSON.stringify(n));
  } catch {
  }
}
function J(e) {
  const t = e?.output;
  if (!Array.isArray(t)) return null;
  for (let n = t.length - 1; n >= 0; n -= 1) {
    const r = t[n]?.metadata;
    if (!r) continue;
    const a = r.metadata, c = r[$] || a?.[$];
    if (c?.trace_id) return c;
  }
  return null;
}
function de(e) {
  if (J(e)?.trace_id) return !0;
  const n = e?.usage;
  return String(n?.model_name || "").toLowerCase().includes("dogfooding");
}
function R(e) {
  const t = e?.output;
  if (Array.isArray(t))
    for (let n = t.length - 1; n >= 0; n -= 1) {
      const r = t[n]?.original_id;
      if (typeof r == "string" && r) return r;
    }
  return String(e?.id || "");
}
async function me(e) {
  const t = await fetch("/api/dogfooding-feedback/", {
    method: "POST",
    headers: K(),
    body: JSON.stringify(e)
  }), n = await t.text();
  let s = null;
  if (n)
    try {
      s = JSON.parse(n);
    } catch {
      s = null;
    }
  if (!t.ok) {
    const r = n || `HTTP ${t.status}`;
    throw new Error(_(s, r));
  }
}
function ge({ data: e }) {
  const t = J(e), n = t?.trace_id || "", s = t?.session_id || A.host.getCurrentSessionId?.() || "", r = n || R(e), [a, c] = o.useState(!1), [l, u] = o.useState(
    null
  ), [b, f] = o.useState(""), [h, w] = o.useState(!1), [d, g] = o.useState(
    []
  ), [y, m] = o.useState("");
  if (o.useEffect(() => {
    if (!r) return;
    const i = D()[r];
    i && u(i);
  }, [r]), !de(e) || !s)
    return null;
  const k = async (i, j = "", F = "") => {
    c(!0), f("");
    try {
      await me({
        trace_id: n,
        conversation_id: String(s),
        score_label: i,
        channel_type: "web",
        feedback_reason: j,
        feedback_comment: F,
        response_id: t?.response_id || R(e)
      }), ue(r, i), u(i), w(!1), g([]), m("");
    } catch (C) {
      f(C instanceof Error ? C.message : "反馈提交失败");
    } finally {
      c(!1);
    }
  }, S = (i) => {
    if (!(l || a)) {
      if (i === "bad") {
        w(!0);
        return;
      }
      k(i);
    }
  }, T = () => {
    if (!d.length) {
      f("请至少选择一个问题原因");
      return;
    }
    k("bad", d.join("；"), y.trim());
  }, x = l === "good" ? "优秀" : l === "fine" ? "一般" : l === "bad" ? "糟糕" : "";
  return /* @__PURE__ */ o.createElement("div", { style: { marginTop: 8 } }, /* @__PURE__ */ o.createElement(Y, { style: { margin: "8px 0" } }), /* @__PURE__ */ o.createElement("div", { style: { fontSize: 13, color: "#666", marginBottom: 8 } }, "这个回答对你有帮助吗？"), l ? /* @__PURE__ */ o.createElement(
    p,
    {
      type: "success",
      showIcon: !0,
      message: `已反馈：${x}`,
      style: { marginBottom: 0 }
    }
  ) : /* @__PURE__ */ o.createElement(W, { wrap: !0 }, /* @__PURE__ */ o.createElement(
    O,
    {
      icon: /* @__PURE__ */ o.createElement(ee, null),
      loading: a,
      onClick: () => S("bad")
    },
    "糟糕"
  ), /* @__PURE__ */ o.createElement(
    O,
    {
      icon: /* @__PURE__ */ o.createElement(Z, null),
      loading: a,
      onClick: () => S("fine")
    },
    "一般"
  ), /* @__PURE__ */ o.createElement(
    O,
    {
      icon: /* @__PURE__ */ o.createElement(V, null),
      loading: a,
      onClick: () => S("good")
    },
    "优秀"
  )), b ? /* @__PURE__ */ o.createElement(
    p,
    {
      style: { marginTop: 8 },
      type: "error",
      showIcon: !0,
      message: b
    }
  ) : null, /* @__PURE__ */ o.createElement(
    H,
    {
      title: "请告诉我们哪里不好",
      open: h,
      okText: "提交反馈",
      cancelText: "取消",
      confirmLoading: a,
      onOk: T,
      onCancel: () => {
        w(!1), g([]), m(""), f("");
      }
    },
    /* @__PURE__ */ o.createElement(
      L.Group,
      {
        style: { display: "flex", flexDirection: "column", gap: 8 },
        value: d,
        onChange: (i) => g(i)
      },
      ne.map((i) => /* @__PURE__ */ o.createElement(L, { key: i, value: i }, i))
    ),
    /* @__PURE__ */ o.createElement(
      z.TextArea,
      {
        style: { marginTop: 12 },
        rows: 3,
        placeholder: "补充说明（可选）",
        value: y,
        onChange: (i) => m(i.target.value)
      }
    )
  ));
}
function P(e) {
  return e == null || e === "" ? "—" : String(e);
}
function fe(e) {
  const t = e.trim();
  if (!t) return "";
  if (t.length <= 11) return `${t.slice(0, 4)}****`;
  const n = t.startsWith("sk-as-") ? 10 : 6, s = 4, r = "*".repeat(
    Math.min(12, Math.max(4, t.length - n - s))
  );
  return `${t.slice(0, n)}${r}${t.slice(-s)}`;
}
function pe() {
  const [e, t] = o.useState(!1), [n, s] = o.useState(""), [r, a] = o.useState(!1), [c, l] = o.useState(""), [u, b] = o.useState(
    null
  ), [f, h] = o.useState(
    null
  );
  o.useEffect(() => {
    const d = ie();
    if (!d) return;
    const g = `dogfooding_sso:${d.state}`;
    try {
      const m = sessionStorage.getItem(g);
      if (m === "done" || m === "pending") return;
      sessionStorage.setItem(g, "pending");
    } catch {
    }
    let y = !1;
    return (async () => {
      a(!0), l("");
      try {
        const m = await re(
          d.code,
          d.state
        );
        if (y) return;
        ce();
        const k = m.proxyApiKey?.trim() ?? "", S = m.name ?? null, T = m.account ?? null;
        b({
          name: S,
          account: T,
          proxyApiKey: k || null
        });
        const x = T?.trim();
        if (x)
          try {
            const i = await le(x);
            h({ kind: "success", path: i.path });
          } catch (i) {
            h({
              kind: "error",
              message: i instanceof Error ? i.message : "调用本机保存工号接口失败"
            });
          }
        else
          h({
            kind: "skipped",
            reason: "SSO 返回中无工号，已跳过写入本机 dogfooding 用户文件"
          });
        try {
          sessionStorage.setItem(g, "done");
        } catch {
        }
      } catch (m) {
        try {
          sessionStorage.removeItem(g);
        } catch {
        }
        y || l(
          m instanceof Error ? m.message : "SSO token 交换失败"
        );
      } finally {
        y || a(!1);
      }
    })(), () => {
      y = !0;
      try {
        sessionStorage.getItem(g) === "pending" && sessionStorage.removeItem(g);
      } catch {
      }
    };
  }, []);
  const w = async () => {
    t(!0), s("");
    try {
      const d = se(), g = await oe(d);
      window.location.assign(g);
    } catch (d) {
      s(
        d instanceof Error ? d.message : "发起集团账号登录失败"
      );
    } finally {
      t(!1);
    }
  };
  return /* @__PURE__ */ o.createElement("div", { style: { padding: 24, maxWidth: 820, margin: "0 auto" } }, /* @__PURE__ */ o.createElement(G, null, /* @__PURE__ */ o.createElement(
    O,
    {
      type: "primary",
      style: { marginTop: 0, marginBottom: 12 },
      loading: e,
      onClick: w
    },
    "阿里集团账号登录"
  ), n ? /* @__PURE__ */ o.createElement(
    p,
    {
      style: { marginBottom: 12 },
      type: "error",
      message: n
    }
  ) : null, r ? /* @__PURE__ */ o.createElement(
    p,
    {
      style: { marginBottom: 12 },
      type: "info",
      message: "正在使用登录回调参数换取 API 密钥…"
    }
  ) : null, c ? /* @__PURE__ */ o.createElement(
    p,
    {
      style: { marginBottom: 12 },
      type: "error",
      message: c
    }
  ) : null, u ? /* @__PURE__ */ o.createElement("div", { style: { marginTop: 16 } }, /* @__PURE__ */ o.createElement(I, { bordered: !0, size: "small", column: 1 }, /* @__PURE__ */ o.createElement(I.Item, { label: "API 密钥" }, u?.proxyApiKey ? /* @__PURE__ */ o.createElement(N, { code: !0, copyable: { text: u.proxyApiKey } }, fe(u.proxyApiKey)) : P(u?.proxyApiKey)), /* @__PURE__ */ o.createElement(I.Item, { label: "花名/姓名" }, P(u?.name)), /* @__PURE__ */ o.createElement(I.Item, { label: "工号" }, P(u?.account))), f?.kind === "success" ? /* @__PURE__ */ o.createElement(
    p,
    {
      type: "success",
      showIcon: !0,
      style: { marginBottom: 12 },
      message: "已写入本机 dogfooding 用户文件",
      description: /* @__PURE__ */ o.createElement(N, { code: !0, copyable: !0 }, f.path)
    }
  ) : null, f?.kind === "skipped" ? /* @__PURE__ */ o.createElement(
    p,
    {
      type: "warning",
      showIcon: !0,
      style: { marginBottom: 12 },
      message: f.reason
    }
  ) : null, f?.kind === "error" ? /* @__PURE__ */ o.createElement(
    p,
    {
      type: "error",
      showIcon: !0,
      style: { marginBottom: 12 },
      message: "保存工号到本机失败",
      description: f.message
    }
  ) : null) : null));
}
class ye {
  constructor() {
    this.id = E;
  }
  setup() {
    if (typeof window.QwenPaw.registerRoutes != "function") {
      console.error(`[${E}] registerRoutes is not available`);
      return;
    }
    window.QwenPaw.registerRoutes?.(this.id, [
      {
        path: "/join-dogfooding",
        component: pe,
        label: "Join dogfooding plan",
        icon: /* @__PURE__ */ o.createElement(X, { size: 14 }),
        priority: 1
      }
    ]), window.QwenPaw.chat?.response?.append?.(
      E,
      ({ data: n }) => !n || typeof n != "object" ? null : /* @__PURE__ */ o.createElement(ge, { data: n }),
      { id: `${E}.feedback-bar`, order: 10 }
    );
  }
}
new ye().setup();
