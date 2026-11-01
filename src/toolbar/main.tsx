import React from "react";
import ReactDOM from "react-dom/client";
import { Toolbar } from "./Toolbar";
import "./toolbar.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Toolbar />
  </React.StrictMode>,
);
