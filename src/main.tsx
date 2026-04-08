import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Global handler for unrecoverable DOM errors (insertBefore, removeChild)
// These happen when React's virtual DOM gets out of sync with the real DOM,
// typically due to portal-based components (Dialog, Toast, Popover) during navigation.
window.addEventListener("error", (event) => {
  const msg = event.error?.message || event.message || "";
  const isDomError =
    msg.includes("insertBefore") ||
    msg.includes("removeChild") ||
    msg.includes("not a child of this node");

  if (isDomError) {
    console.warn("[GlobalErrorHandler] DOM reconciliation error caught — preventing crash:", msg);
    event.preventDefault(); // Prevent the error from propagating
  }
});

createRoot(document.getElementById("root")!).render(<App />);
