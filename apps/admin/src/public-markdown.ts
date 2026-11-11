import { renderMarkdownDiagrams } from "./markdown-diagrams.js";

const root = document.documentElement;
function render() {
  void renderMarkdownDiagrams(
    document.querySelector(".markdown-body")!,
    root.dataset.theme === "dark" ? "dark" : "light",
  );
}

render();
new MutationObserver(render).observe(root, {
  attributes: true,
  attributeFilter: ["data-theme"],
});
