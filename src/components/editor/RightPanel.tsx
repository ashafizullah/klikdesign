import { Layers as LayersIcon, SlidersHorizontal, Sparkles } from "lucide-react";
import { useUi, type RightTab } from "../../store/ui";
import { useChat } from "../../store/chat";
import { useT } from "../../i18n";
import { ErrorBoundary } from "../ui/ErrorBoundary";
import { Inspector } from "./Inspector";
import { Layers } from "./Layers";
import { ChatPanel } from "./ChatPanel";

const TABS: { id: RightTab; icon: typeof Sparkles; label: "right.design" | "right.layers" | "right.ai" }[] = [
  { id: "design", icon: SlidersHorizontal, label: "right.design" },
  { id: "layers", icon: LayersIcon, label: "right.layers" },
  { id: "ai", icon: Sparkles, label: "right.ai" },
];

export function RightPanel() {
  const t = useT();
  const tab = useUi((s) => s.rightTab);
  const setTab = useUi((s) => s.setRightTab);
  const busy = useChat((s) => s.busy);
  return (
    <aside className="flex h-full w-[300px] shrink-0 flex-col border-l border-line bg-panel">
      <div className="flex border-b border-line">
        {TABS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2.5 text-[12px] ${tab === id ? "border-accent text-text" : "border-transparent text-muted hover:text-text"}`}
          >
            <Icon size={13} className={id === "ai" && busy ? "animate-pulse text-accent" : ""} /> {t(label)}
          </button>
        ))}
      </div>
      <ErrorBoundary name={t(TABS.find((x) => x.id === tab)!.label)}>
        {tab === "ai" ? <ChatPanel /> : <div className="min-h-0 flex-1 overflow-y-auto">{tab === "design" ? <Inspector /> : <Layers />}</div>}
      </ErrorBoundary>
    </aside>
  );
}
