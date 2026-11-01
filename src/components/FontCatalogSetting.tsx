import { useEffect, useState } from "react";
import { API_KEY_SETTING, clearCatalogCache, getCatalog, refreshCatalog, type Catalog } from "../lib/fonts";
import { openExternal } from "../lib/open";
import { getRawSettings, setRawSetting } from "../lib/settings";

const KEY_HELP = "https://developers.google.com/fonts/docs/developer_api#identifying_your_application_to_google";

/** Settings row: optional Google Fonts API key to refresh the font catalog. */
export function FontCatalogSetting() {
  const [key, setKey] = useState("");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    getRawSettings(API_KEY_SETTING)
      .then((rows) => setKey(rows[API_KEY_SETTING] ?? ""))
      .catch(() => {});
    getCatalog().then(setCatalog).catch(() => {});
  }, []);

  const refresh = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const fresh = await refreshCatalog(key);
      await setRawSetting(API_KEY_SETTING, key.trim());
      setCatalog(fresh);
      setMessage({ text: `Refreshed: ${fresh.families.length.toLocaleString()} families, now sortable by popularity.` });
    } catch (e) {
      setMessage({ text: `Google Fonts did not accept the request: ${e instanceof Error ? e.message : String(e)}`, error: true });
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    await clearCatalogCache();
    await setRawSetting(API_KEY_SETTING, null);
    setKey("");
    setCatalog(await getCatalog());
    setMessage({ text: "Back to the built-in catalog. The key was removed." });
  };

  return (
    <>
      <div className="setting-row">
        <div>
          <strong>Font catalog</strong>
          <span>
            {catalog
              ? catalog.origin === "api"
                ? `${catalog.families.length.toLocaleString()} Google Fonts families, refreshed on ${catalog.updated}.`
                : `${catalog.families.length.toLocaleString()} Google Fonts families built in (as of ${catalog.updated}). Works offline.`
              : "Loading…"}
          </span>
        </div>
        {catalog?.origin === "api" && (
          <button type="button" className="link-btn" onClick={() => void reset()}>
            Use built-in
          </button>
        )}
      </div>
      <div className="setting-row">
        <div>
          <label htmlFor="gf-key">
            <strong>Google Fonts API key (optional)</strong>
          </label>
          <span>
            Refreshes the catalog with new families and popularity order. The key is free and stays on this computer.{" "}
            <button type="button" className="link-btn" onClick={() => void openExternal(KEY_HELP)}>
              Get a key ↗
            </button>
          </span>
        </div>
        <form
          className="conv-row"
          onSubmit={(e) => {
            e.preventDefault();
            void refresh();
          }}
        >
          <input
            id="gf-key"
            className="text-input mono-input"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="AIza…"
          />
          <button type="submit" className="secondary-btn" disabled={busy || !key.trim()}>
            {busy ? "Refreshing…" : "Refresh"}
          </button>
        </form>
      </div>
      {message && (
        <p className={message.error ? "alert" : "help"} role="status">
          {message.text}
        </p>
      )}
    </>
  );
}
