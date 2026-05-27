/** Pet plugin UI locale — follows QwenPaw console ``localStorage.language``. */

import { readConsoleLanguage } from "./watchConsoleLanguage";

export type PetLocale = "zh" | "en";

export type MessageKey = keyof typeof messages.en;

const messages = {
  en: {
    routeLabel: "Pet",
    title: "QwenPaw Pet",
    intro:
      "Installed pets live under your QwenPaw working directory. Start the desktop bridge, then switch the floating pet without restarting QwenPaw.",
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
    desktopStarting:
      "Desktop may still be starting; check pet-desktop.log if needed.",
    dropFolderOrZip: "Drop a folder or a .zip file.",
    importChooseFirst: "Drop a folder or choose a .zip file first.",
    importSuccess: 'Imported "{name}" → {path}',
    switchSuccess: 'Switched to "{name}" ({petId})',
    switchFailed: "switch failed",
    modalImportTitle: "Import pet",
    modalImportOk: "Import",
    dropzoneTitle: "Drop a folder or .zip file here",
    dropzoneHint: "or click to choose a .zip",
    importFormatHint:
      "Folder or unzipped archive must contain pet.json and spritesheet.webp (1536×1872).",
    selectedOne: "Selected: {path}",
    selectedMany: "Selected: {count} files (root: {root})",
    importReplace: "Replace if a pet with the same id already exists",
    modeSection: "Deployment mode",
    modeLocal: "Local",
    modeRemote: "Remote",
    modeLocalHint:
      "Pet desktop runs on this machine; events stream over loopback HTTP.",
    modeRemoteHint:
      "Pet desktop runs on the user's laptop and subscribes to this QwenPaw via SSE.",
    modeLockedByEnv:
      "Mode is fixed by the QWENPAW_PET_MODE environment variable.",
    modeUpdated: "Mode updated to {mode}.",
    modeUpdateFailed: "Failed to update mode.",
    pairCardTitle: "Pair a remote desktop",
    pairCardIntro:
      "On a desktop that has the pet app installed: open the tray menu, choose “Paste pairing link”, and paste the link below.",
    copyPairLink: "Copy pairing link",
    pairLinkCopied: "Pairing link copied to clipboard.",
    pairLinkCopyFailed:
      "Could not copy automatically — copy the link manually.",
    pairLinkExpires: "Pairing link expires on {date}.",
    pairLinkNoteReveal:
      "The token inside this link is shown once. Re-issue if you lose it.",
    pairLinkLabel: "Label (optional, e.g. “MyMac”)",
    pairLinkLabelPlaceholder: "Optional device label",
    pairedDevices: "Paired devices",
    pairedNone: "No devices paired yet.",
    pendingLinksHint:
      "{count} unused pairing link(s) outstanding — only devices that have actually connected are listed above.",
    cleanupPending: "Revoke unused links",
    cleanupConfirmTitle: "Revoke all unused pairing links?",
    cleanupConfirmBody:
      "Links that have never been used will be invalidated. Already-paired devices are unaffected.",
    cleanupSuccess: "Revoked {count} unused pairing link(s).",
    cleanupFailed: "Failed to revoke some pairing links.",
    pairedLabelUnnamed: "(unnamed)",
    pairedCreated: "Created {date}",
    pairedLastSeenNever: "Never connected",
    pairedLastSeen: "Last seen {date}",
    pairedExpires: "Expires {date}",
    revokeToken: "Revoke",
    revokeConfirmTitle: "Revoke this pairing?",
    revokeConfirmBody:
      "The desktop using this token will be disconnected on its next reconnect attempt.",
    revokeConfirmOk: "Revoke",
    revokeConfirmCancel: "Cancel",
    revokeSuccess: "Pairing revoked.",
    revokeFailed: "Failed to revoke pairing.",
    downloadCardTitle: "1. Download QwenPaw Pet Desktop",
    downloadCardHint:
      "Builds will appear here once packaging is published. For now, install the desktop via pip on the target machine.",
    pairCardHeader: "2. Pair to this QwenPaw",
    remoteModeNote:
      "Local desktop pet management is hidden in remote mode. Switch back to Local mode to manage pets on this machine.",
  },
  zh: {
    routeLabel: "宠物",
    title: "QwenPaw 桌面宠物",
    intro:
      "已安装的宠物位于 QwenPaw 工作目录下。启动桌面桥接后，可在不重启 QwenPaw 的情况下切换悬浮宠物。",
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
    importFormatHint:
      "文件夹或解压后的目录需包含 pet.json 与 spritesheet.webp（1536×1872）。",
    selectedOne: "已选择：{path}",
    selectedMany: "已选择：{count} 个文件（根目录：{root}）",
    importReplace: "若已存在相同 id 的宠物则覆盖",
    modeSection: "部署模式",
    modeLocal: "本机",
    modeRemote: "远端",
    modeLocalHint: "桌面宠物运行在本机，事件通过本地 HTTP 推送。",
    modeRemoteHint:
      "桌面宠物运行在用户笔记本上，通过 SSE 主动订阅这台 QwenPaw。",
    modeLockedByEnv: "当前模式由 QWENPAW_PET_MODE 环境变量固定，无法修改。",
    modeUpdated: "模式已切换为 {mode}。",
    modeUpdateFailed: "切换模式失败。",
    pairCardTitle: "配对远端桌面",
    pairCardIntro:
      "在已安装桌宠 app 的电脑上：打开托盘菜单，选择「粘贴配对链接」，然后粘贴下面这条链接。",
    copyPairLink: "复制配对链接",
    pairLinkCopied: "配对链接已复制到剪贴板。",
    pairLinkCopyFailed: "无法自动复制，请手动复制链接。",
    pairLinkExpires: "配对链接将于 {date} 过期。",
    pairLinkNoteReveal: "链接中的 token 只会显示一次，丢失后需重新生成。",
    pairLinkLabel: "标签（可选，如「MyMac」）",
    pairLinkLabelPlaceholder: "可选的设备标签",
    pairedDevices: "已配对的设备",
    pairedNone: "暂无已配对设备。",
    pendingLinksHint:
      "当前有 {count} 条未使用的配对链接 —— 上方仅显示真正连接过的设备。",
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
    downloadCardHint:
      "打包好的安装包将出现在这里。当前请在目标机器上通过 pip 安装。",
    pairCardHeader: "2. 配对到这台 QwenPaw",
    remoteModeNote:
      "远端模式下隐藏了本机桌宠管理。如需在本机管理宠物，请切回本机模式。",
  },
} as const;

/** Map QwenPaw console language to pet UI locale (non zh/en → en). */
export function toPetLocale(language: string | null | undefined): PetLocale {
  const base = String(language || "")
    .trim()
    .split("-")[0]
    .toLowerCase();
  if (base === "zh") return "zh";
  return "en";
}

export function resolvePetLocale(language?: string | null): PetLocale {
  return toPetLocale(language ?? readConsoleLanguage());
}

export function t(
  locale: PetLocale,
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  let text: string = messages[locale][key] ?? messages.en[key];
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}
