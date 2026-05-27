// React and antd are injected by the QwenPaw console host at runtime;
// vite ``external``s them so nothing here is bundled. The type-only
// import below gives ``React.useState<T>()`` and friends real generic
// signatures (erased at build time, zero runtime cost).
//
// Note: ``tsconfig.json`` sets ``"types": []`` so @types/* does not
// auto-register global namespaces. Without that, @types/react's
// ``export as namespace React`` would expose ``React`` as a global
// value and clash with the ``const React = host.React`` line below
// ("Cannot redeclare block-scoped variable 'React'").
//
// ``qwenpaw-host.d.ts`` declares the ``window.QwenPaw`` contract so the
// compiler catches host-API drift (e.g. ``host.antd`` being renamed)
// instead of every access silently degrading to ``any``.
import type * as ReactNS from "react";

import { resolvePetLocale, t } from "./locale";
import { usePetLocale } from "./usePetLocale";

const host = window.QwenPaw.host;
const React: typeof ReactNS = host.React;
const antd = host.antd;
const getApiUrl = host.getApiUrl;
const getApiToken = host.getApiToken;

const {
  Button,
  Card,
  Space,
  Table,
  Typography,
  message,
  Modal,
  Checkbox,
  Radio,
  Input,
  Popconfirm,
  List,
  Tag,
  Alert,
} = antd;
// Renamed Typography.Text to AntText: ``Text`` collides with the
// global DOM ``Text`` interface from ``lib.dom.d.ts``.
const { Title, Text: AntText, Paragraph } = Typography;

type PetRow = {
  folder: string;
  manifestId?: string | null;
  id: string;
  path: string;
  displayName: string;
};

/**
 * Mirror of ``console/src/api/authHeaders.ts``.
 *
 * The console writes the currently selected agent to a single storage
 * blob keyed ``qwenpaw-agent-storage`` (sessionStorage takes precedence
 * over localStorage so each tab can pin its own agent). The QwenPaw API
 * gateway inspects ``X-Agent-Id`` to scope permissions — omitting it
 * would silently route the pet plugin's requests under whatever
 * default agent happens to be active server-side, which is subtly
 * wrong in multi-agent setups.
 *
 * Storage shape: ``{"state": {"selectedAgent": "<agent-id>", ...}, ...}``.
 */
function getSelectedAgentId(): string | null {
  try {
    const raw =
      window.sessionStorage?.getItem("qwenpaw-agent-storage") ??
      window.localStorage?.getItem("qwenpaw-agent-storage");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const selected = parsed?.state?.selectedAgent;
    return typeof selected === "string" && selected ? selected : null;
  } catch {
    return null;
  }
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const t = getApiToken?.();
  if (t) headers.Authorization = `Bearer ${t}`;
  const agentId = getSelectedAgentId();
  if (agentId) headers["X-Agent-Id"] = agentId;
  return headers;
}

async function apiGet(path: string): Promise<any> {
  const res = await fetch(getApiUrl(path), { headers: authHeaders() });
  if (!res.ok) {
    throw new Error(`${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function apiPost(path: string, body: object): Promise<any> {
  const res = await fetch(getApiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(typeof data?.detail === "string" ? data.detail : text);
  }
  return data;
}

async function apiDelete(path: string): Promise<any> {
  const res = await fetch(getApiUrl(path), {
    method: "DELETE",
    headers: authHeaders(),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(typeof data?.detail === "string" ? data.detail : text);
  }
  return data;
}

/** Encode a UTF-8 string as base64url (no padding) — matches Python's
 *  ``base64.urlsafe_b64encode(...).rstrip(b"=")`` used by the desktop
 *  ``_decode_pair_link`` parser. */
function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Best-effort copy to clipboard with a textarea fallback for
 *  non-secure-context browsers (HTTP, file://) where ``navigator.clipboard``
 *  is unavailable. Returns whether the copy actually succeeded. */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to textarea fallback */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function formatTimestamp(ms: number | null | undefined): string {
  if (!ms || typeof ms !== "number") return "";
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return String(ms);
  }
}

/** Codex atlas cell size (row 0 col 0 = idle frame 1). */
const CELL_W = 192;
const CELL_H = 208;

function PetThumb({ folder }: { folder: string }) {
  const ref = React.useRef<HTMLCanvasElement | null>(null);
  const [err, setErr] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setErr(false);
    const canvas = ref.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    (async () => {
      try {
        const url = getApiUrl(
          `/qwenpaw-pet/pets/${encodeURIComponent(folder)}/spritesheet`,
        );
        const res = await fetch(url, { headers: authHeaders() });
        if (!res.ok || cancelled) throw new Error(String(res.status));
        const blob = await res.blob();
        const bmp = await createImageBitmap(blob);
        if (cancelled) {
          bmp.close();
          return;
        }
        const dw = 96;
        const dh = 104;
        canvas.width = dw;
        canvas.height = dh;
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, dw, dh);
        ctx.drawImage(bmp, 0, 0, CELL_W, CELL_H, 0, 0, dw, dh);
        bmp.close();
      } catch {
        if (!cancelled) setErr(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [folder]);

  if (err) {
    return React.createElement(AntText, { type: "secondary" }, "—");
  }
  return React.createElement("canvas", {
    ref,
    width: 96,
    height: 104,
    style: {
      display: "block",
      borderRadius: 8,
      border: "1px solid rgba(0,0,0,0.08)",
      background: "rgba(0,0,0,0.02)",
      imageRendering: "pixelated",
    },
  });
}

type ModeValue = "local" | "remote";
type ModeSource = "env" | "config" | "auto";
type ModeInfo = { mode: ModeValue; source: ModeSource };

type PairedToken = {
  id: string;
  label: string | null;
  createdAt: number | null;
  expiresAt: number | null;
  lastUsedAt: number | null;
};

function ModeSwitcher({
  info,
  onChange,
}: {
  info: ModeInfo | null;
  onChange: (mode: ModeValue) => Promise<void> | void;
}) {
  const { tr } = usePetLocale(React);
  const [pending, setPending] = React.useState<ModeValue | null>(null);
  const locked = info?.source === "env";
  const current = info?.mode ?? "local";

  const handleChange = async (e: any) => {
    const next = e.target?.value as ModeValue;
    if (!next || next === current) return;
    setPending(next);
    try {
      await onChange(next);
    } finally {
      setPending(null);
    }
  };

  return React.createElement(
    "div",
    null,
    React.createElement(
      "div",
      { style: { marginBottom: 8 } },
      React.createElement(AntText, { strong: true }, tr("modeSection")),
    ),
    React.createElement(
      Radio.Group,
      {
        value: current,
        onChange: handleChange,
        disabled: locked || pending !== null,
        optionType: "button",
        buttonStyle: "solid",
      },
      React.createElement(Radio.Button, { value: "local" }, tr("modeLocal")),
      React.createElement(Radio.Button, { value: "remote" }, tr("modeRemote")),
    ),
    React.createElement(
      "div",
      { style: { marginTop: 6 } },
      React.createElement(
        AntText,
        { type: "secondary", style: { fontSize: 12 } },
        current === "remote" ? tr("modeRemoteHint") : tr("modeLocalHint"),
      ),
    ),
    locked
      ? React.createElement(
          "div",
          { style: { marginTop: 6 } },
          React.createElement(Tag, { color: "warning" }, tr("modeLockedByEnv")),
        )
      : null,
  );
}

/** Composes the deep-link the desktop app expects:
 *  ``qwenpaw-pet://pair?url=<b64u(origin)>&token=<plaintext>&v=1`` */
function buildPairLink(originUrl: string, token: string): string {
  const encoded = toBase64Url(originUrl);
  return `qwenpaw-pet://pair?url=${encoded}&token=${encodeURIComponent(
    token,
  )}&v=1`;
}

function PairedDeviceItem({
  item,
  onRevoke,
}: {
  item: PairedToken;
  onRevoke: (id: string) => Promise<void>;
}) {
  const { tr } = usePetLocale(React);
  const [revoking, setRevoking] = React.useState(false);
  const label = item.label || tr("pairedLabelUnnamed");
  const lastSeen = item.lastUsedAt
    ? tr("pairedLastSeen", { date: formatTimestamp(item.lastUsedAt) })
    : tr("pairedLastSeenNever");
  const expires = item.expiresAt
    ? tr("pairedExpires", { date: formatTimestamp(item.expiresAt) })
    : "";
  const created = item.createdAt
    ? tr("pairedCreated", { date: formatTimestamp(item.createdAt) })
    : "";

  return React.createElement(
    List.Item,
    {
      actions: [
        React.createElement(
          Popconfirm,
          {
            key: "rv",
            title: tr("revokeConfirmTitle"),
            description: tr("revokeConfirmBody"),
            okText: tr("revokeConfirmOk"),
            cancelText: tr("revokeConfirmCancel"),
            okButtonProps: { danger: true, loading: revoking },
            onConfirm: async () => {
              setRevoking(true);
              try {
                await onRevoke(item.id);
              } finally {
                setRevoking(false);
              }
            },
          },
          React.createElement(
            Button,
            { danger: true, size: "small", loading: revoking },
            tr("revokeToken"),
          ),
        ),
      ],
    },
    React.createElement(List.Item.Meta, {
      title: React.createElement(
        Space,
        null,
        React.createElement(AntText, { strong: true }, label),
        React.createElement(
          AntText,
          { type: "secondary", code: true, style: { fontSize: 11 } },
          item.id,
        ),
      ),
      description: React.createElement(
        "div",
        null,
        React.createElement(
          "div",
          null,
          React.createElement(AntText, { type: "secondary" }, lastSeen),
        ),
        expires || created
          ? React.createElement(
              "div",
              { style: { fontSize: 12 } },
              React.createElement(
                AntText,
                { type: "secondary" },
                [created, expires].filter(Boolean).join(" · "),
              ),
            )
          : null,
      ),
    }),
  );
}

function PairCard() {
  const { tr } = usePetLocale(React);
  const [tokens, setTokens] = React.useState<PairedToken[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [issuing, setIssuing] = React.useState(false);
  const [pendingLink, setPendingLink] = React.useState<{
    link: string;
    expiresAt: number | null;
  } | null>(null);
  const [label, setLabel] = React.useState("");

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet("/qwenpaw-pet/pair-token");
      setTokens(Array.isArray(data?.tokens) ? data.tokens : []);
    } catch (e: any) {
      message.error(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const issueAndCopy = async () => {
    setIssuing(true);
    try {
      const trimmed = label.trim();
      const body: Record<string, unknown> = {};
      if (trimmed) body.label = trimmed;
      const res = await apiPost("/qwenpaw-pet/pair-token", body);
      const plaintext = res?.token;
      if (typeof plaintext !== "string" || !plaintext) {
        throw new Error("server did not return a token");
      }
      const origin = window.location.origin;
      const link = buildPairLink(origin, plaintext);
      const expiresAt =
        typeof res?.expiresAt === "number" ? res.expiresAt : null;
      setPendingLink({ link, expiresAt });
      const ok = await copyToClipboard(link);
      if (ok) {
        message.success(tr("pairLinkCopied"));
      } else {
        message.warning(tr("pairLinkCopyFailed"));
      }
      setLabel("");
      await refresh();
    } catch (e: any) {
      message.error(e?.message || String(e));
    } finally {
      setIssuing(false);
    }
  };

  const revoke = async (id: string) => {
    try {
      await apiDelete(`/qwenpaw-pet/pair-token/${encodeURIComponent(id)}`);
      message.success(tr("revokeSuccess"));
      // Hide the cached one-shot link if it matched the revoked token —
      // we cannot prove it without the plaintext, so just clear on any
      // revoke to avoid showing a stale "valid" link.
      setPendingLink(null);
      await refresh();
    } catch (e: any) {
      message.error(e?.message || tr("revokeFailed"));
    }
  };

  // "Paired devices" should be the ones that actually connected at least
  // once. Tokens that were issued but never used are just outstanding
  // links — surface them separately so the list does not grow on every
  // click of "Copy pairing link".
  const pairedTokens = React.useMemo(
    () => tokens.filter((t) => t.lastUsedAt != null),
    [tokens],
  );
  const pendingTokens = React.useMemo(
    () => tokens.filter((t) => t.lastUsedAt == null),
    [tokens],
  );

  const [cleaning, setCleaning] = React.useState(false);
  const cleanupPending = async () => {
    if (pendingTokens.length === 0) return;
    setCleaning(true);
    let succeeded = 0;
    let failed = 0;
    try {
      for (const t of pendingTokens) {
        try {
          await apiDelete(
            `/qwenpaw-pet/pair-token/${encodeURIComponent(t.id)}`,
          );
          succeeded += 1;
        } catch {
          failed += 1;
        }
      }
      setPendingLink(null);
      if (failed === 0) {
        message.success(tr("cleanupSuccess", { count: succeeded }));
      } else {
        message.warning(tr("cleanupFailed"));
      }
      await refresh();
    } finally {
      setCleaning(false);
    }
  };

  // While there are unused links outstanding (or we just issued one), a
  // desktop may be about to pair — poll lightly so the "Paired devices"
  // list populates without needing a manual refresh click.
  React.useEffect(() => {
    if (pendingTokens.length === 0 && pendingLink == null) return;
    const timer = window.setInterval(() => {
      void refresh();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [pendingTokens.length, pendingLink, refresh]);

  return React.createElement(
    Space,
    { direction: "vertical", size: "large", style: { width: "100%" } },
    React.createElement(
      Card,
      {
        size: "small",
        title: tr("downloadCardTitle"),
      },
      React.createElement(
        AntText,
        { type: "secondary" },
        tr("downloadCardHint"),
      ),
    ),
    React.createElement(
      Card,
      {
        size: "small",
        title: tr("pairCardHeader"),
      },
      React.createElement(
        Space,
        { direction: "vertical", style: { width: "100%" } },
        React.createElement(
          Paragraph,
          { type: "secondary", style: { marginBottom: 8 } },
          tr("pairCardIntro"),
        ),
        React.createElement(
          Space,
          { style: { width: "100%" }, wrap: true },
          React.createElement(Input, {
            placeholder: tr("pairLinkLabelPlaceholder"),
            value: label,
            maxLength: 64,
            style: { width: 260 },
            onChange: (e: any) => setLabel(e.target.value),
            disabled: issuing,
          }),
          React.createElement(
            Button,
            {
              type: "primary",
              onClick: () => void issueAndCopy(),
              loading: issuing,
            },
            tr("copyPairLink"),
          ),
        ),
        pendingLink
          ? React.createElement(Alert, {
              type: "info",
              showIcon: true,
              message: pendingLink.expiresAt
                ? tr("pairLinkExpires", {
                    date: formatTimestamp(pendingLink.expiresAt),
                  })
                : tr("pairLinkNoteReveal"),
              description: React.createElement(
                Space,
                { direction: "vertical", style: { width: "100%" } },
                React.createElement(Input.TextArea, {
                  value: pendingLink.link,
                  autoSize: { minRows: 2, maxRows: 4 },
                  readOnly: true,
                  onFocus: (e: any) => e.target.select?.(),
                }),
                React.createElement(
                  AntText,
                  { type: "secondary", style: { fontSize: 12 } },
                  tr("pairLinkNoteReveal"),
                ),
              ),
            })
          : null,
      ),
    ),
    React.createElement(
      Card,
      {
        size: "small",
        title: tr("pairedDevices"),
        extra: React.createElement(
          Button,
          {
            size: "small",
            onClick: () => void refresh(),
            loading,
          },
          tr("refresh"),
        ),
      },
      React.createElement(
        Space,
        { direction: "vertical", style: { width: "100%" }, size: "small" },
        pairedTokens.length === 0
          ? React.createElement(
              AntText,
              { type: "secondary" },
              tr("pairedNone"),
            )
          : React.createElement(List, {
              dataSource: pairedTokens,
              renderItem: (item: PairedToken) =>
                React.createElement(PairedDeviceItem, {
                  key: item.id,
                  item,
                  onRevoke: revoke,
                }),
            }),
        pendingTokens.length > 0
          ? React.createElement(
              Space,
              {
                style: {
                  width: "100%",
                  justifyContent: "space-between",
                },
                wrap: true,
              },
              React.createElement(
                AntText,
                { type: "secondary", style: { fontSize: 12 } },
                tr("pendingLinksHint", { count: pendingTokens.length }),
              ),
              React.createElement(
                Popconfirm,
                {
                  title: tr("cleanupConfirmTitle"),
                  description: tr("cleanupConfirmBody"),
                  okText: tr("revokeConfirmOk"),
                  cancelText: tr("revokeConfirmCancel"),
                  okButtonProps: { danger: true, loading: cleaning },
                  onConfirm: () => void cleanupPending(),
                },
                React.createElement(
                  Button,
                  { danger: true, size: "small", loading: cleaning },
                  tr("cleanupPending"),
                ),
              ),
            )
          : null,
      ),
    ),
  );
}

function PetControlPage() {
  const { tr } = usePetLocale(React);
  const [pets, setPets] = React.useState<PetRow[]>([]);
  const [petsDir, setPetsDir] = React.useState<string>("");
  const [desktop, setDesktop] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(false);

  const [importOpen, setImportOpen] = React.useState(false);
  const [importReplace, setImportReplace] = React.useState(true);
  const [importing, setImporting] = React.useState(false);
  const [selectedFiles, setSelectedFiles] = React.useState<
    { file: File; path: string }[]
  >([]);
  const [dragOver, setDragOver] = React.useState(false);
  const [startingDesktop, setStartingDesktop] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const [isDark, setIsDark] = React.useState(() =>
    document.documentElement.classList.contains("dark-mode"),
  );
  React.useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark-mode"));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  const [modeInfo, setModeInfo] = React.useState<ModeInfo | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const [petData, st] = await Promise.all([
        apiGet("/qwenpaw-pet/pets"),
        apiGet("/qwenpaw-pet/status"),
      ]);
      setPets(petData.pets || []);
      setPetsDir(petData.petsDir || "");
      setDesktop(st.desktop ?? null);
      if (st?.mode && st?.modeSource) {
        setModeInfo({ mode: st.mode, source: st.modeSource });
      }
    } catch (e: any) {
      message.error(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const onModeChange = React.useCallback(
    async (next: ModeValue) => {
      try {
        const res = await apiPost("/qwenpaw-pet/mode", { mode: next });
        if (res?.mode && res?.source) {
          setModeInfo({ mode: res.mode, source: res.source });
        }
        message.success(tr("modeUpdated", { mode: next }));
        await refresh();
      } catch (e: any) {
        message.error(e?.message || tr("modeUpdateFailed"));
      }
    },
    [refresh, tr],
  );

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const desktopReady = desktop?.ok === true;
  const desktopBusy =
    startingDesktop ||
    desktop?.starting === true ||
    (desktop?.running === true && !desktopReady);

  React.useEffect(() => {
    if (!desktopBusy || desktopReady) return;
    const timer = window.setInterval(() => {
      void refresh();
    }, 1500);
    return () => window.clearInterval(timer);
  }, [desktopBusy, desktopReady, refresh]);

  React.useEffect(() => {
    if (desktopReady) setStartingDesktop(false);
  }, [desktopReady]);

  const startDesktop = async () => {
    if (desktopBusy) return;
    setStartingDesktop(true);
    try {
      const r = await apiPost("/qwenpaw-pet/desktop/start", {});
      const h = r?.desktop;
      const detail = [r?.message, r?.hint].filter(Boolean).join(" ");
      if (r?.alreadyRunning && h?.ok) {
        message.success(detail || tr("desktopAlreadyRunning"));
      } else if (r?.launchAttempted === false && !h?.ok) {
        if (
          typeof r?.message === "string" &&
          r.message.toLowerCase().includes("starting")
        ) {
          message.warning(detail || tr("desktopStarting"));
        } else {
          message.error(detail || tr("desktopStartFailed"));
        }
      } else if (h?.ok) {
        message.success(detail || tr("desktopReady"));
      } else {
        message.warning(detail || tr("desktopStarting"));
      }
      await refresh();
    } catch (e: any) {
      message.error(e?.message || String(e));
    } finally {
      setStartingDesktop(false);
    }
  };

  const openImport = () => {
    setSelectedFiles([]);
    setImportReplace(true);
    setDragOver(false);
    setImportOpen(true);
  };

  // Recursively flatten a webkit FileSystemEntry into File + relative path
  // pairs. Used to translate a dropped folder into a multipart upload
  // that mirrors the on-disk layout (so the server can locate pet.json).
  const traverseEntry = async (
    entry: any,
    prefix: string,
    out: { file: File; path: string }[],
  ): Promise<void> => {
    const currentPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isFile) {
      const file: File = await new Promise((resolve, reject) =>
        entry.file(resolve, reject),
      );
      out.push({ file, path: currentPath });
      return;
    }
    if (!entry.isDirectory) return;
    const reader = entry.createReader();
    // readEntries returns at most ~100 entries per call; drain to empty.
    while (true) {
      const batch: any[] = await new Promise((resolve, reject) =>
        reader.readEntries(resolve, reject),
      );
      if (batch.length === 0) break;
      for (const child of batch) {
        await traverseEntry(child, currentPath, out);
      }
    }
  };

  const onDropFiles = async (e: any) => {
    e.preventDefault();
    setDragOver(false);
    if (importing) return;
    const items: DataTransferItemList | undefined = e.dataTransfer?.items;
    const fallbackFiles: FileList | undefined = e.dataTransfer?.files;
    const collected: { file: File; path: string }[] = [];
    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.kind !== "file") continue;
        const entry = (it as any).webkitGetAsEntry?.();
        if (entry) {
          await traverseEntry(entry, "", collected);
        } else {
          const f = it.getAsFile();
          if (f) collected.push({ file: f, path: f.name });
        }
      }
    } else if (fallbackFiles) {
      for (let i = 0; i < fallbackFiles.length; i++) {
        const f = fallbackFiles[i];
        collected.push({ file: f, path: f.name });
      }
    }
    if (collected.length === 0) {
      message.warning(tr("dropFolderOrZip"));
      return;
    }
    setSelectedFiles(collected);
  };

  const onDragOver = (e: any) => {
    e.preventDefault();
    if (!importing) setDragOver(true);
  };
  const onDragLeave = (e: any) => {
    e.preventDefault();
    setDragOver(false);
  };

  const onClickDropzone = () => {
    if (!importing) fileInputRef.current?.click();
  };

  const onPickFiles = (e: any) => {
    const list: FileList | null = e.target?.files;
    if (!list || list.length === 0) return;
    const collected: { file: File; path: string }[] = [];
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      collected.push({ file: f, path: f.name });
    }
    setSelectedFiles(collected);
    // Reset so picking the same file twice still fires onChange.
    e.target.value = "";
  };

  const submitImport = async () => {
    if (selectedFiles.length === 0) {
      message.warning(tr("importChooseFirst"));
      return;
    }
    setImporting(true);
    try {
      const form = new FormData();
      for (const { file, path } of selectedFiles) {
        form.append("files", file, path);
      }
      form.append("replace", importReplace ? "true" : "false");
      const res = await fetch(getApiUrl("/qwenpaw-pet/import-pet-upload"), {
        method: "POST",
        headers: authHeaders(),
        body: form,
      });
      const text = await res.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = { raw: text };
      }
      if (!res.ok) {
        throw new Error(typeof data?.detail === "string" ? data.detail : text);
      }
      message.success(
        tr("importSuccess", {
          name: data.displayName || data.petId,
          path: data.path,
        }),
      );
      setImportOpen(false);
      setSelectedFiles([]);
      await refresh();
    } catch (e: any) {
      message.error(e?.message || String(e));
    } finally {
      setImporting(false);
    }
  };

  const switchTo = async (row: PetRow) => {
    // Desktop resolves pets/<folder>; manifest "id" may differ (e.g. goose-default vs folder goose).
    const pet_id = row.folder;
    try {
      const r = await apiPost("/qwenpaw-pet/switch-pet", { pet_id });
      if (r && r.ok === false) {
        throw new Error(r.error || r.detail || tr("switchFailed"));
      }
      message.success(
        tr("switchSuccess", { name: row.displayName, petId: pet_id }),
      );
      await refresh();
    } catch (e: any) {
      message.error(e?.message || String(e));
    }
  };

  const columns = React.useMemo(
    () => [
      {
        title: tr("colPreview"),
        key: "preview",
        width: 112,
        render: (_: unknown, row: PetRow) =>
          React.createElement(PetThumb, {
            key: row.folder,
            folder: row.folder,
          }),
      },
      { title: tr("colName"), dataIndex: "displayName", key: "displayName" },
      { title: tr("colFolder"), dataIndex: "folder", key: "folder" },
      {
        title: tr("colManifestId"),
        key: "manifestId",
        render: (_: unknown, row: PetRow) =>
          row.manifestId
            ? String(row.manifestId)
            : React.createElement(AntText, { type: "secondary" }, "—"),
      },
      {
        title: tr("colAction"),
        key: "act",
        render: (_: unknown, row: PetRow) =>
          React.createElement(
            Button,
            {
              type: "primary",
              size: "small",
              onClick: () => void switchTo(row),
            },
            tr("switch"),
          ),
      },
    ],
    [tr],
  );

  const isRemote = modeInfo?.mode === "remote";

  const localSection = [
    React.createElement(
      Space,
      { key: "actions", wrap: true },
      React.createElement(
        Button,
        {
          type: "primary",
          onClick: startDesktop,
          loading: startingDesktop,
          disabled: desktopBusy,
        },
        tr("startDesktop"),
      ),
      React.createElement(Button, { onClick: openImport }, tr("importPet")),
      React.createElement(
        Button,
        { onClick: () => void refresh(), loading },
        tr("refresh"),
      ),
    ),
    React.createElement(
      "div",
      { key: "meta" },
      React.createElement(
        AntText,
        { type: "secondary" },
        tr("petsDirectory") + " ",
      ),
      React.createElement(AntText, { code: true }, petsDir || "—"),
    ),
    React.createElement(
      "div",
      { key: "dh" },
      React.createElement(AntText, { strong: true }, tr("desktopHealth") + " "),
      React.createElement(
        AntText,
        { type: desktop?.ok ? "success" : "warning" },
        desktop ? JSON.stringify(desktop) : tr("desktopUnknown"),
      ),
    ),
    React.createElement(Table, {
      key: "tbl",
      rowKey: "folder",
      loading,
      dataSource: pets,
      columns,
      pagination: false,
      locale: {
        emptyText: tr("tableEmpty"),
      },
    }),
  ];

  const remoteSection = [
    React.createElement(PairCard, { key: "pair-card" }),
    React.createElement(Alert, {
      key: "remote-note",
      type: "info",
      showIcon: true,
      message: tr("remoteModeNote"),
    }),
  ];

  return React.createElement(
    Card,
    { style: { maxWidth: 880, margin: "24px auto" } },
    React.createElement(
      Space,
      { direction: "vertical", size: "large", style: { width: "100%" } },
      [
        React.createElement(
          "div",
          { key: "h" },
          React.createElement(
            Title,
            { level: 3, style: { marginBottom: 4 } },
            tr("title"),
          ),
          React.createElement(
            Paragraph,
            { type: "secondary", style: { marginBottom: 0 } },
            tr("intro"),
          ),
        ),
        React.createElement(ModeSwitcher, {
          key: "mode",
          info: modeInfo,
          onChange: onModeChange,
        }),
        ...(isRemote ? remoteSection : localSection),
        React.createElement(
          Modal,
          {
            key: "import-modal",
            title: tr("modalImportTitle"),
            open: importOpen,
            onOk: () => void submitImport(),
            okText: tr("modalImportOk"),
            okButtonProps: { loading: importing },
            cancelButtonProps: { disabled: importing },
            onCancel: () => {
              if (!importing) setImportOpen(false);
            },
            destroyOnClose: true,
          },
          React.createElement(
            Space,
            { direction: "vertical", style: { width: "100%" } },
            React.createElement(
              "div",
              {
                role: "button",
                tabIndex: 0,
                onClick: onClickDropzone,
                onDrop: onDropFiles,
                onDragOver: onDragOver,
                onDragLeave: onDragLeave,
                onKeyDown: (e: any) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onClickDropzone();
                  }
                },
                style: {
                  border: `2px dashed ${
                    dragOver
                      ? "#1677ff"
                      : isDark
                      ? "rgba(255,255,255,0.15)"
                      : "#d9d9d9"
                  }`,
                  borderRadius: 8,
                  padding: "32px 16px",
                  textAlign: "center" as const,
                  cursor: importing ? "not-allowed" : "pointer",
                  background: dragOver
                    ? "rgba(22, 119, 255, 0.06)"
                    : isDark
                    ? "rgba(255,255,255,0.04)"
                    : "#fafafa",
                  transition: "border-color .15s ease, background .15s ease",
                  userSelect: "none" as const,
                  color: dragOver
                    ? "#1677ff"
                    : isDark
                    ? "rgba(255,255,255,0.85)"
                    : undefined,
                },
              },
              // Line-art cube icon (matches the dropzone reference)
              React.createElement(
                "svg",
                {
                  width: 48,
                  height: 48,
                  viewBox: "0 0 24 24",
                  fill: "none",
                  stroke: "currentColor",
                  strokeWidth: 1.5,
                  strokeLinecap: "round" as const,
                  strokeLinejoin: "round" as const,
                  style: {
                    display: "block",
                    margin: "0 auto 12px",
                    opacity: 0.7,
                  },
                },
                React.createElement("path", {
                  d:
                    "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2" +
                    " 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0" +
                    "l7-4A2 2 0 0 0 21 16z",
                }),
                React.createElement("polyline", {
                  points: "3.27 6.96 12 12.01 20.73 6.96",
                }),
                React.createElement("line", {
                  x1: "12",
                  y1: "22.08",
                  x2: "12",
                  y2: "12",
                }),
              ),
              React.createElement(
                "div",
                {
                  style: {
                    fontSize: 16,
                    fontWeight: 600,
                    marginBottom: 4,
                  },
                },
                tr("dropzoneTitle"),
              ),
              React.createElement(
                AntText,
                { type: "secondary" },
                tr("dropzoneHint"),
              ),
            ),
            React.createElement("input", {
              ref: fileInputRef,
              type: "file",
              accept: ".zip,application/zip",
              style: { display: "none" },
              onChange: onPickFiles,
            }),
            selectedFiles.length === 0
              ? React.createElement(
                  AntText,
                  { type: "secondary", style: { fontSize: 12 } },
                  tr("importFormatHint"),
                )
              : React.createElement(
                  AntText,
                  null,
                  selectedFiles.length === 1
                    ? tr("selectedOne", { path: selectedFiles[0].path })
                    : tr("selectedMany", {
                        count: selectedFiles.length,
                        root:
                          selectedFiles[0].path.split("/")[0] ||
                          selectedFiles[0].path,
                      }),
                ),
            React.createElement(
              Checkbox,
              {
                checked: importReplace,
                onChange: (e: any) => setImportReplace(!!e.target.checked),
                disabled: importing,
              },
              tr("importReplace"),
            ),
          ),
        ),
      ],
    ),
  );
}

class QwenPawPetPlugin {
  readonly id = "qwenpaw-pet";

  setup(): void {
    const locale = resolvePetLocale();
    window.QwenPaw.registerRoutes?.(this.id, [
      {
        path: "/plugin/qwenpaw-pet/pets",
        component: PetControlPage,
        label: t(locale, "routeLabel"),
        icon: "🐾",
        priority: 42,
      },
    ]);
  }
}

new QwenPawPetPlugin().setup();
