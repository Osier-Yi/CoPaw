import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Input,
  Modal,
  Select,
  Segmented,
  Tag,
  Spin,
} from "antd";
import {
  MessageCircleQuestion,
  FileText,
  Sparkles,
  Eye,
  Pencil,
  Plus,
  Link2,
} from "lucide-react";
import { useReportScreenshots } from "./useReportScreenshots";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import { externalLinkMarkdownComponents } from "@/components/Markdown/externalLinkComponents";
import {
  type ReportResource,
  reportResourceKey,
} from "@/api/modules/communityReport";
import { PostAssistance } from "./PostAssistance";
import { ResourcePicker } from "./ResourcePicker";
import { communityResourceIdentity } from "@/utils/communityResources";
import { redactReportText } from "./reportPrivacy";
import styles from "./index.module.less";
import { request } from "@/api/request";
import {
  communityConnectionApi,
  type CommunityConnectionStatus,
} from "@/api/modules/community";
import { COMMUNITY_POST_TYPES } from "@/constants/community";
import {
  reserveAuthorizationWindow,
  openAuthorizationUrl,
} from "@/utils/communityAuthorization";
import { communityErrorKey } from "@/utils/communityError";
import type { InstallationOrigin } from "@/api/types/community";

interface SavedDraft {
  title: string;
  content: string;
  type: string;
  resources: ReportResource[];
  instructions?: string;
  media?: { url: string; media_id: string }[];
}
// Page-lifetime cache only: no logs, screenshots or drafts in browser storage.
const drafts = new Map<string, SavedDraft>();

export function PostComposer({
  onClose,
  initialBody = "",
  initialType = "question",
  origin,
  resourceName,
}: {
  onClose: () => void;
  initialBody?: string;
  initialType?: "question" | "discussion";
  origin?: InstallationOrigin;
  resourceName?: string;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<CommunityConnectionStatus>();
  const [title, setTitle] = useState(
    initialBody.match(/^#\s+(.+)/)?.[1]?.slice(0, 256) || "",
  );
  const [content, setContent] = useState(initialBody);
  const [type, setType] = useState<string>(initialType);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [published, setPublished] = useState<string>();
  const [assisting, setAssisting] = useState(false);
  const [assistInitialized, setAssistInitialized] = useState(false);
  const [assistBusy, setAssistBusy] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [media, setMedia] = useState<{ url: string; media_id: string }[]>([]);
  const [mobilePane, setMobilePane] = useState("write");
  const [preview, setPreview] = useState(false);
  const [catalog, setCatalog] = useState<ReportResource[]>([]);
  const [resources, setResources] = useState<ReportResource[]>(
    origin ? [{ origin, name: resourceName || origin.resource_id }] : [],
  );
  const screenshots = useReportScreenshots(status?.account?.id);
  const locked = busy || assistBusy || screenshots.loading;
  const [addingResources, setAddingResources] = useState(false);
  const [loadingResources, setLoadingResources] = useState(false);
  const articleBoard = useRef("discussion");
  const draftOwner = useRef<string>();
  const cacheKey = useRef<string>();
  const loadedDraft = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    if (status?.status !== "connected" || !status.account) {
      setConfirmed(false);
      setAssistBusy(false);
      return;
    }
    const key = `${status.account.id}:${
      origin ? reportResourceKey(origin) : `general:${initialType}`
    }`;
    if (draftOwner.current === status.account.id) return;
    const saved = drafts.get(key);
    // Never carry another account's unpublished content into a new account.
    const first = !draftOwner.current;
    draftOwner.current = status.account.id;
    cacheKey.current = key;
    if (saved && !initialBody) {
      setTitle(saved.title);
      setContent(saved.content);
      setType(saved.type);
      setResources(saved.resources);
      setInstructions(saved.instructions || "");
      setMedia(saved.media || []);
    } else if (!first) {
      setTitle("");
      setInstructions("");
      setMedia([]);
      setContent("");
      setType(initialType);
      setResources(
        origin ? [{ origin, name: resourceName || origin.resource_id }] : [],
      );
    }
    if (saved && saved.type !== "question") articleBoard.current = saved.type;
    setConfirmed(false);
    setAssisting(false);
    setAssistBusy(false);
    loadedDraft.current = false;
  }, [status, origin, resourceName, initialBody, initialType]);
  useEffect(() => {
    // Wait for the restored draft's render before saving it back.
    if (!loadedDraft.current) {
      loadedDraft.current = true;
      return;
    }
    if (cacheKey.current && !published) {
      drafts.set(cacheKey.current, {
        title: redactReportText(title),
        content: redactReportText(content),
        type,
        resources,
        instructions: redactReportText(instructions),
        media,
      });
      if (drafts.size > 20) drafts.delete(drafts.keys().next().value!);
    }
  }, [title, content, type, resources, instructions, media, published, status]);
  const loadResources = async (showPicker = true) => {
    if (showPicker) setAddingResources(true);
    setLoadingResources(true);
    try {
      const data = await request<{ resources: ReportResource[] }>(
        "/community/report/resources",
      );
      if (mounted.current) {
        setCatalog(data.resources);
      }
    } catch (err) {
      if (mounted.current) setError(communityErrorKey(err));
    } finally {
      if (mounted.current) setLoadingResources(false);
    }
  };
  useEffect(() => {
    mounted.current = true;
    const refresh = () =>
      communityConnectionApi
        .status()
        .then((value) => {
          if (mounted.current) setStatus(value);
        })
        .catch((err) => {
          if (mounted.current) setError(communityErrorKey(err));
        });
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
    };
  }, []);
  const login = async () => {
    let popup: Window | null = null;
    setBusy(true);
    setError(undefined);
    try {
      popup = reserveAuthorizationWindow(t("community.waiting"));
      const flow = await communityConnectionApi.start();
      try {
        if (!mounted.current) throw new Error("authorization_cancelled");
        await openAuthorizationUrl(flow.authorize_url, popup);
      } catch (err) {
        await communityConnectionApi.cancel(flow.flow_id).catch(() => {});
        throw err;
      }
    } catch (err) {
      popup?.close();
      if (mounted.current) setError(communityErrorKey(err));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const publish = async () => {
    if (
      status?.status !== "connected" ||
      !status.account ||
      !confirmed ||
      busy ||
      assistBusy
    )
      return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await request<{ id: string }>("/community/posts", {
        method: "POST",
        body: JSON.stringify({
          title,
          content,
          media_ids: media
            .filter((item) => content.includes(item.url))
            .map((item) => item.media_id),
          article_type: type,
          account_id: status.account.id,
          origins: resources.map((item) => item.origin),
        }),
      });
      if (cacheKey.current) drafts.delete(cacheKey.current);
      setPublished(result.id);
    } catch (err) {
      setError(communityErrorKey(err));
    } finally {
      setBusy(false);
    }
  };
  const connected = status?.status === "connected";
  const changeType = (next: string) => {
    if (next !== "question") articleBoard.current = next;
    setType(next);
    setConfirmed(false);
  };
  const showAssistance = () => {
    setAssistInitialized(true);
    setAssisting(true);
    setMobilePane("assist");
    if (!catalog.length) void loadResources(false);
  };
  return (
    <Modal
      open
      title={t(
        origin ? "communityFeedback.reportIssue" : "communityCompose.title",
      )}
      className={styles.composerModal}
      width={assisting && connected ? 1120 : 800}
      style={{ top: 32 }}
      maskClosable={false}
      onCancel={busy ? undefined : onClose}
      footer={
        connected && !published ? (
          <div className={styles.publishFooter}>
            <Checkbox
              checked={confirmed}
              disabled={locked}
              onChange={(event) => setConfirmed(event.target.checked)}
            >
              {t("communityCompose.confirm")}
            </Checkbox>
            <div className={styles.footerActions}>
              <span className={styles.hint}>
                {t("communityAssist.draftHelp")}
              </span>
              <Button
                type="primary"
                loading={busy}
                disabled={
                  !confirmed || !title.trim() || !content.trim() || locked
                }
                onClick={() => void publish()}
              >
                {t("communityCompose.publish")}
              </Button>
            </div>
          </div>
        ) : null
      }
    >
      <div
        className={styles.composer}
        onPasteCapture={(event) => {
          const files = Array.from(event.clipboardData.items)
            .filter(
              (item) => item.kind === "file" && item.type.startsWith("image/"),
            )
            .map((item) => item.getAsFile())
            .filter((file): file is File => !!file);
          if (!files.length || !connected) return;
          event.preventDefault();
          if (locked) return;
          showAssistance();
          void screenshots.add(files);
        }}
      >
        {error && (
          <Alert
            type="error"
            message={t(error)}
            description={t("communityCompose.error")}
          />
        )}
        {published ? (
          <Alert
            type="success"
            message={t("communityCompose.published")}
            description={
              <a
                href={`/market?tab=community&post=${encodeURIComponent(
                  published,
                )}`}
              >
                {t("communityCompose.view")}
              </a>
            }
          />
        ) : !status ? (
          <Spin />
        ) : !connected ? (
          <>
            <Alert
              type="info"
              message={t("communityCompose.loginRequired")}
              description={t("communityCompose.loginHelp")}
            />
            <Button type="primary" loading={busy} onClick={() => void login()}>
              {t("communityCompose.login")}
            </Button>
          </>
        ) : (
          <>
            {assisting && (
              <div className={styles.mobilePaneSwitch}>
                <Segmented
                  block
                  aria-label={t("communityAssist.workspace")}
                  value={mobilePane}
                  options={[
                    { value: "write", label: t("communityAssist.edit") },
                    { value: "assist", label: t("communityAssist.assist") },
                  ]}
                  onChange={(value) => setMobilePane(String(value))}
                />
              </div>
            )}
            <div
              className={styles.composerLayout}
              data-assisting={assisting}
              data-mobile-pane={mobilePane}
            >
              <main className={styles.writingPane}>
                <div className={styles.composeIntro}>
                  <span>{t("communityAssist.composeIntro")}</span>
                  <span className={styles.hint}>
                    {t("communityCompose.account", {
                      name: status.account?.display_name,
                    })}
                  </span>
                </div>
                <Segmented
                  block
                  className={styles.typePicker}
                  aria-label={t("communityPage.type")}
                  value={type === "question" ? "question" : "article"}
                  disabled={locked}
                  options={[
                    {
                      value: "question",
                      label: (
                        <span className={styles.typeOption}>
                          <MessageCircleQuestion size={19} />
                          <span>
                            <strong>{t("communityPage.question")}</strong>
                            <small aria-hidden="true">
                              {t("communityAssist.questionShort")}
                            </small>
                          </span>
                        </span>
                      ),
                    },
                    {
                      value: "article",
                      label: (
                        <span className={styles.typeOption}>
                          <FileText size={19} />
                          <span>
                            <strong>{t("communityAssist.article")}</strong>
                            <small aria-hidden="true">
                              {t("communityAssist.articleShort")}
                            </small>
                          </span>
                        </span>
                      ),
                    },
                  ]}
                  onChange={(value) =>
                    changeType(
                      value === "question" ? "question" : articleBoard.current,
                    )
                  }
                />
                {type !== "question" && (
                  <div className={styles.boardRow}>
                    <label htmlFor="community-post-type">
                      {t("communityAssist.board")}
                    </label>
                    <Select
                      id="community-post-type"
                      style={{ minWidth: 220, maxWidth: "100%" }}
                      popupMatchSelectWidth={false}
                      dropdownStyle={{ maxWidth: "calc(100vw - 32px)" }}
                      optionRender={(option) => (
                        <span style={{ whiteSpace: "normal" }}>
                          {option.label}
                        </span>
                      )}
                      value={type}
                      onChange={changeType}
                      disabled={locked}
                      options={COMMUNITY_POST_TYPES.filter(
                        (value) => value !== "question",
                      ).map((value) => ({
                        value,
                        label: t(`communityPage.${value}`),
                      }))}
                    />
                  </div>
                )}
                {!content.trim() && !assisting && (
                  <button
                    type="button"
                    className={styles.assistStart}
                    onClick={showAssistance}
                  >
                    <Sparkles size={18} />
                    <span>
                      <strong>{t("communityAssist.startWithAgent")}</strong>
                      <small>{t("communityAssist.startWithAgentHelp")}</small>
                    </span>
                  </button>
                )}
                <div className={styles.resourceRow}>
                  <span className={styles.resourceLabel}>
                    <Link2 size={14} />
                    {t("communityAssist.relatedResources")}
                  </span>
                  {resources.map((item) => (
                    <Tag
                      key={reportResourceKey(item.origin)}
                      closable={
                        !locked &&
                        (!origin ||
                          reportResourceKey(item.origin) !==
                            reportResourceKey(origin))
                      }
                      onClose={() => {
                        setResources((current) =>
                          current.filter(
                            (resource) =>
                              reportResourceKey(resource.origin) !==
                              reportResourceKey(item.origin),
                          ),
                        );
                        setConfirmed(false);
                        setAssisting(false);
                      }}
                    >
                      {item.name} · {item.origin.resource_type}
                    </Tag>
                  ))}
                  <Button
                    size="small"
                    type="text"
                    icon={<Plus size={14} />}
                    disabled={locked}
                    loading={loadingResources}
                    onClick={() => void loadResources()}
                  >
                    {t("communityAssist.addResources")}
                  </Button>
                </div>
                {addingResources && (
                  <ResourcePicker
                    installed={catalog}
                    selected={resources}
                    disabled={locked}
                    onChange={(selected) => {
                      if (
                        origin &&
                        !selected.some(
                          (item) =>
                            communityResourceIdentity(item.origin) ===
                            communityResourceIdentity(origin),
                        )
                      )
                        selected.unshift(
                          resources.find(
                            (item) =>
                              communityResourceIdentity(item.origin) ===
                              communityResourceIdentity(origin),
                          )!,
                        );
                      if (
                        [true, false].some(
                          (skill) =>
                            selected.filter(
                              (item) =>
                                (item.origin.resource_type === "skill") ===
                                skill,
                            ).length > 3,
                        )
                      ) {
                        setError("communityAssist.tooManyResources");
                        return;
                      }
                      setResources(selected);
                      setConfirmed(false);
                      setAssisting(false);
                    }}
                  />
                )}
                <label htmlFor="community-post-title">
                  {t("communityCompose.postTitle")}
                </label>
                <Input
                  className={styles.titleInput}
                  placeholder={t("communityAssist.titlePlaceholder")}
                  id="community-post-title"
                  value={title}
                  maxLength={256}
                  disabled={locked}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    setConfirmed(false);
                  }}
                />
                <div className={styles.editorActions}>
                  <label htmlFor="community-post-body">
                    {t("communityCompose.body")}
                  </label>
                  <Button
                    size="small"
                    type="text"
                    icon={preview ? <Pencil size={14} /> : <Eye size={14} />}
                    disabled={locked}
                    aria-pressed={preview}
                    onClick={() => setPreview(!preview)}
                  >
                    {t(
                      preview
                        ? "communityAssist.edit"
                        : "communityAssist.preview",
                    )}
                  </Button>
                  <Button
                    size="small"
                    icon={<Sparkles size={14} />}
                    className={styles.assistToggle}
                    aria-expanded={assisting}
                    disabled={locked}
                    onClick={() =>
                      assisting ? setAssisting(false) : showAssistance()
                    }
                  >
                    {t("communityAssist.assist")}
                  </Button>
                </div>
                {preview ? (
                  <div className={styles.preview}>
                    <ReactMarkdown components={externalLinkMarkdownComponents}>
                      {content || t("communityAssist.emptyPreview")}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <Input.TextArea
                    placeholder={t(
                      type === "question"
                        ? "communityAssist.questionPlaceholder"
                        : "communityAssist.articlePlaceholder",
                    )}
                    id="community-post-body"
                    value={content}
                    maxLength={65536}
                    className={styles.bodyInput}
                    autoSize={{ minRows: 9, maxRows: 16 }}
                    disabled={locked}
                    onChange={(event) => {
                      setContent(event.target.value);
                      setConfirmed(false);
                    }}
                  />
                )}
                <div className={styles.editorHint}>
                  <span>{t("communityAssist.editorHint")}</span>
                  <span>{content.length.toLocaleString()} / 65,536</span>
                </div>
              </main>
              {assistInitialized && (
                <aside
                  hidden={!assisting}
                  className={styles.assistancePane}
                  aria-label={t("communityAssist.assist")}
                >
                  <PostAssistance
                    key={`${status.account?.id}:${type}`}
                    resources={resources.map(
                      (item) =>
                        catalog.find(
                          (entry) =>
                            reportResourceKey(entry.origin) ===
                            reportResourceKey(item.origin),
                        ) || item,
                    )}
                    screenshots={screenshots}
                    articleType={type}
                    draft={`${title ? `# ${title}\n\n` : ""}${content}`}
                    instructions={instructions}
                    onInstructions={setInstructions}
                    onInsertImage={async (image, index) => {
                      const result = await request<{
                        url: string;
                        media_id: string;
                      }>("/community/media", {
                        method: "POST",
                        body: JSON.stringify({
                          data_url: image,
                          account_id: status.account!.id,
                          reviewed: true,
                        }),
                      });
                      if (!mounted.current) return;
                      setMedia((current) => [...current, result]);
                      setContent((current) =>
                        `${current.trimEnd()}\n\n![${t(
                          "communityAssist.screenshotAlt",
                          { index: index + 1 },
                        )}](${result.url})\n`.trimStart(),
                      );
                      setConfirmed(false);
                    }}
                    onBusy={setAssistBusy}
                    onApply={(text) => {
                      const match = text.match(/^#\s+(.+)/);
                      if (match) setTitle(match[1].slice(0, 256));
                      // Keep explicitly inserted images even if the model omitted them.
                      const imageLinks =
                        content.match(/!\[[^\]]*\]\(https:\/\/[^\s)]+\)/g) ||
                        [];
                      const missing = imageLinks.filter(
                        (link) =>
                          !text.includes(link.match(/\((.+)\)/)?.[1] || link),
                      );
                      setContent([text, ...missing].join("\n\n"));
                      setMobilePane("write");
                      setConfirmed(false);
                      setPreview(false);
                      document.getElementById("community-post-title")?.focus();
                    }}
                  />
                </aside>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
