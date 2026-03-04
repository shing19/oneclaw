import type { ThemeContext } from "@/hooks/use-theme";
import { layout, transitions } from "@/theme";

interface ContentPanelProps {
  theme: ThemeContext;
  children: React.ReactNode;
}

export default function ContentPanel({
  theme,
  children,
}: ContentPanelProps): React.JSX.Element {
  const { colors } = theme;

  return (
    <main
      style={{
        flex: 1,
        minWidth: layout.contentMinWidth,
        height: "100vh",
        backgroundColor: colors.bgPrimary,
        overflow: "auto",
        padding: layout.contentPadding,
        transition: `background-color ${transitions.duration} ${transitions.easing}`,
      }}
    >
      {children}
    </main>
  );
}
