import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Button,
  Input,
  Pagination,
  Spin,
  Tag,
  Typography,
} from "antd";
import { Download, Package, RefreshCw } from "lucide-react";
import type { MarketPluginEntry } from "@/api/modules/pluginMarket";
import { useMarketPlugins } from "../hooks/useMarketPlugins";
import styles from "./OfficialPluginList.module.less";

const { Text } = Typography;

function pickLocalizedDescription(
  entry: MarketPluginEntry,
  language: string,
): string {
  const locales = entry.locales;
  if (!locales || Object.keys(locales).length === 0) return "";

  if (locales[language]) return locales[language].description;

  const prefix = language.split("-")[0].toLowerCase();
  for (const key of Object.keys(locales)) {
    if (key.toLowerCase().startsWith(prefix)) {
      return locales[key].description;
    }
  }

  if (locales.en) return locales.en.description;

  const first = Object.values(locales)[0];
  return first?.description ?? "";
}

interface MarketPluginListProps {
  onInstalled: () => void;
}

export function MarketPluginList({ onInstalled }: MarketPluginListProps) {
  const { t, i18n } = useTranslation();
  const [searchInput, setSearchInput] = useState("");

  const {
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
  } = useMarketPlugins({ onInstalled });

  return (
    <div className={styles.catalogSection}>
      <div className={styles.catalogToolbar}>
        <div className={styles.catalogFilters}>
          <Input.Search
            placeholder={t("pluginManager.marketSearch")}
            allowClear
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onSearch={(val) => handleSearch(val)}
            style={{ width: 280 }}
          />
        </div>
        <Button
          type="default"
          size="small"
          icon={<RefreshCw size={14} />}
          onClick={() => void loadPlugins(page, searchInput)}
          disabled={loading}
        >
          {t("pluginManager.catalogRefresh")}
        </Button>
      </div>

      {error && (
        <Alert
          type="warning"
          showIcon
          message={error}
          style={{ marginBottom: 12 }}
        />
      )}

      <Spin spinning={loading}>
        {!loading && plugins.length === 0 && !error && (
          <Text type="secondary">{t("pluginManager.marketEmpty")}</Text>
        )}
        <div className={styles.catalogList}>
          {plugins.map((entry) => (
            <div className={styles.catalogRow} key={entry.id}>
              <div className={styles.catalogIcon}>
                {entry.logo_url ? (
                  <img
                    src={entry.logo_url}
                    alt=""
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 4,
                      objectFit: "contain",
                    }}
                  />
                ) : (
                  <Package size={18} />
                )}
              </div>
              <div className={styles.catalogInfo}>
                <div className={styles.catalogNameRow}>
                  <Text strong>{entry.display_name}</Text>
                  {entry.locales?.[
                    i18n.language.split("-")[0]
                  ]?.category && (
                    <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>
                      {
                        entry.locales[i18n.language.split("-")[0]]
                          .category
                      }
                    </Tag>
                  )}
                </div>
                {entry.locales && (
                  <div className={styles.catalogDescription}>
                    {pickLocalizedDescription(entry, i18n.language)}
                  </div>
                )}
                <div className={styles.catalogMeta}>
                  v{entry.version}
                  {entry.developer
                    ? ` · ${t("pluginManager.marketDeveloper")}: ${entry.developer}`
                    : ""}
                  {entry.downloads != null
                    ? ` · ${t("pluginManager.marketDownloads")}: ${entry.downloads}`
                    : ""}
                </div>
              </div>
              <div className={styles.catalogActions}>
                <Button
                  type="primary"
                  size="small"
                  icon={<Download size={14} />}
                  loading={installingId === entry.id}
                  disabled={
                    installingId !== null && installingId !== entry.id
                  }
                  onClick={() => void handleInstall(entry)}
                >
                  {t("pluginManager.catalogInstall")}
                </Button>
              </div>
            </div>
          ))}
        </div>

        {total > pageSize && (
          <div style={{ marginTop: 16, textAlign: "center" }}>
            <Pagination
              current={page}
              pageSize={pageSize}
              total={total}
              onChange={handlePageChange}
              showSizeChanger={false}
              size="small"
            />
          </div>
        )}
      </Spin>
    </div>
  );
}
