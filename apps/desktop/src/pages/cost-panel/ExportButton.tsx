import { useState } from "react";
import { ipcCallSafe } from "@/ipc/client";
import type { ColorTokens } from "@/theme";
import { spacing, typography, borderRadius, transitions } from "@/theme";

interface ExportButtonProps {
  colors: ColorTokens;
  language: "zh-CN" | "en";
}

export default function ExportButton({
  colors,
  language,
}: ExportButtonProps): React.JSX.Element {
  const [exporting, setExporting] = useState(false);

  const labels =
    language === "zh-CN"
      ? { csv: "导出 CSV", json: "导出 JSON", exporting: "导出中..." }
      : { csv: "Export CSV", json: "Export JSON", exporting: "Exporting..." };

  async function handleExport(format: "csv" | "json"): Promise<void> {
    setExporting(true);
    try {
      const result = await ipcCallSafe("cost.export", { format });
      if (result.ok) {
        const blob = new Blob([result.data.data], {
          type: format === "csv" ? "text/csv" : "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `oneclaw-cost.${format}`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setExporting(false);
    }
  }

  const buttonStyle: React.CSSProperties = {
    padding: `${spacing.sm}px ${spacing.lg}px`,
    fontSize: typography.fontSizeSm,
    fontWeight: typography.fontWeightMedium,
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.md,
    backgroundColor: colors.bgSecondary,
    color: colors.textPrimary,
    cursor: exporting ? "not-allowed" : "pointer",
    opacity: exporting ? 0.6 : 1,
    transition: `all ${transitions.duration} ${transitions.easing}`,
  };

  return (
    <div style={{ display: "flex", gap: spacing.sm }}>
      <button
        style={buttonStyle}
        disabled={exporting}
        onClick={() => void handleExport("csv")}
      >
        {exporting ? labels.exporting : labels.csv}
      </button>
      <button
        style={buttonStyle}
        disabled={exporting}
        onClick={() => void handleExport("json")}
      >
        {exporting ? labels.exporting : labels.json}
      </button>
    </div>
  );
}
