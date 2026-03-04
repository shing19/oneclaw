import { useState, useCallback } from "react";
import type { ColorTokens } from "@/theme";
import { spacing, typography, borderRadius, transitions } from "@/theme";

interface FallbackChainProps {
  chain: readonly string[];
  providerNames: Record<string, string>;
  colors: ColorTokens;
  language: "zh-CN" | "en";
  onReorder: (newChain: string[]) => void;
}

export default function FallbackChain({
  chain,
  providerNames,
  colors,
  language,
  onReorder,
}: FallbackChainProps): React.JSX.Element {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const moveItem = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      const items = [...chain];
      const removed = items.splice(fromIndex, 1);
      const moved = removed[0];
      if (moved === undefined) return;
      items.splice(toIndex, 0, moved);
      onReorder(items);
    },
    [chain, onReorder],
  );

  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (dragIndex !== null && dragIndex !== index) {
        setDropIndex(index);
      }
    },
    [dragIndex],
  );

  const handleDrop = useCallback(
    (index: number) => {
      if (dragIndex !== null && dragIndex !== index) {
        moveItem(dragIndex, index);
      }
      setDragIndex(null);
      setDropIndex(null);
    },
    [dragIndex, moveItem],
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDropIndex(null);
  }, []);

  const t = language === "zh-CN"
    ? {
        title: "回退链",
        description: "按优先级排列供应商，首个可用的供应商将被使用",
        empty: "未添加供应商到回退链",
        moveUp: "上移",
        moveDown: "下移",
        remove: "移除",
        priority: "优先级",
      }
    : {
        title: "Fallback Chain",
        description: "Arrange providers by priority. The first available one will be used.",
        empty: "No providers in the fallback chain",
        moveUp: "Move Up",
        moveDown: "Move Down",
        remove: "Remove",
        priority: "Priority",
      };

  return (
    <div
      style={{
        backgroundColor: colors.bgSecondary,
        borderRadius: borderRadius.lg,
        border: `1px solid ${colors.borderLight}`,
        padding: spacing.xl,
        transition: `all ${transitions.duration} ${transitions.easing}`,
      }}
    >
      <div
        style={{
          fontSize: typography.fontSizeLg,
          fontWeight: typography.fontWeightMedium,
          color: colors.textPrimary,
          marginBottom: spacing.xs,
        }}
      >
        {t.title}
      </div>
      <div
        style={{
          fontSize: typography.fontSizeSm,
          color: colors.textSecondary,
          marginBottom: spacing.lg,
        }}
      >
        {t.description}
      </div>

      {chain.length === 0 ? (
        <div
          style={{
            fontSize: typography.fontSizeBase,
            color: colors.textDisabled,
            textAlign: "center",
            padding: spacing.xl,
          }}
        >
          {t.empty}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: spacing.sm }}>
          {chain.map((providerId, index) => {
            const isDragging = dragIndex === index;
            const isDropTarget = dropIndex === index;

            return (
              <div
                key={providerId}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={() => handleDrop(index)}
                onDragEnd={handleDragEnd}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: spacing.md,
                  padding: `${spacing.md}px ${spacing.lg}px`,
                  backgroundColor: isDropTarget
                    ? colors.accent + "10"
                    : colors.bgPrimary,
                  border: `1px solid ${isDropTarget ? colors.accent : colors.borderLight}`,
                  borderRadius: borderRadius.md,
                  cursor: "grab",
                  opacity: isDragging ? 0.5 : 1,
                  transition: `all ${transitions.duration} ${transitions.easing}`,
                  userSelect: "none",
                }}
              >
                {/* Drag handle */}
                <span
                  style={{
                    color: colors.textDisabled,
                    fontSize: typography.fontSizeBase,
                    cursor: "grab",
                    flexShrink: 0,
                  }}
                >
                  ⠿
                </span>

                {/* Priority number */}
                <span
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    backgroundColor: index === 0 ? colors.accent : colors.bgSecondary,
                    color: index === 0 ? "#ffffff" : colors.textSecondary,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: typography.fontSizeSm,
                    fontWeight: typography.fontWeightMedium,
                    flexShrink: 0,
                  }}
                >
                  {index + 1}
                </span>

                {/* Provider name */}
                <span
                  style={{
                    flex: 1,
                    fontSize: typography.fontSizeBase,
                    fontWeight: typography.fontWeightMedium,
                    color: colors.textPrimary,
                  }}
                >
                  {providerNames[providerId] ?? providerId}
                </span>

                {/* Move buttons */}
                <div style={{ display: "flex", gap: spacing.xs }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (index > 0) moveItem(index, index - 1);
                    }}
                    disabled={index === 0}
                    title={t.moveUp}
                    style={{
                      width: 28,
                      height: 28,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: typography.fontSizeSm,
                      color: index === 0 ? colors.textDisabled : colors.textSecondary,
                      backgroundColor: "transparent",
                      border: `1px solid ${colors.borderLight}`,
                      borderRadius: borderRadius.sm,
                      cursor: index === 0 ? "not-allowed" : "pointer",
                      fontFamily: "inherit",
                      transition: `all ${transitions.duration} ${transitions.easing}`,
                    }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (index < chain.length - 1) moveItem(index, index + 1);
                    }}
                    disabled={index === chain.length - 1}
                    title={t.moveDown}
                    style={{
                      width: 28,
                      height: 28,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: typography.fontSizeSm,
                      color: index === chain.length - 1 ? colors.textDisabled : colors.textSecondary,
                      backgroundColor: "transparent",
                      border: `1px solid ${colors.borderLight}`,
                      borderRadius: borderRadius.sm,
                      cursor: index === chain.length - 1 ? "not-allowed" : "pointer",
                      fontFamily: "inherit",
                      transition: `all ${transitions.duration} ${transitions.easing}`,
                    }}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const items = chain.filter((_, i) => i !== index);
                      onReorder([...items]);
                    }}
                    title={t.remove}
                    style={{
                      width: 28,
                      height: 28,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: typography.fontSizeSm,
                      color: colors.error,
                      backgroundColor: "transparent",
                      border: `1px solid ${colors.borderLight}`,
                      borderRadius: borderRadius.sm,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      transition: `all ${transitions.duration} ${transitions.easing}`,
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
