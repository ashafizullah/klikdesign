import { Component, type ReactNode } from "react";
import { t } from "../../i18n";

/** Keeps one broken panel from blanking the whole editor. */
export class ErrorBoundary extends Component<{ name: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="m-3 rounded-lg border border-danger/40 bg-danger/10 p-3 text-[12px] text-danger">
        <div className="mb-1 font-semibold">{t("common.error", { name: this.props.name })}</div>
        <pre className="text-[11px] whitespace-pre-wrap">{this.state.error.message}</pre>
        <button className="mt-2 underline" onClick={() => this.setState({ error: null })}>{t("common.retry")}</button>
      </div>
    );
  }
}
