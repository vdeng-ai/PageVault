let nextDiagramId = 0;
let rendering = Promise.resolve();

export function renderMarkdownDiagrams(
  root: ParentNode,
  theme: "light" | "dark" = "light",
): Promise<void> {
  const blocks = Array.from(
    root.querySelectorAll<HTMLElement>("pre > code.language-mermaid"),
  );
  if (!blocks.length) return Promise.resolve();

  // Mermaid has global configuration; keep each batch on its own theme.
  rendering = rendering
    .then(async () => {
      const { default: mermaid } = await import("mermaid");
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        htmlLabels: false,
        suppressErrorRendering: true,
        theme: theme === "dark" ? "dark" : "default",
        layout: "dagre",
        fontFamily: "system-ui, sans-serif",
        secure: [
          "securityLevel",
          "secure",
          "startOnLoad",
          "maxTextSize",
          "maxEdges",
          "suppressErrorRendering",
          "htmlLabels",
          "dompurifyConfig",
          "theme",
          "themeCSS",
          "themeVariables",
          "fontFamily",
        ],
      });
      for (const code of blocks) {
        const pre = code.parentElement!;
        if (pre.dataset.diagramTheme === theme) continue;
        try {
          const { svg } = await mermaid.render(
            `pagevault-diagram-${nextDiagramId++}`,
            code.textContent ?? "",
          );
          const output = document.createElement("div");
          output.innerHTML = svg;
          const diagram = output.querySelector("svg")!;
          diagram.style.width = `${diagram.viewBox.baseVal.width}px`;
          diagram.style.maxWidth = "none";
          pre.querySelector("svg")?.remove();
          pre.append(diagram);
          pre.classList.add("markdown-diagram");
          code.hidden = true;
          pre.dataset.diagramTheme = theme;
        } catch {
          // Keep invalid diagrams as source without interrupting the document.
          pre.dataset.diagramError = "true";
        }
      }
    })
    .catch(() => {
      // Keep the source visible when the renderer cannot be loaded.
    });
  return rendering;
}
