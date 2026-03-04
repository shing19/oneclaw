import { useState, useCallback } from "react";
import type { IpcModelSettings } from "@/ipc/methods/config";
import type { ColorTokens } from "@/theme";
import { spacing, typography, borderRadius, transitions } from "@/theme";

interface ModelSettingsPanelProps {
  providerId: string;
  modelId: string;
  modelName: string;
  settings: IpcModelSettings;
  colors: ColorTokens;
  language: "zh-CN" | "en";
  onSave: (providerId: string, modelId: string, settings: IpcModelSettings) => void;
  onClose: () => void;
}

const THINKING_OPTIONS = [
  "off", "minimal", "low", "medium", "high", "xhigh", "adaptive",
] as const;

const TRANSPORT_OPTIONS = ["sse", "websocket", "auto"] as const;

const CACHE_OPTIONS = ["none", "short", "long"] as const;

export default function ModelSettingsPanel({
  providerId,
  modelId,
  modelName,
  settings,
  colors,
  language,
  onSave,
  onClose,
}: ModelSettingsPanelProps): React.JSX.Element {
  const [temperature, setTemperature] = useState(settings.temperature ?? 0.7);
  const [maxTokens, setMaxTokens] = useState(settings.maxTokens ?? 4096);
  const [thinking, setThinking] = useState<IpcModelSettings["thinking"]>(settings.thinking ?? "off");
  const [timeout, setTimeout_] = useState(settings.timeout ?? 30);
  const [transport, setTransport] = useState<IpcModelSettings["transport"]>(settings.transport ?? "auto");
  const [streaming, setStreaming] = useState(settings.streaming ?? true);
  const [cacheRetention, setCacheRetention] = useState<IpcModelSettings["cacheRetention"]>(settings.cacheRetention ?? "none");

  const handleSave = useCallback(() => {
    onSave(providerId, modelId, {
      temperature,
      maxTokens,
      thinking,
      timeout: timeout,
      transport,
      streaming,
      cacheRetention,
    });
  }, [providerId, modelId, temperature, maxTokens, thinking, timeout, transport, streaming, cacheRetention, onSave]);

  const t = language === "zh-CN"
    ? {
        title: "模型设置",
        temperature: "温度",
        temperatureDesc: "控制生成随机性 (0-2)",
        maxTokens: "最大输出 Token",
        maxTokensDesc: "单次响应最大 Token 数",
        thinking: "思考模式",
        thinkingDesc: "模型内部推理深度",
        timeout: "超时 (秒)",
        timeoutDesc: "请求超时时间",
        transport: "传输方式",
        transportDesc: "API 连接协议",
        streaming: "流式输出",
        streamingDesc: "启用流式响应",
        cacheRetention: "缓存策略",
        cacheRetentionDesc: "响应缓存保留时间",
        save: "保存设置",
        cancel: "取消",
        enabled: "启用",
        disabled: "禁用",
      }
    : {
        title: "Model Settings",
        temperature: "Temperature",
        temperatureDesc: "Controls randomness (0-2)",
        maxTokens: "Max Output Tokens",
        maxTokensDesc: "Maximum tokens per response",
        thinking: "Thinking Mode",
        thinkingDesc: "Internal reasoning depth",
        timeout: "Timeout (seconds)",
        timeoutDesc: "Request timeout",
        transport: "Transport",
        transportDesc: "API connection protocol",
        streaming: "Streaming",
        streamingDesc: "Enable streaming responses",
        cacheRetention: "Cache Retention",
        cacheRetentionDesc: "Response cache duration",
        save: "Save Settings",
        cancel: "Cancel",
        enabled: "Enabled",
        disabled: "Disabled",
      };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: `${spacing.sm}px ${spacing.md}px`,
    fontSize: typography.fontSizeBase,
    fontFamily: "inherit",
    color: colors.textPrimary,
    backgroundColor: colors.bgPrimary,
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.sm,
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: typography.fontSizeSm,
    fontWeight: typography.fontWeightMedium,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  };

  const descStyle: React.CSSProperties = {
    fontSize: typography.fontSizeSm,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.4)",
        display: "flex",
        justifyContent: "flex-end",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 420,
          height: "100%",
          backgroundColor: colors.bgPrimary,
          borderLeft: `1px solid ${colors.border}`,
          padding: spacing.xl,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: spacing.lg,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div
              style={{
                fontSize: typography.fontSizeLg,
                fontWeight: typography.fontWeightBold,
                color: colors.textPrimary,
              }}
            >
              {t.title}
            </div>
            <div style={{ fontSize: typography.fontSizeSm, color: colors.textSecondary, marginTop: 2 }}>
              {modelName}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: typography.fontSizeLg,
              color: colors.textSecondary,
              backgroundColor: "transparent",
              border: "none",
              borderRadius: borderRadius.sm,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ borderTop: `1px solid ${colors.borderLight}`, paddingTop: spacing.lg }}>
          {/* Temperature */}
          <div style={{ marginBottom: spacing.lg }}>
            <div style={labelStyle}>{t.temperature}</div>
            <div style={descStyle}>{t.temperatureDesc}</div>
            <div style={{ display: "flex", alignItems: "center", gap: spacing.md }}>
              <input
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                style={{ flex: 1 }}
              />
              <span
                style={{
                  fontSize: typography.fontSizeBase,
                  color: colors.textPrimary,
                  fontFamily: "monospace",
                  minWidth: 32,
                  textAlign: "right",
                }}
              >
                {temperature.toFixed(1)}
              </span>
            </div>
          </div>

          {/* Max Tokens */}
          <div style={{ marginBottom: spacing.lg }}>
            <div style={labelStyle}>{t.maxTokens}</div>
            <div style={descStyle}>{t.maxTokensDesc}</div>
            <input
              type="number"
              min={1}
              max={128000}
              value={maxTokens}
              onChange={(e) => setMaxTokens(parseInt(e.target.value, 10) || 1)}
              style={inputStyle}
            />
          </div>

          {/* Thinking mode */}
          <div style={{ marginBottom: spacing.lg }}>
            <div style={labelStyle}>{t.thinking}</div>
            <div style={descStyle}>{t.thinkingDesc}</div>
            <select
              value={thinking ?? "off"}
              onChange={(e) => setThinking(e.target.value as IpcModelSettings["thinking"])}
              style={inputStyle}
            >
              {THINKING_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          {/* Timeout */}
          <div style={{ marginBottom: spacing.lg }}>
            <div style={labelStyle}>{t.timeout}</div>
            <div style={descStyle}>{t.timeoutDesc}</div>
            <input
              type="number"
              min={1}
              max={300}
              value={timeout}
              onChange={(e) => setTimeout_(parseInt(e.target.value, 10) || 1)}
              style={inputStyle}
            />
          </div>

          {/* Transport */}
          <div style={{ marginBottom: spacing.lg }}>
            <div style={labelStyle}>{t.transport}</div>
            <div style={descStyle}>{t.transportDesc}</div>
            <select
              value={transport ?? "auto"}
              onChange={(e) => setTransport(e.target.value as IpcModelSettings["transport"])}
              style={inputStyle}
            >
              {TRANSPORT_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          {/* Streaming */}
          <div style={{ marginBottom: spacing.lg }}>
            <div style={labelStyle}>{t.streaming}</div>
            <div style={descStyle}>{t.streamingDesc}</div>
            <button
              type="button"
              onClick={() => setStreaming(!streaming)}
              style={{
                padding: `${spacing.sm}px ${spacing.lg}px`,
                fontSize: typography.fontSizeBase,
                fontFamily: "inherit",
                color: streaming ? colors.success : colors.textSecondary,
                backgroundColor: "transparent",
                border: `1px solid ${streaming ? colors.success : colors.border}`,
                borderRadius: borderRadius.sm,
                cursor: "pointer",
                transition: `all ${transitions.duration} ${transitions.easing}`,
              }}
            >
              {streaming ? t.enabled : t.disabled}
            </button>
          </div>

          {/* Cache Retention */}
          <div style={{ marginBottom: spacing.xl }}>
            <div style={labelStyle}>{t.cacheRetention}</div>
            <div style={descStyle}>{t.cacheRetentionDesc}</div>
            <select
              value={cacheRetention ?? "none"}
              onChange={(e) => setCacheRetention(e.target.value as IpcModelSettings["cacheRetention"])}
              style={inputStyle}
            >
              {CACHE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Footer buttons */}
        <div style={{ display: "flex", gap: spacing.md, marginTop: "auto" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              padding: `${spacing.sm}px ${spacing.lg}px`,
              fontSize: typography.fontSizeBase,
              fontFamily: "inherit",
              color: colors.textPrimary,
              backgroundColor: "transparent",
              border: `1px solid ${colors.border}`,
              borderRadius: borderRadius.md,
              cursor: "pointer",
              transition: `all ${transitions.duration} ${transitions.easing}`,
            }}
          >
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={handleSave}
            style={{
              flex: 1,
              padding: `${spacing.sm}px ${spacing.lg}px`,
              fontSize: typography.fontSizeBase,
              fontFamily: "inherit",
              color: "#ffffff",
              backgroundColor: colors.accent,
              border: "none",
              borderRadius: borderRadius.md,
              cursor: "pointer",
              transition: `all ${transitions.duration} ${transitions.easing}`,
            }}
          >
            {t.save}
          </button>
        </div>
      </div>
    </div>
  );
}
