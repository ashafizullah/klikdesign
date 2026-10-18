import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

async function boot() {
  if (import.meta.env.DEV && !("__TAURI_INTERNALS__" in window)) await import("./dev/browserMock");
  const { default: App } = await import("./App");
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

boot();
