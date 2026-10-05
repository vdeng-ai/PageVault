import { publicIcons } from "./public-icons.js";

export function escapePublicHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const themeScript = `
(function(){
  var root=document.documentElement;
  try { root.dataset.theme=localStorage.getItem('pagevault.public.theme')==='light'?'light':'dark'; } catch (_) {}
  document.addEventListener('DOMContentLoaded',function(){
    var toggle=document.querySelector('[data-theme-toggle]');
    function update(){if(toggle){var light=root.dataset.theme==='light';toggle.setAttribute('aria-label',light?'切换深色模式':'切换浅色模式');toggle.setAttribute('title',light?'切换深色模式':'切换浅色模式');}}
    update();
    if(toggle)toggle.addEventListener('click',function(){root.dataset.theme=root.dataset.theme==='light'?'dark':'light';try{localStorage.setItem('pagevault.public.theme',root.dataset.theme);}catch(_){}update();});
    var links=Array.from(document.querySelectorAll('.reader-toc a'));
    if(links.length){
      var observed=links.map(function(link){return document.getElementById(decodeURIComponent(link.hash.slice(1)));}).filter(Boolean);
      function activate(id){links.forEach(function(link){var active=decodeURIComponent(link.hash.slice(1))===id;link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');});}
      activate(observed[0]&&observed[0].id);
      links.forEach(function(link){link.addEventListener('click',function(){activate(decodeURIComponent(link.hash.slice(1)));});});
      if('IntersectionObserver' in window){var observer=new IntersectionObserver(function(entries){entries.forEach(function(entry){if(entry.isIntersecting)activate(entry.target.id);});},{rootMargin:'-90px 0px -65% 0px'});observed.forEach(function(heading){observer.observe(heading);});}
    }
    var back=document.querySelector('[data-go-back]');
    if(back)back.addEventListener('click',function(){if(history.length>1)history.back();});
  });
})();`;

const styles = `
:root{color-scheme:dark;--bg:#09131d;--surface:#101e29;--text:#edf7fa;--secondary:#c3d5de;--muted:#91a9b6;--border:#29404e;--accent:#2dd4bf;--warning:#f9ca67;--warning-bg:#302819;font-family:Inter,"Noto Sans SC","PingFang SC","Microsoft YaHei",system-ui,sans-serif;color:var(--text);background:var(--bg);line-height:1.65;font-synthesis:none}
:root[data-theme=light]{color-scheme:light;--bg:#eef3f5;--surface:#fff;--text:#102538;--secondary:#365267;--muted:#536e80;--border:#ccdbe2;--accent:#0f766e;--warning:#936000;--warning-bg:#fff4d6}
*{box-sizing:border-box;scrollbar-width:thin;scrollbar-color:var(--border) var(--bg)}html{min-width:320px;scroll-padding-top:110px}body{margin:0;background:var(--bg)}::selection{background:var(--border);color:var(--text)}button,a{outline-offset:4px}button:focus-visible,a:focus-visible{outline:2px solid var(--accent)}button{cursor:pointer;font:inherit}a{color:var(--accent);text-underline-offset:4px}svg{flex-shrink:0}.public-header{height:82px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;padding:0 max(32px,calc((100vw - 1304px)/2));gap:20px}.public-brand{display:flex;align-items:center;gap:18px;color:var(--text);font-weight:750;font-size:24px;letter-spacing:-.025em}.brand-mark{display:grid;place-items:center;width:46px;height:46px;border-radius:10px;background:color-mix(in srgb,var(--accent) 15%,var(--bg));color:var(--accent)}.brand-mark svg{width:28px;height:28px}.public-label{margin-left:10px;padding-left:26px;border-left:1px solid var(--border);font-weight:400;font-size:16px;letter-spacing:0;color:var(--secondary)}.theme-button{display:grid;place-items:center;width:46px;height:46px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--secondary)}.theme-sun{display:none}:root[data-theme=light] .theme-sun{display:block}:root[data-theme=light] .theme-moon{display:none}.reader-layout{display:grid;grid-template-columns:252px minmax(0,1fr);width:calc(100% - 136px);max-width:1304px;margin:44px auto 22px;gap:66px}.reader-toc{padding:12px 34px 0 0;border-right:1px solid var(--border)}.toc-inner{position:sticky;top:32px}.reader-toc h2{font-size:20px;font-weight:650;margin:0 0 20px;color:var(--secondary)}.reader-toc ul{list-style:none;padding:0;margin:0}.reader-toc a{display:block;padding:10px 22px;border-left:2px solid var(--border);color:var(--secondary);text-decoration:none;font-size:17px}.reader-toc a:hover{color:var(--accent)}.reader-toc a.active{border-left:4px solid var(--accent);padding-left:20px;color:var(--accent);font-weight:600}.reader-toc .toc-nested{padding-left:12px}.reader-content{min-width:0}.markdown-body{color:var(--secondary);font-size:19px;line-height:1.75;overflow-wrap:anywhere}.markdown-body h1,.markdown-body h2,.markdown-body h3,.markdown-body h4{color:var(--text);font-weight:700;line-height:1.4;scroll-margin-top:24px}.markdown-body h1{font-size:46px;letter-spacing:-.02em;margin:0 0 12px}.markdown-body h2{font-size:30px;margin:32px 0 14px}.markdown-body h3{font-size:24px;margin:28px 0 12px}.markdown-body h4{font-size:20px;margin:24px 0 10px}.markdown-body h1+p{font-size:24px;color:var(--muted);margin:0 0 24px}.markdown-body p{margin:0 0 16px}.markdown-body hr{border:0;border-top:1px solid var(--border);margin:25px 0 32px}.markdown-body ul,.markdown-body ol{padding-left:32px;margin:14px 0 20px}.markdown-body blockquote{background:var(--surface);border:1px solid var(--border);border-left:6px solid var(--accent);border-radius:6px;margin:22px 0;padding:14px 22px;font-size:18px}.markdown-body blockquote p{margin:0}.markdown-body img{max-width:100%;height:auto;display:block;border-radius:6px}.markdown-body pre{overflow-x:auto;padding:18px;background:var(--surface);border:1px solid var(--border);border-radius:6px;font-size:15px}.markdown-body code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.markdown-body :not(pre)>code{padding:2px 5px;background:var(--surface);border-radius:4px;font-size:.9em}.markdown-body table{display:block;overflow-x:auto;border-collapse:collapse;max-width:100%;font-size:16px}.markdown-body td,.markdown-body th{padding:10px 14px;border:1px solid var(--border)}.reader-footer{display:flex;justify-content:space-between;gap:20px;border-top:1px solid var(--border);padding-top:12px;margin-top:24px;color:var(--muted);font-size:14px}.reader-footer a{display:flex;align-items:center;gap:10px;text-decoration:none}.reader-footer svg{width:18px;height:18px}.error-shell{min-height:100dvh;display:flex;flex-direction:column}.error-content{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;text-align:center;padding:114px 24px 50px}.error-icon{display:grid;place-items:center;width:106px;height:106px;margin-bottom:24px;border:2px solid var(--warning);border-radius:50%;background:var(--warning-bg);color:var(--warning)}.error-icon svg{width:48px;height:48px;stroke-width:1.75}.error-eyebrow{font-size:18px;color:var(--muted);margin:0 0 14px}.error-content h1{font-size:48px;line-height:1.4;margin:0 0 20px;letter-spacing:-.02em}.error-message{margin:0 0 10px;font-size:24px;color:var(--secondary)}.error-back{display:flex;align-items:center;justify-content:center;gap:16px;min-height:58px;padding:12px 48px;margin:30px 0 24px;color:var(--text);background:transparent;border:1px solid var(--border);border-radius:8px;font-size:20px;font-weight:550}.error-back:hover{background:var(--surface)}.error-back:disabled{opacity:.5;cursor:not-allowed}.error-code{font-size:15px;color:var(--muted);margin:0}.public-footer{text-align:center;color:var(--muted);font-size:14px;padding:30px 20px}
@media(max-width:960px){.reader-layout{width:calc(100% - 64px);grid-template-columns:190px minmax(0,1fr);gap:36px}.markdown-body h1{font-size:36px}.markdown-body{font-size:17px}.markdown-body h1+p{font-size:20px}.reader-toc{padding-right:20px}}
@media(max-width:700px){.public-header{height:72px;padding:0 20px}.public-brand{gap:10px;font-size:20px}.brand-mark{width:36px;height:36px;border-radius:8px}.brand-mark svg{width:24px;height:24px}.public-label{margin-left:0;padding-left:12px;font-size:12px}.theme-button{width:40px;height:44px}.reader-layout{display:block;width:calc(100% - 40px);margin:25px auto 20px}.reader-toc{padding:0 0 18px;margin-bottom:26px;border-right:0;border-bottom:1px solid var(--border)}.toc-inner{position:static}.reader-toc h2{font-size:16px;margin-bottom:8px}.reader-toc ul{display:flex;flex-wrap:wrap;gap:8px}.reader-toc li{max-width:100%}.reader-toc a{font-size:14px;padding:8px 12px;border:1px solid var(--border);border-radius:5px;min-height:44px}.reader-toc a.active{padding-left:12px;border:1px solid var(--accent)}.markdown-body{font-size:16px}.markdown-body h1{font-size:30px}.markdown-body h2{font-size:24px;margin-top:28px}.markdown-body h1+p{font-size:18px}.markdown-body blockquote{font-size:16px;padding:12px 16px}.error-content{padding:40px 20px}.error-content h1{font-size:30px}.error-message{font-size:17px;max-width:32ch}.error-icon{width:84px;height:84px}.error-back{font-size:17px;min-height:52px}.public-footer{font-size:12px}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}`;

export function publicHeader(document = false): string {
  return `<header class="public-header"><div class="public-brand"><span class="brand-mark">${publicIcons["shield-check"]}</span><span>PageVault</span>${document ? '<span class="public-label">分享文档</span>' : ""}</div><button class="theme-button" data-theme-toggle type="button" aria-label="切换浅色模式"><span class="theme-moon">${publicIcons.moon}</span><span class="theme-sun">${publicIcons.sun}</span></button></header>`;
}

export function publicDocument({
  title,
  body,
}: {
  title: string;
  body: string;
}): string {
  return `<!doctype html><html lang="zh-CN" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapePublicHtml(title)}</title><script>${themeScript}</script><style>${styles}</style></head><body>${body}</body></html>`;
}
