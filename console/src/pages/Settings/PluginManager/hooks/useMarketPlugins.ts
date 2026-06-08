import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppMessage } from "@/hooks/useAppMessage";
import {
  fetchMarketPlugins,
  buildMarketDownloadUrl,
  type MarketPluginEntry,
} from "@/api/modules/pluginMarket";
import { installPlugin } from "@/api/modules/plugin";

interface UseMarketPluginsOptions {
  onInstalled: () => void;
}

export function useMarketPlugins({ onInstalled }: UseMarketPluginsOptions) {
  const { t } = useTranslation();
  const { message } = useAppMessage();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plugins, setPlugins] = useState<MarketPluginEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [installingId, setInstallingId] = useState<string | null>(null);

  const loadPlugins = useCallback(
    async (pageNum: number, keyword: string) => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchMarketPlugins({
          page_number: pageNum,
          page_size: pageSize,
          search: keyword || undefined,
        });
        setPlugins(data.plugins ?? []);
        setTotal(data.total);
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : t("pluginManager.marketLoadFailed");
        setError(msg);
        setPlugins([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [pageSize, t],
  );

  useEffect(() => {
    void loadPlugins(page, search);
  }, [page, search, loadPlugins]);

  const handleSearch = useCallback((keyword: string) => {
    setSearch(keyword);
    setPage(1);
  }, []);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  const handleInstall = useCallback(
    async (entry: MarketPluginEntry) => {
      setInstallingId(entry.id);
      try {
        const downloadUrl = buildMarketDownloadUrl(entry);
        const result = await installPlugin(downloadUrl, { force: true });
        message.success(`${t("pluginManager.installSuccess")}: ${result.name}`);
        onInstalled();
        setTimeout(() => window.location.reload(), 800);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : t("pluginManager.installFailed");
        message.error(msg);
      } finally {
        setInstallingId(null);
      }
    },
    [message, onInstalled, t],
  );

  return {
    loading,
    error,
    plugins,
    total,
    page,
    pageSize,
    installingId,
    loadPlugins,
    handleSearch,
    handlePageChange,
    handleInstall,
  };
}
