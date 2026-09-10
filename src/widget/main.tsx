import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { FormWidget } from "./FormWidget";
import "./widget.css";

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <StrictMode>
      <FormWidget />
    </StrictMode>,
  );
}
