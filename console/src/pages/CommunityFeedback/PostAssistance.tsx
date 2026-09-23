import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Input,
  Select,
  Space,
  Typography,
  Collapse,
} from "antd";
import { Sparkles, ImagePlus, FileSearch, Upload } from "lucide-react";
import type { ReportScreenshots } from "./useReportScreenshots";
import { useTranslation } from "react-i18next";
import { agentsApi } from "@/api/modules/agents";
import { chatApi } from "@/api/modules/chat";
import {
  collectCommunityDiagnostics,
  generateCommunityReport,
  type DiagnosticEvidence,
  type ReportResource,
} from "@/api/modules/communityReport";
import { redactReportText } from "./reportPrivacy";
import { ScreenshotEditor } from "./ScreenshotEditor";
import styles from "./index.module.less";

interface Props {
  screenshots: ReportScreenshots;
  resources: ReportResource[];
  articleType: string;
  draft: string;
  instructions: string;
  onInstructions: (value: string) => void;
  onInsertImage: (image: string, index: number) => Promise<void>;
  onApply: (text: string) => void;
  onBusy: (busy: boolean) => void;
}

export function PostAssistance({
  resources,
  screenshots,
  articleType,
  draft,
  instructions,
  onInstructions,
  onInsertImage,
  onApply,
  onBusy,
}: Props) {
  const { t } = useTranslation();
  const [language, setLanguage] = useState<"auto" | "zh" | "en">("auto");
  const [writingStyle, setWritingStyle] = useState<
    "auto" | "concise" | "detailed"
  >("auto");
  const [publicImages, setPublicImages] = useState(false);
  const [insertedImages, setInsertedImages] = useState<Record<string, string>>(
    {},
  );
  useEffect(() => setPublicImages(false), [screenshots.images]);
  const question = articleType === "question";
  const [evidence, setEvidence] = useState<DiagnosticEvidence[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [agents, setAgents] = useState<{ value: string; label: string }[]>([]);
  const [sessions, setSessions] = useState<{ value: string; label: string }[]>(
    [],
  );
  const [agent, setAgent] = useState<string>();
  const [session, setSession] = useState("");
  const [minutes, setMinutes] = useState(60);
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState<"collect" | "generate" | "image">();
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [revision, setRevision] = useState("");
  const [round, setRound] = useState(0);
  const resultPanel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (round) resultPanel.current?.scrollIntoView({ block: "nearest" });
  }, [round]);
  const { images, setImages } = screenshots;
  const imageInput = useRef<HTMLInputElement>(null);
  const logInput = useRef<HTMLInputElement>(null);
  const disabled = !!busy || screenshots.loading;
  useEffect(() => setReviewed(false), [images]);
  const operation = useRef<AbortController>();
  const mounted = useRef(true);
  const hasMaterials =
    evidence.some((item) => item.content.trim()) || images.length > 0;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      operation.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!question) return;
    let active = true;
    agentsApi
      .listAgents()
      .then((value) => {
        if (active)
          setAgents(
            value.agents
              .filter((item) => item.enabled)
              .map((item) => ({ value: item.id, label: item.name })),
          );
      })
      .catch(() => {
        if (active) setError(t("communityAssist.contextFailed"));
      });
    return () => {
      active = false;
    };
  }, [question, t]);
  useEffect(() => {
    if (!question) return;
    let active = true;
    setSession("");
    setSessions([]);
    chatApi
      .listChats({ agentId: agent })
      .then((value) => {
        if (active)
          setSessions(
            value.map((item) => ({
              value: item.session_id,
              label: item.name || item.session_id,
            })),
          );
      })
      .catch(() => {
        if (active) setError(t("communityAssist.contextFailed"));
      });
    return () => {
      active = false;
    };
  }, [agent, question, t]);
  useEffect(() => {
    setEvidence([]);
    setWarnings([]);
    setReviewed(false);
  }, [agent, session, minutes]);
  const start = (kind: "collect" | "generate" | "image") => {
    const controller = new AbortController();
    operation.current = controller;
    setBusy(kind);
    onBusy(true);
    setError("");
    return controller;
  };
  const finish = (controller: AbortController) => {
    if (operation.current !== controller) return;
    operation.current = undefined;
    if (mounted.current) {
      setBusy(undefined);
      onBusy(false);
    }
  };
  const cancel = () => {
    operation.current?.abort();
    operation.current = undefined;
    setBusy(undefined);
    onBusy(false);
  };
  const valid = (controller: AbortController) =>
    mounted.current &&
    operation.current === controller &&
    !controller.signal.aborted;
  const collect = async () => {
    const controller = start("collect");
    try {
      const data = await collectCommunityDiagnostics(
        resources.map((item) => item.origin),
        minutes,
        session,
        agent,
        controller.signal,
      );
      if (valid(controller)) {
        setEvidence(data.evidence);
        setWarnings(data.warnings);
        setReviewed(false);
      }
    } catch {
      if (valid(controller)) setError(t("communityAssist.collectFailed"));
    } finally {
      finish(controller);
    }
  };
  const generate = async (followUp = false) => {
    const controller = start("generate");
    try {
      const primary = resources[0];
      const data = await generateCommunityReport(
        {
          resource_name: primary?.name || t("communityPage.title"),
          resource_type: primary?.origin.resource_type || "plugin",
          installed_version: primary?.origin.installed_version || "",
          article_type: articleType,
          resource_context: redactReportText(
            JSON.stringify(
              resources.map((item) => ({
                name: item.name,
                origin: item.origin,
                description: item.description,
              })),
            ).slice(0, 6000),
          ),
          draft: redactReportText(result || draft),
          instructions: redactReportText(
            followUp
              ? `${instructions.slice(
                  0,
                  900,
                )}\n\nRevision request (apply to the supplied draft, preserve everything else):\n${revision.slice(
                  0,
                  1000,
                )}`
              : instructions,
          ),
          writing_style: writingStyle,
          logs: redactReportText(
            evidence
              .map((item) => `[${item.id}]\n${item.content}`)
              .join("\n\n"),
          ),
          screenshots: images.map((item) => ({ data_url: item.value })),
          materials_reviewed: reviewed,
          language,
        },
        controller.signal,
      );
      if (valid(controller)) {
        setResult(data.report);
        setRound((current) => current + 1);
        setRevision("");
      }
    } catch (err) {
      if (valid(controller))
        setError(
          t(
            err instanceof Error && err.message.includes("image_model_required")
              ? "communityAssist.imageModelRequired"
              : err instanceof Error &&
                err.message.includes("model_not_available")
              ? "communityReport.noModel"
              : "communityReport.generateFailed",
          ),
        );
    } finally {
      finish(controller);
    }
  };
  const readFile = async (file: File) => {
    const controller = start("image");
    try {
      if (file.size > 128 * 1024) throw new Error("logTooLarge");
      const text = await file.text();
      if (text.length > 24000) throw new Error("logTooLarge");
      if (valid(controller))
        setEvidence((current) => [
          ...current.filter((item) => item.id !== "manual"),
          { id: "manual", content: redactReportText(text) },
        ]);
      if (valid(controller)) setReviewed(false);
    } catch {
      if (valid(controller)) setError(t("communityReport.logTooLarge"));
    } finally {
      finish(controller);
    }
  };
  const totalLength = evidence.reduce(
    (sum, item) => sum + item.content.length + item.id.length + 4,
    0,
  );
  return (
    <div className={styles.assistance}>
      <div className={styles.assistHeading}>
        <Sparkles size={18} />
        <strong>
          {t(
            question
              ? "communityAssist.improveQuestion"
              : "communityAssist.improveArticle",
          )}
        </strong>
      </div>
      <Typography.Text type="secondary">
        {t(
          question
            ? "communityAssist.questionHelp"
            : "communityAssist.articleHelp",
          { board: t(`communityPage.${articleType}`) },
        )}
      </Typography.Text>
      <div className={styles.field}>
        <label htmlFor="community-writing-instructions">
          {t("communityAssist.instructions")}
        </label>
        <Input.TextArea
          id="community-writing-instructions"
          value={instructions}
          autoSize={{ minRows: 3, maxRows: 7 }}
          maxLength={2000}
          disabled={disabled}
          placeholder={t(
            question
              ? "communityAssist.questionIdea"
              : "communityAssist.articleIdea",
          )}
          onChange={(event) => onInstructions(event.target.value)}
        />
        <div className={styles.writingPreferences}>
          <Select
            aria-label={t("communityAssist.outputLanguage")}
            value={language}
            disabled={disabled}
            onChange={setLanguage}
            options={["auto", "zh", "en"].map((value) => ({
              value,
              label: t(`communityAssist.language_${value}`),
            }))}
          />
          <Select
            aria-label={t("communityAssist.writingStyle")}
            value={writingStyle}
            disabled={disabled}
            onChange={setWritingStyle}
            options={["auto", "concise", "detailed"].map((value) => ({
              value,
              label: t(`communityAssist.style_${value}`),
            }))}
          />
        </div>
      </div>
      {question && (
        <Collapse
          ghost
          className={styles.diagnostics}
          items={[
            {
              key: "diagnostics",
              label: (
                <span className={styles.resourceLabel}>
                  <FileSearch size={16} />
                  {t("communityAssist.diagnosticOptional")}
                </span>
              ),
              children: (
                <>
                  <div className={styles.diagnosticFields}>
                    <Select
                      aria-label={t("communityAssist.agent")}
                      placeholder={t("communityAssist.currentAgent")}
                      style={{ width: "100%" }}
                      allowClear
                      value={agent}
                      options={agents}
                      disabled={disabled}
                      onChange={setAgent}
                    />
                    <Select
                      aria-label={t("communityAssist.session")}
                      placeholder={t("communityAssist.session")}
                      style={{ width: "100%" }}
                      allowClear
                      value={session || undefined}
                      options={sessions}
                      disabled={disabled}
                      onChange={(value) => setSession(value || "")}
                    />
                    <Select
                      aria-label={t("communityAssist.timeRange")}
                      value={minutes}
                      disabled={disabled}
                      onChange={setMinutes}
                      options={[15, 60, 1440].map((value) => ({
                        value,
                        label: t(`communityAssist.minutes${value}`),
                      }))}
                    />
                    <Button
                      disabled={disabled || !resources.length}
                      loading={busy === "collect"}
                      onClick={() => void collect()}
                    >
                      {t("communityAssist.collect")}
                    </Button>
                  </div>
                  {warnings.map((value) => (
                    <Alert
                      key={value}
                      type="info"
                      showIcon
                      message={t(`communityAssist.${value}`)}
                    />
                  ))}
                  <Typography.Text type="secondary">
                    {t("communityAssist.evidenceHelp")}
                  </Typography.Text>
                  {evidence.map((item, index) => (
                    <div key={item.id} className={styles.field}>
                      <Space>
                        <label htmlFor={`evidence-${item.id}`}>
                          {t(`communityAssist.evidence_${item.id}`)}
                        </label>
                        <Button
                          size="small"
                          disabled={disabled}
                          onClick={() => {
                            setEvidence((current) =>
                              current.filter((_, i) => i !== index),
                            );
                            setReviewed(false);
                          }}
                        >
                          {t("communityAssist.remove")}
                        </Button>
                      </Space>
                      <Input.TextArea
                        id={`evidence-${item.id}`}
                        value={item.content}
                        rows={4}
                        disabled={disabled}
                        maxLength={24000}
                        onChange={(event) => {
                          setEvidence((current) =>
                            current.map((entry, i) =>
                              i === index
                                ? {
                                    ...entry,
                                    content: redactReportText(
                                      event.target.value,
                                    ),
                                  }
                                : entry,
                            ),
                          );
                          setReviewed(false);
                        }}
                      />
                    </div>
                  ))}
                  <input
                    ref={logInput}
                    type="file"
                    accept=".txt,.log,.json"
                    hidden
                    disabled={disabled}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) void readFile(file);
                    }}
                  />
                  <Button
                    size="small"
                    icon={<Upload size={14} />}
                    disabled={disabled}
                    onClick={() => logInput.current?.click()}
                  >
                    {t("communityReport.chooseLog")}
                  </Button>
                </>
              ),
            },
          ]}
        />
      )}
      <section className={styles.imageMaterials}>
        <div className={styles.sectionLabel}>
          <span>{t("communityAssist.referenceImages")}</span>
          <span>{images.length} / 2</span>
        </div>
        <div
          role="group"
          aria-label={t("communityAssist.referenceImages")}
          tabIndex={disabled || images.length >= 2 ? -1 : 0}
          className={styles.pasteArea}
          aria-disabled={disabled || images.length >= 2}
          onClick={(event) => {
            if (!disabled && images.length < 2) event.currentTarget.focus();
          }}
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes("Files"))
              event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (!disabled)
              void screenshots.add(Array.from(event.dataTransfer.files));
          }}
        >
          <ImagePlus size={23} />
          <strong>
            {t(
              screenshots.loading
                ? "communityAssist.readingImage"
                : "communityAssist.pasteImage",
            )}
          </strong>
          <span>{t("communityAssist.pasteImageHint")}</span>
          <Button
            size="small"
            icon={<Upload size={14} />}
            disabled={disabled || images.length >= 2}
            onClick={(event) => {
              event.stopPropagation();
              imageInput.current?.click();
            }}
          >
            {t("communityAssist.chooseImage")}
          </Button>
        </div>
        <input
          ref={imageInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          hidden
          disabled={disabled || images.length >= 2}
          onChange={(event) => {
            const files = Array.from(event.target.files || []);
            event.target.value = "";
            void screenshots.add(files);
          }}
        />
        <p className={styles.hint}>{t("communityAssist.imagePrivacy")}</p>
        {screenshots.error && (
          <Alert type="error" showIcon message={t(screenshots.error)} />
        )}
        {!!images.length && (
          <Typography.Text type="secondary">
            {t("communityReport.imageHelp")}
          </Typography.Text>
        )}
        {!!images.length && (
          <Checkbox
            checked={publicImages}
            disabled={disabled}
            onChange={(event) => setPublicImages(event.target.checked)}
          >
            {t("communityAssist.publicImages")}
          </Checkbox>
        )}
        {images.map((item, index) => (
          <div key={item.id} className={styles.field}>
            <ScreenshotEditor
              key={item.id}
              index={index}
              source={item.source}
              value={item.value}
              disabled={disabled}
              onChange={(value) => {
                setImages((current) =>
                  current.map((entry) =>
                    entry.id === item.id ? { ...entry, value } : entry,
                  ),
                );
                setReviewed(false);
              }}
              onRemove={() => {
                setImages((current) =>
                  current.filter((entry) => entry.id !== item.id),
                );
                setReviewed(false);
              }}
            />
            <Button
              disabled={
                disabled ||
                !publicImages ||
                insertedImages[item.id] === item.value
              }
              onClick={async () => {
                const controller = start("image");
                try {
                  await onInsertImage(item.value, index);
                  if (valid(controller))
                    setInsertedImages((current) => ({
                      ...current,
                      [item.id]: item.value,
                    }));
                } catch {
                  if (valid(controller))
                    setError(t("communityAssist.imageUploadFailed"));
                } finally {
                  finish(controller);
                }
              }}
            >
              {t(
                insertedImages[item.id] === item.value
                  ? "communityAssist.imageInserted"
                  : "communityAssist.insertImage",
              )}
            </Button>
          </div>
        ))}
      </section>
      {hasMaterials && (
        <Checkbox
          checked={reviewed}
          disabled={disabled}
          onChange={(event) => setReviewed(event.target.checked)}
        >
          {t("communityReport.reviewMaterials")}
        </Checkbox>
      )}
      {totalLength > 24000 && (
        <Alert type="warning" message={t("communityReport.logTooLarge")} />
      )}
      {error && <Alert type="error" showIcon message={error} />}
      <div className={styles.generateActions}>
        {!(
          draft.trim() ||
          instructions.trim() ||
          result.trim() ||
          hasMaterials
        ) && <p className={styles.hint}>{t("communityAssist.startHint")}</p>}
        {hasMaterials && !reviewed && (
          <p className={styles.hint}>{t("communityAssist.reviewHint")}</p>
        )}
        {!result && (
          <Button
            type="primary"
            block
            icon={<Sparkles size={14} />}
            disabled={
              disabled ||
              !(
                draft.trim() ||
                instructions.trim() ||
                result.trim() ||
                hasMaterials
              ) ||
              (result || draft).length > 32000 ||
              totalLength > 24000 ||
              (hasMaterials && !reviewed)
            }
            loading={busy === "generate"}
            onClick={() => void generate()}
          >
            {t(
              result
                ? "communityAssist.reviseDraft"
                : draft.trim()
                ? "communityAssist.refineDraft"
                : "communityAssist.createDraft",
            )}
          </Button>
        )}
        {busy && (
          <Button onClick={cancel}>
            {t("communityReport.cancelGeneration")}
          </Button>
        )}
        <Typography.Text type="secondary" role="status">
          {t(
            busy === "generate"
              ? "communityReport.generating"
              : "communityReport.modelHelp",
          )}
        </Typography.Text>
      </div>
      {result && (
        <div className={styles.field} ref={resultPanel}>
          <label htmlFor="community-assistant-result">
            {t("communityAssist.resultVersion", { number: round })}
          </label>
          <Input.TextArea
            id="community-assistant-result"
            value={result}
            maxLength={32000}
            autoSize={{ minRows: 5, maxRows: 15 }}
            onChange={(event) => setResult(event.target.value)}
            disabled={disabled}
          />
          <Button
            disabled={disabled || !result.trim()}
            onClick={() => {
              onApply(result);
              setResult("");
            }}
          >
            {t("communityAssist.apply")}
          </Button>
          <div className={styles.revisionPanel}>
            <label htmlFor="community-revision-instructions">
              {t("communityAssist.revisionLabel")}
            </label>
            <Input.TextArea
              id="community-revision-instructions"
              value={revision}
              onChange={(event) => setRevision(event.target.value)}
              placeholder={t("communityAssist.revisionPlaceholder")}
              autoSize={{ minRows: 2, maxRows: 5 }}
              maxLength={1000}
              disabled={disabled}
            />
            <Button
              type="primary"
              icon={<Sparkles size={14} />}
              loading={busy === "generate"}
              disabled={
                disabled ||
                !revision.trim() ||
                !result.trim() ||
                result.length > 32000 ||
                totalLength > 24000 ||
                (hasMaterials && !reviewed)
              }
              onClick={() => void generate(true)}
            >
              {t("communityAssist.reviseDraft")}
            </Button>
            <p className={styles.hint}>{t("communityAssist.revisionHelp")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
