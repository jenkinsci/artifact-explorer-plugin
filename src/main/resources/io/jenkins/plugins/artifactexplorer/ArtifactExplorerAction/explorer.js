/*
 * Artifact Explorer: searchable, lazily loaded tree of a build's archived artifacts.
 * Plain browser JavaScript, no build step and no inline styles (Jenkins CSP friendly).
 */
(function () {
  'use strict';

  // Preserve deep-link hashes containing '/' or '.' while Jenkins's deferred app.js
  // runs dialogs_init(), which otherwise calls querySelector('.dialog-' + hash + '-hash').
  const initialHash = window.location.hash;
  if (initialHash && /[/.]/.test(initialHash)) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function init() {
    if (initialHash && !window.location.hash) {
      history.replaceState(null, '', initialHash);
    }
    const root = document.getElementById('artifact-explorer');
    if (!root) {
      return;
    }

    const buildUrl = root.dataset.buildUrl || '/';
    const artifactRootUrl = root.dataset.artifactRootUrl || (buildUrl + 'artifact/');
    const explorerRootUrl = root.dataset.explorerRootUrl || (buildUrl + 'artifact-explorer/');
    const basePath = root.dataset.initialPath || '';
    const MAX_SEARCH_RESULTS = 500;
    const EXPAND_ALL_BUDGET = 5000;
    const IMAGE_EXT = /\.(png|jpe?g|gif|webp|ico|bmp)$/i;

    const label = (key, fallback) => root.dataset['label' + key] || fallback || key;

    // ---------------------------------------------------------------- helpers

    function el(tag, className, text) {
      const node = document.createElement(tag);
      if (className) {
        node.className = className;
      }
      if (text !== undefined) {
        node.textContent = text;
      }
      return node;
    }

    function applyJenkinsBehaviour(container) {
      if (container && window.Behaviour && typeof window.Behaviour.applySubtree === 'function') {
        try {
          window.Behaviour.applySubtree(container, false);
        } catch (e) {
          // ignore if Behaviour is not fully initialized
        }
      }
    }

    function setTooltip(node, text) {
      if (!node || !text) {
        return;
      }
      node.setAttribute('tooltip', text);
      node.setAttribute('aria-label', text);
      if (node._tippy && typeof node._tippy.setContent === 'function') {
        node._tippy.setContent(text);
      }
    }

    function escapeHtml(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function parseCsvRow(rowStr, delimiter) {
      const res = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < rowStr.length; i++) {
        const ch = rowStr[i];
        if (ch === '"') {
          if (inQuotes && rowStr[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (ch === delimiter && !inQuotes) {
          res.push(current);
          current = '';
        } else {
          current += ch;
        }
      }
      res.push(current);
      return res;
    }

    function renderCsv(csvText, delimiter = ',') {
      const lines = csvText.trim().split(/\r?\n/).filter(Boolean);
      if (lines.length === 0) return '<div class="ae-empty">Empty data</div>';
      let html = '<div class="ae-md-table-wrap"><table class="ae-md-table ae-csv-table"><thead><tr>';
      const headers = parseCsvRow(lines[0], delimiter);
      headers.forEach((h) => {
        html += `<th>${escapeHtml(h)}</th>`;
      });
      html += '</tr></thead><tbody>';
      for (let i = 1; i < lines.length; i++) {
        const row = parseCsvRow(lines[i], delimiter);
        html += '<tr>';
        row.forEach((c) => {
          html += `<td>${escapeHtml(c)}</td>`;
        });
        html += '</tr>';
      }
      html += '</tbody></table></div>';
      return html;
    }

    function highlightJson(jsonStr) {
      return jsonStr.replace(
        /("(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?|[&<>]/g,
        (match, str, isKey, boolOrNull) => {
          if (str) {
            if (isKey) {
              return '<span class="ae-tok-key">' + escapeHtml(str) + '</span>' + escapeHtml(isKey);
            }
            return '<span class="ae-tok-str">' + escapeHtml(str) + '</span>';
          }
          if (boolOrNull) {
            const cls = boolOrNull === 'null' ? 'ae-tok-null' : 'ae-tok-bool';
            return '<span class="' + cls + '">' + boolOrNull + '</span>';
          }
          if (match === '&' || match === '<' || match === '>') {
            return escapeHtml(match);
          }
          return '<span class="ae-tok-num">' + match + '</span>';
        }
      );
    }

    function highlightVal(valStr) {
      return valStr.replace(
        /("(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"|'[^']*')|\b(true|false|yes|no|on|off|null|None|nil)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?|[&<>]/gi,
        (match, str, boolOrNull) => {
          if (str) {
            return '<span class="ae-tok-str">' + escapeHtml(str) + '</span>';
          }
          if (boolOrNull) {
            const lower = boolOrNull.toLowerCase();
            const cls = (lower === 'null' || lower === 'none' || lower === 'nil') ? 'ae-tok-null' : 'ae-tok-bool';
            return '<span class="' + cls + '">' + escapeHtml(boolOrNull) + '</span>';
          }
          if (match === '&' || match === '<' || match === '>') {
            return escapeHtml(match);
          }
          return '<span class="ae-tok-num">' + match + '</span>';
        }
      );
    }

    function highlightConfig(text) {
      const lines = text.split('\n');
      return lines.map((line) => {
        let comment = '';
        const hashIdx = line.indexOf('#');
        let codePart = line;
        if (hashIdx !== -1) {
          const before = line.substring(0, hashIdx);
          const singleQuotes = (before.match(/'/g) || []).length;
          const doubleQuotes = (before.match(/"/g) || []).length;
          if (singleQuotes % 2 === 0 && doubleQuotes % 2 === 0) {
            codePart = before;
            comment = line.substring(hashIdx);
          }
        }

        const keyValMatch = codePart.match(/^(\s*)([a-zA-Z0-9_\-\.]+)(\s*[:=]\s*)(.*)$/);
        let formatted = '';
        if (keyValMatch) {
          const [, indent, key, delim, val] = keyValMatch;
          formatted = escapeHtml(indent) +
            '<span class="ae-tok-key">' + escapeHtml(key) + '</span>' +
            escapeHtml(delim) +
            highlightVal(val);
        } else {
          const listMatch = codePart.match(/^(\s*-\s+)(.*)$/);
          if (listMatch) {
            formatted = escapeHtml(listMatch[1]) + highlightVal(listMatch[2]);
          } else {
            formatted = escapeHtml(codePart);
          }
        }

        if (comment) {
          formatted += '<span class="ae-tok-comment">' + escapeHtml(comment) + '</span>';
        }
        return formatted;
      }).join('\n');
    }

    function highlightXml(xmlStr) {
      const escaped = escapeHtml(xmlStr);
      return escaped.replace(
        /(&lt;!--[\s\S]*?--&gt;)|(&lt;\/?)([a-zA-Z0-9_\-:]+)((?:\s+[a-zA-Z0-9_\-:]+(?:=&quot;[^&]*&quot;)?)*\s*)(\/?&gt;)/g,
        (match, comment, openTag, tagName, attrs, closeTag) => {
          if (comment) {
            return '<span class="ae-tok-comment">' + comment + '</span>';
          }
          const formattedAttrs = attrs.replace(
            /([a-zA-Z0-9_\-:]+)(=)(&quot;[^&]*&quot;)/g,
            '<span class="ae-tok-key">$1</span>$2<span class="ae-tok-str">$3</span>'
          );
          return openTag + '<span class="ae-tok-bool">' + tagName + '</span>' + formattedAttrs + closeTag;
        }
      );
    }

    function colorizeCode(rawText, path) {
      if (/\.json$/i.test(path)) {
        return highlightJson(rawText);
      }
      if (/\.(ya?ml|properties|env|ini|conf|sh|bash)$/i.test(path)) {
        return highlightConfig(rawText);
      }
      if (/\.(xml|pom|svg|html|htm|jelly)$/i.test(path)) {
        return highlightXml(rawText);
      }
      return escapeHtml(rawText);
    }

    const encodePath = (p) => p.split('/').map(encodeURIComponent).join('/');
    const fileUrl = (p) => artifactRootUrl + encodePath(p);
    const viewUrl = (p) => fileUrl(p) + '/*view*/';
    const fingerprintUrl = (p) => fileUrl(p) + '/*fingerprint*/';
    const dirUrl = (p) => (p === '' ? artifactRootUrl : fileUrl(p) + '/');
    const baseName = (p) => p.substring(p.lastIndexOf('/') + 1);
    const absolute = (url) => new URL(url, window.location.href).href;

    function formatSize(bytes) {
      if (bytes < 1024) {
        return bytes + ' B';
      }
      const units = ['KB', 'MB', 'GB', 'TB'];
      let value = bytes / 1024;
      let i = 0;
      while (value >= 1024 && i < units.length - 1) {
        value /= 1024;
        i++;
      }
      return value.toFixed(value >= 10 ? 0 : 1) + ' ' + units[i];
    }

    function formatDate(ms) {
      return ms > 0 ? new Date(ms).toLocaleString() : '';
    }

    async function api(endpoint, params) {
      const query = params ? '?' + new URLSearchParams(params).toString() : '';
      const response = await fetch(explorerRootUrl + endpoint + query, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error('HTTP ' + response.status);
      }
      const body = await response.json();
      if (body.status !== 'ok') {
        throw new Error(body.message || 'error');
      }
      return body.data;
    }

    const SVGS = {
      folder:
        '<svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512"><path d="M440 432H72a40 40 0 01-40-40V120a40 40 0 0140-40h75.89a40 40 0 0122.19 6.72l27.84 18.56a40 40 0 0022.19 6.72H440a40 40 0 0140 40v240a40 40 0 01-40 40zM32 192h448" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"/></svg>',
      file:
        '<svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512"><path d="M416 221.25V416a48 48 0 01-48 48H144a48 48 0 01-48-48V96a48 48 0 0148-48h98.75a32 32 0 0122.62 9.37l141.26 141.26a32 32 0 019.37 22.62z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="32"/><path d="M256 56v120a32 32 0 0032 32h120M176 288h160M176 368h160" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"/></svg>',
      caret:
        '<svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="48" d="M184 112l144 144-144 144"/></svg>',
      download:
        '<svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512"><path d="M336 176h40a40 40 0 0140 40v208a40 40 0 01-40 40H136a40 40 0 01-40-40V216a40 40 0 0140-40h40" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M176 272l80 80 80-80M256 48v288"/></svg>',
      link:
        '<svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512"><path d="M208 352h-64a96 96 0 010-192h64M304 160h64a96 96 0 010 192h-64M163.29 256h187.42" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="36"/></svg>',
      reveal:
        '<svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512"><path d="M448 256c0-106-86-192-192-192S64 150 64 256s86 192 192 192 192-86 192-192z" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="32"/><path d="M296 352h28a28 28 0 0028-28v-28M352 216v-28a28 28 0 00-28-28h-28M216 352h-28a28 28 0 01-28-28v-28M160 216v-28a28 28 0 0128-28h28" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"/></svg>',
      preview:
        '<svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512"><path d="M255.66 112c-77.94 0-157.89 45.11-220.83 135.33a16 16 0 00-.27 17.77C82.92 340.8 161.8 400 255.66 400c92.84 0 173.34-59.38 221.79-135.25a16.14 16.14 0 000-17.47C428.89 172.28 347.8 112 255.66 112z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"/><circle cx="256" cy="256" r="80" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="32"/></svg>',
      close:
        '<svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M368 368L144 144M368 144L144 368"/></svg>',
      external:
        '<svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512"><path d="M384 224v184a40 40 0 01-40 40H104a40 40 0 01-40-40V168a40 40 0 0140-40h167.48M336 64h112v112M224 288L440 72" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"/></svg>',
      fingerprint:
        '<svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512"><path d="M390.42 75.28a10.45 10.45 0 01-5.32-1.44C340.72 50.08 302.35 40 256.35 40c-45.77 0-89.23 11.28-128.76 33.84C122 77 115.11 74.8 111.87 69a12.4 12.4 0 014.63-16.32A281.81 281.81 0 01256.35 16c49.23 0 92.23 11.28 139.39 36.48a12 12 0 014.85 16.08 11.3 11.3 0 01-10.17 6.72zm-330.79 126a11.73 11.73 0 01-6.7-2.16 12.26 12.26 0 01-2.78-16.8c22.89-33.6 52-60 86.69-78.48 72.58-38.84 165.51-39.12 238.32-.24 34.68 18.48 63.8 44.64 86.69 78a12.29 12.29 0 01-2.78 16.8 11.26 11.26 0 01-16.18-2.88c-20.8-30.24-47.15-54-78.36-70.56-66.34-35.28-151.18-35.28-217.29.24-31.44 16.8-57.79 40.8-78.59 71a10 10 0 01-9.02 5.08zM204.1 491a10.66 10.66 0 01-8.09-3.6C175.9 466.48 165 453 149.55 424c-16-29.52-24.27-65.52-24.27-104.16 0-71.28 58.71-129.36 130.84-129.36S387 248.56 387 319.84a11.56 11.56 0 11-23.11 0c0-58.08-48.32-105.36-107.72-105.36S148.4 261.76 148.4 319.84c0 34.56 7.39 66.48 21.49 92.4 14.8 27.6 25 39.36 42.77 58.08a12.67 12.67 0 010 17 12.44 12.44 0 01-8.56 3.68zm165.75-44.4c-27.51 0-51.78-7.2-71.66-21.36a129.1 129.1 0 01-55-105.36 11.57 11.57 0 1123.12 0 104.28 104.28 0 0044.84 85.44c16.41 11.52 35.6 17 58.72 17a147.41 147.41 0 0024-2.4c6.24-1.2 12.25 3.12 13.4 9.84a11.92 11.92 0 01-9.47 13.92 152.28 152.28 0 01-27.95 2.88zM323.38 496a13 13 0 01-3-.48c-36.76-10.56-60.8-24.72-86-50.4-32.37-33.36-50.16-77.76-50.16-125.28 0-38.88 31.9-70.56 71.19-70.56s71.2 31.68 71.2 70.56c0 25.68 21.5 46.56 48.08 46.56s48.08-20.88 48.08-46.56c0-90.48-75.13-163.92-167.59-163.92-65.65 0-125.75 37.92-152.79 96.72-9 19.44-13.64 42.24-13.64 67.2 0 18.72 1.61 48.24 15.48 86.64 2.32 6.24-.69 13.2-6.7 15.36a11.34 11.34 0 01-14.79-7 276.39 276.39 0 01-16.88-95c0-28.8 5.32-55 15.72-77.76 30.75-67 98.94-110.4 173.6-110.4 105.18 0 190.71 84.24 190.71 187.92 0 38.88-31.9 70.56-71.2 70.56s-71.2-31.68-71.2-70.56c.01-25.68-21.49-46.6-48.07-46.6s-48.08 20.88-48.08 46.56c0 41 15.26 79.44 43.23 108.24 22 22.56 43 35 75.59 44.4 6.24 1.68 9.71 8.4 8.09 14.64a11.39 11.39 0 01-10.87 9.16z" fill="currentColor"/></svg>',
      copy:
        '<svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512"><rect x="128" y="128" width="336" height="336" rx="57" ry="57" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="32"/><path d="M383.5 128l.5-24a56.16 56.16 0 00-56-56H112a64.19 64.19 0 00-64 64v216a56.16 56.16 0 0056 56h24M296 216v160M376 296H216" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"/></svg>',
      check:
        '<svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M416 128L192 384l-96-96"/></svg>',
      shield:
        '<svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512"><path d="M463.1 112.37C373.68 96.33 336.71 84.45 256 48c-80.71 36.45-117.68 48.33-207.1 64.37C32.7 369.13 240.58 457.79 256 464c15.42-6.21 223.3-94.87 207.1-351.63z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"/><path d="M250.26 155.39l5.74 122 5.73-121.95a5.74 5.74 0 00-5.79-6h0a5.74 5.74 0 00-5.68 5.95z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"/><path fill="currentColor" d="M256 380.25a20 20 0 1120-20 20 20 0 01-20 20z"/></svg>',
    };

    function svgIcon(kind) {
      const raw = SVGS[kind] || SVGS.file;
      const t = document.createElement('template');
      t.innerHTML = raw.trim();
      const svg = t.content.firstElementChild;
      svg.setAttribute('class', 'ae-icon ae-icon--' + kind);
      svg.setAttribute('aria-hidden', 'true');
      return svg;
    }

    function iconButton(kind, title, onClick) {
      const button = el('button', 'ae-iconbutton');
      button.type = 'button';
      setTooltip(button, title);
      button.appendChild(svgIcon(kind));
      button.addEventListener('click', onClick);
      return button;
    }

    function iconLink(kind, title, href, download) {
      const link = el('a', 'ae-iconbutton');
      link.href = href;
      setTooltip(link, title);
      if (download) {
        link.setAttribute('download', '');
      }
      link.appendChild(svgIcon(kind));
      return link;
    }

    function notify(message, isWarning) {
      if (!message) {
        return;
      }
      if (window.notificationBar && typeof window.notificationBar.show === 'function') {
        const type = isWarning ? window.notificationBar.WARNING : window.notificationBar.SUCCESS;
        window.notificationBar.show(message, type);
      }
    }

    async function copyTextToClipboard(text) {
      if (!text) {
        return false;
      }
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        try {
          await navigator.clipboard.writeText(text);
          return true;
        } catch (e) {
          // Clipboard API unavailable or rejected
        }
      }
      return false;
    }

    function copyLinkButton(urlOrGetter, customToastMsg) {
      const defaultLabel = label('CopyLink', 'Copy link');
      const button = iconButton('link', defaultLabel, async () => {
        const raw = typeof urlOrGetter === 'function' ? urlOrGetter() : urlOrGetter;
        if (!raw) return;
        const urlToCopy = absolute(raw);
        const success = await copyTextToClipboard(urlToCopy);
        if (success) {
          const doneLabel = label('Copied', 'Copied!');
          setTooltip(button, doneLabel);
          button.replaceChildren(svgIcon('check'));
          button.classList.add('ae-iconbutton--done');
          notify(customToastMsg || label('ToastLinkCopied', 'Link copied to clipboard'));
          window.setTimeout(() => {
            setTooltip(button, defaultLabel);
            button.replaceChildren(svgIcon('link'));
            button.classList.remove('ae-iconbutton--done');
          }, 1500);
        } else {
          notify(label('CopyFailed', 'Could not copy to clipboard'), true);
        }
      });
      return button;
    }

    function copyContentButton(getTextFn) {
      const defaultLabel = label('CopyContents', 'Copy file contents');
      const button = iconButton('copy', defaultLabel, async () => {
        const text = typeof getTextFn === 'function' ? getTextFn() : getTextFn;
        if (!text) {
          return;
        }
        const success = await copyTextToClipboard(text);
        if (success) {
          const doneLabel = label('Copied', 'Copied!');
          setTooltip(button, doneLabel);
          button.replaceChildren(svgIcon('check'));
          button.classList.add('ae-iconbutton--done');
          notify(label('ToastContentsCopied', 'File contents copied to clipboard'));
          window.setTimeout(() => {
            setTooltip(button, defaultLabel);
            button.replaceChildren(svgIcon('copy'));
            button.classList.remove('ae-iconbutton--done');
          }, 1500);
        } else {
          notify(label('CopyFailed', 'Could not copy to clipboard'), true);
        }
      });
      return button;
    }

    function copyPathButton(pathOrGetter, customToastMsg) {
      const defaultLabel = label('CopyPath', 'Copy relative path');
      const button = iconButton('copy', defaultLabel, async () => {
        const raw = typeof pathOrGetter === 'function' ? pathOrGetter() : pathOrGetter;
        if (!raw) return;
        const success = await copyTextToClipboard(raw);
        if (success) {
          const doneLabel = label('Copied', 'Copied!');
          setTooltip(button, doneLabel);
          button.replaceChildren(svgIcon('check'));
          button.classList.add('ae-iconbutton--done');
          notify(customToastMsg || label('ToastPathCopied', 'Path copied to clipboard'));
          window.setTimeout(() => {
            setTooltip(button, defaultLabel);
            button.replaceChildren(svgIcon('copy'));
            button.classList.remove('ae-iconbutton--done');
          }, 1500);
        } else {
          notify(label('CopyFailed', 'Could not copy to clipboard'), true);
        }
      });
      return button;
    }

    // ------------------------------------------------------------------ layout

    const searchInput = document.getElementById('ae-searchinput');
    const expandAllButton = document.getElementById('ae-expandall');
    const collapseAllButton = document.getElementById('ae-collapseall');
    const zipLink = document.getElementById('ae-ziplink');
    const helpButton = document.getElementById('ae-helpbtn');
    const pillsBar = document.getElementById('ae-pills-bar');
    const breadcrumb = document.getElementById('ae-breadcrumb');
    const status = document.getElementById('ae-status');
    const workspace = document.getElementById('ae-workspace');
    const listColumn = document.getElementById('ae-main');
    const treeContainer = document.getElementById('ae-tree');
    const resultsContainer = document.getElementById('ae-results');
    const previewPane = document.getElementById('ae-preview');

    zipLink.href = (basePath === '' ? fileUrl('') : fileUrl(basePath) + '/') + '*zip*/' +
      (basePath === '' ? 'archive' : baseName(basePath)) + '.zip';

    (function buildBreadcrumb() {
      if (basePath === '') {
        breadcrumb.hidden = true;
        return;
      }
      breadcrumb.hidden = false;
      const rootLink = el('a', 'ae-breadcrumb-link', label('ArtifactsRoot', 'Artifacts'));
      rootLink.href = dirUrl('');
      breadcrumb.append(svgIcon('folder'), rootLink);
      let accumulated = '';
      basePath.split('/').filter(Boolean).forEach((segment) => {
        accumulated = accumulated === '' ? segment : accumulated + '/' + segment;
        breadcrumb.appendChild(el('span', 'ae-sep', '/'));
        const link = el('a', 'ae-breadcrumb-link', segment);
        link.href = dirUrl(accumulated);
        breadcrumb.appendChild(link);
      });
    })();

    // -------------------------------------------------------- shortcuts dialog

    function getOpenDialog() {
      return document.querySelector('dialog.jenkins-dialog[open]');
    }

    function isModalOpen() {
      return Boolean(getOpenDialog());
    }

    function toggleShortcutsModal() {
      const openDialog = getOpenDialog();
      if (openDialog) {
        openDialog.dispatchEvent(new Event('cancel'));
      } else if (helpButton) {
        helpButton.click();
      }
    }

    // ----------------------------------------------------------------- preview

    let activePreview = null;
    let activePreviewPath = null;
    let previewSequence = 0;
    let checksumManifestCache = null;

    async function fetchAndParseChecksumManifests() {
      if (checksumManifestCache !== null) {
        return checksumManifestCache;
      }
      const manifests = [];
      try {
        const files = await loadIndex();
        if (Array.isArray(files)) {
          files.forEach((f) => {
            if (/\.(sha256|sha512|md5)$/i.test(f) || /(^|\/)checksums\.[a-z0-9]+$/i.test(f)) {
              manifests.push(f);
            }
          });
        }
      } catch (e) {
        // ignore
      }

      const entries = [];
      for (const mPath of manifests) {
        try {
          const data = await api('preview', { path: mPath });
          if (data && !data.binary && typeof data.text === 'string') {
            const lines = data.text.split(/\r?\n/);
            lines.forEach((line) => {
              const match = line.trim().match(/^([a-f0-9]{32,128})\s+[\*]?(.*)$/i);
              if (match) {
                entries.push({
                  hash: match[1].toLowerCase(),
                  file: match[2].trim(),
                  manifestPath: mPath
                });
              }
            });
          }
        } catch (err) {
          // ignore
        }
      }
      checksumManifestCache = entries;
      return entries;
    }

    function closePreview() {
      activePreview = null;
      activePreviewPath = null;
      previewPane.hidden = true;
      previewPane.replaceChildren();
      workspace.classList.remove('ae-workspace--split');
      root.querySelectorAll('.ae-row--selected').forEach((r) => r.classList.remove('ae-row--selected'));
      if (window.location.hash) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }

    function highlightRowForPath(path) {
      root.querySelectorAll('.ae-row--selected').forEach((r) => r.classList.remove('ae-row--selected'));
      const node = nodesByPath.get(path);
      if (node && node.li.firstElementChild) {
        node.li.firstElementChild.classList.add('ae-row--selected');
      }
    }

    async function openPreview(path) {
      const seq = ++previewSequence;
      activePreviewPath = path;
      highlightRowForPath(path);
      workspace.classList.add('ae-workspace--split');
      previewPane.hidden = false;
      previewPane.replaceChildren();

      const relPath = (basePath && path.startsWith(basePath + '/')) ? path.substring(basePath.length + 1) : path;
      const targetHash = '#' + encodePath(relPath);
      if (window.location.hash !== targetHash) {
        history.replaceState(null, '', targetHash);
      }

      const isMd = /\.(md|markdown)$/i.test(path);
      const isHtml = /\.(html|htm)$/i.test(path);
      const isSvg = /\.svg$/i.test(path);
      const isCsv = /\.(csv|tsv)$/i.test(path);
      const isRenderable = isMd || isHtml || isSvg || isCsv;

      const header = el('div', 'ae-preview-header');
      const headerMain = el('div', 'ae-preview-header-main');
      const titleWrap = el('div', 'ae-preview-title');
      const nameSpan = el('span', 'ae-preview-name', baseName(path));
      nameSpan.title = baseName(path);
      titleWrap.append(svgIcon('file'), nameSpan);

      const closeBtn = iconButton('close', label('Close'), closePreview);
      closeBtn.classList.add('ae-preview-close');
      headerMain.append(titleWrap, closeBtn);

      const headerActions = el('div', 'ae-preview-actions ae-preview-toolbar');
      let previewBtn = null;
      let codeBtn = null;
      let modeGroup = null;
      if (isRenderable) {
        modeGroup = el('div', 'ae-preview-mode-group');
        previewBtn = el('button', 'ae-preview-toggle ae-preview-toggle--active', 'Preview');
        previewBtn.type = 'button';
        codeBtn = el('button', 'ae-preview-toggle', 'Code');
        codeBtn.type = 'button';
        modeGroup.append(previewBtn, codeBtn);
        headerActions.appendChild(modeGroup);
      }

      const rawLink = el('a', 'jenkins-button ae-btn-sm', label('Raw'));
      rawLink.href = fileUrl(path);
      rawLink.target = '_blank';
      rawLink.rel = 'noopener noreferrer';
      const dlLink = el('a', 'jenkins-button ae-btn-sm', label('Download'));
      dlLink.href = fileUrl(path);
      dlLink.setAttribute('download', '');

      headerActions.append(rawLink, dlLink);

      const divider = el('span', 'ae-preview-toolbar-divider');
      headerActions.appendChild(divider);

      const checksumBtn = iconButton('shield', (label('ComputeChecksum') || 'Compute SHA-256') + ' (s)', () => runChecksumComputation());

      const openInNewTab = iconLink('external', label('OpenInNewTab') || 'Open in new tab', viewUrl(path), false);
      openInNewTab.target = '_blank';
      openInNewTab.rel = 'noopener noreferrer';

      const fpLink = iconLink('fingerprint', label('Fingerprint', 'See fingerprints'), fingerprintUrl(path), false);

      let currentPreviewText = '';
      const copyContentBtn = copyContentButton(() => currentPreviewText);
      copyContentBtn.hidden = true;

      const copyLinkBtn = copyLinkButton(() => window.location.href, label('ToastDeepLinkCopied', 'Shareable deep link copied to clipboard'));

      headerActions.append(checksumBtn, openInNewTab, fpLink, copyContentBtn, copyLinkBtn);
      header.append(headerMain, headerActions);

      const meta = el('div', 'ae-preview-meta');
      const metaPath = el('span', 'ae-preview-meta-path', path);
      metaPath.title = path;
      const copyPathBtn = copyPathButton(() => path, label('ToastPathCopied', 'Path copied to clipboard'));
      meta.append(metaPath, copyPathBtn);

      const checksumBar = el('div', 'ae-checksum-bar');
      checksumBar.hidden = true;
      const body = el('div', 'ae-preview-body');
      body.textContent = label('Loading');
      previewPane.append(header, meta, checksumBar, body);
      applyJenkinsBehaviour(header);
      applyJenkinsBehaviour(meta);

      let calculatedHash = null;
      let isComputing = false;

      async function runChecksumComputation() {
        if (isComputing) {
          return;
        }
        checksumBar.hidden = false;
        if (calculatedHash) {
          checksumBar.classList.add('ae-checksum-bar--flash');
          setTimeout(() => checksumBar.classList.remove('ae-checksum-bar--flash'), 600);
          return;
        }
        isComputing = true;
        checksumBtn.classList.add('ae-iconbutton--loading');
        checksumBar.replaceChildren();
        const loadingSpan = el('span', 'ae-checksum-loading', label('ComputingChecksum') || 'Computing SHA-256...');
        checksumBar.appendChild(loadingSpan);

        try {
          const hashData = await api('sha256', { path });
          if (seq !== previewSequence) {
            return;
          }
          calculatedHash = hashData.sha256;

          const manifests = await fetchAndParseChecksumManifests();
          if (seq !== previewSequence) {
            return;
          }

          let matchEntry = null;
          let mismatchEntry = null;

          for (const entry of manifests) {
            const fileMatches = (
              entry.file === path ||
              path.endsWith('/' + entry.file) ||
              entry.file === baseName(path)
            );
            if (fileMatches) {
              if (entry.hash.toLowerCase() === calculatedHash.toLowerCase()) {
                matchEntry = entry;
                break;
              } else {
                mismatchEntry = entry;
              }
            }
          }

          if (!matchEntry && !mismatchEntry) {
            matchEntry = manifests.find((e) => e.hash.toLowerCase() === calculatedHash.toLowerCase());
          }

          checksumBar.replaceChildren();

          let badge;
          if (matchEntry) {
            badge = el('span', 'ae-checksum-badge ae-checksum-badge--verified');
            badge.append(svgIcon('shield'), el('span', '', 'Verified Match (' + baseName(matchEntry.manifestPath) + ')'));
            setTooltip(badge, matchEntry.manifestPath);
          } else if (mismatchEntry) {
            badge = el('span', 'ae-checksum-badge ae-checksum-badge--mismatch');
            badge.append(svgIcon('shield'), el('span', '', 'Checksum Mismatch!'));
            setTooltip(badge, 'Expected: ' + mismatchEntry.hash + ' in ' + mismatchEntry.manifestPath);
          } else {
            badge = el('span', 'ae-checksum-badge');
            badge.append(svgIcon('shield'), el('span', '', 'SHA-256'));
          }

          const code = el('code', 'ae-checksum-code', calculatedHash);

          const copyBtn = iconButton('copy', label('CopyHash', 'Copy hash'), async () => {
            const success = await copyTextToClipboard(calculatedHash);
            if (success) {
              const doneLabel = label('Copied', 'Copied!');
              setTooltip(copyBtn, doneLabel);
              copyBtn.replaceChildren(svgIcon('check'));
              copyBtn.classList.add('ae-iconbutton--done');
              notify(label('ToastHashCopied', 'SHA-256 hash copied to clipboard'));
              setTimeout(() => {
                setTooltip(copyBtn, label('CopyHash', 'Copy hash'));
                copyBtn.replaceChildren(svgIcon('copy'));
                copyBtn.classList.remove('ae-iconbutton--done');
              }, 1500);
            } else {
              notify(label('CopyFailed', 'Could not copy to clipboard'), true);
            }
          });

          checksumBar.append(badge, code, copyBtn);
          applyJenkinsBehaviour(checksumBar);
        } catch (err) {
          if (seq === previewSequence) {
            checksumBar.replaceChildren();
            checksumBar.appendChild(el('span', 'ae-status--error', 'Failed to compute SHA-256 (' + err.message + ')'));
          }
        } finally {
          isComputing = false;
          checksumBtn.classList.remove('ae-iconbutton--loading');
        }
      }

      activePreview = {
        path,
        sequence: seq,
        copyContent: () => copyContentBtn.click(),
        copyLink: () => copyLinkBtn.click(),
        download: () => dlLink.click(),
        computeChecksum: () => runChecksumComputation(),
      };

      if (IMAGE_EXT.test(path)) {
        body.replaceChildren();
        const figure = el('div', 'ae-preview-image-wrap');
        const img = el('img', 'ae-preview-image');
        img.src = fileUrl(path);
        img.alt = baseName(path);
        figure.appendChild(img);
        body.appendChild(figure);
      }

      try {
        const data = await api('preview', { path });
        if (seq !== previewSequence) {
          return;
        }
        meta.replaceChildren();
        const metaPath = el('span', 'ae-preview-meta-path', data.path);
        metaPath.title = data.path;
        meta.appendChild(metaPath);

        const metaDetails = el('div', 'ae-preview-meta-details');
        const sizeSpan = el('span', 'ae-preview-meta-size', formatSize(data.size));
        metaDetails.appendChild(sizeSpan);

        if (data.lastModified > 0) {
          metaDetails.append(el('span', 'ae-preview-meta-sep', '•'), el('span', 'ae-preview-meta-date', formatDate(data.lastModified)));
        }
        if (data.truncated) {
          metaDetails.append(el('span', 'ae-preview-meta-sep', '•'), el('span', 'ae-preview-meta-badge', label('PreviewTruncated')));
        }

        const copyPathBtn = copyPathButton(() => data.path, label('ToastPathCopied', 'Path copied to clipboard'));
        metaDetails.appendChild(copyPathBtn);

        meta.appendChild(metaDetails);
        applyJenkinsBehaviour(meta);

        if (IMAGE_EXT.test(path)) {
          return;
        }
        body.replaceChildren();

        if (!data.binary && typeof data.text === 'string' && data.text.length > 0) {
          currentPreviewText = data.text;
          copyContentBtn.hidden = false;
        }

        if (isRenderable) {
          const renderedContainer = el('div', 'ae-preview-rendered');
          const codeContainer = el('div', 'ae-preview-code-wrap');
          codeContainer.hidden = true;

          const pre = el('pre', 'ae-preview-code');
          pre.innerHTML = colorizeCode(data.text || '', path);
          codeContainer.appendChild(pre);

          if (isMd) {
            renderedContainer.innerHTML = data.renderedHtml || escapeHtml(data.text || '');
          } else if (isHtml) {
            const frame = el('iframe', 'ae-preview-frame');
            frame.setAttribute('sandbox', 'allow-same-origin');
            frame.setAttribute('title', baseName(path));
            frame.src = fileUrl(path);
            renderedContainer.appendChild(frame);
          } else if (isSvg) {
            const figure = el('div', 'ae-preview-image-wrap');
            const img = el('img', 'ae-preview-image');
            img.src = fileUrl(path);
            img.alt = baseName(path);
            figure.appendChild(img);
            renderedContainer.appendChild(figure);
          } else if (isCsv) {
            renderedContainer.innerHTML = renderCsv(data.text || '', /\.tsv$/i.test(path) ? '\t' : ',');
          }

          body.append(renderedContainer, codeContainer);

          if (previewBtn && codeBtn) {
            previewBtn.addEventListener('click', () => {
              previewBtn.classList.add('ae-preview-toggle--active');
              codeBtn.classList.remove('ae-preview-toggle--active');
              renderedContainer.hidden = false;
              codeContainer.hidden = true;
            });
            codeBtn.addEventListener('click', () => {
              codeBtn.classList.add('ae-preview-toggle--active');
              previewBtn.classList.remove('ae-preview-toggle--active');
              renderedContainer.hidden = true;
              codeContainer.hidden = false;
            });
          }
          return;
        }

        if (data.binary) {
          body.appendChild(el('div', 'ae-empty', label('Binary') + ' (' + formatSize(data.size) + ')'));
          return;
        }
        const pre = el('pre', 'ae-preview-code');
        let text = data.text || '';
        if (/\.json$/i.test(path) && !data.truncated) {
          try {
            text = JSON.stringify(JSON.parse(text), null, 2);
            currentPreviewText = text;
          } catch (e) {
            // leave unformatted if invalid JSON
          }
        }
        pre.innerHTML = colorizeCode(text, path);
        body.appendChild(pre);
      } catch (e) {
        if (seq === previewSequence && !IMAGE_EXT.test(path)) {
          body.textContent = label('Error') + ' (' + e.message + ')';
        }
      }
    }

    // -------------------------------------------------------------------- tree

    const nodesByPath = new Map();

    function setStatus(message, isError) {
      status.textContent = message || '';
      status.classList.toggle('ae-status--error', Boolean(isError));
    }

    function createList(depth) {
      const list = el('ul', 'ae-list');
      list.setAttribute('role', depth === 0 ? 'tree' : 'group');
      return list;
    }

    async function loadChildren(node) {
      if (node.loaded || node.loading) {
        return node.loading;
      }
      node.loading = (async () => {
        node.li.classList.add('ae-node--loading');
        try {
          const data = await api('tree', { path: node.path });
          node.childrenList = createList(node.depth + 1);
          data.entries.forEach((entry) => node.childrenList.appendChild(renderNode(entry, node.depth + 1)));
          if (data.entries.length === 0) {
            node.childrenList.appendChild(el('li', 'ae-empty', label('Empty')));
          }
          if (data.truncated) {
            node.childrenList.appendChild(el('li', 'ae-empty', label('Truncated')));
          }
          node.li.appendChild(node.childrenList);
          applyJenkinsBehaviour(node.childrenList);
          node.loaded = true;
        } catch (e) {
          setStatus(label('Error') + ' (' + e.message + ')', true);
        } finally {
          node.li.classList.remove('ae-node--loading');
          node.loading = null;
        }
      })();
      return node.loading;
    }

    async function setExpanded(node, expanded) {
      if (expanded) {
        await loadChildren(node);
        if (!node.loaded) {
          return;
        }
      }
      node.expanded = expanded;
      node.li.setAttribute('aria-expanded', String(expanded));
      node.li.classList.toggle('ae-node--open', expanded);
      if (node.childrenList) {
        node.childrenList.hidden = !expanded;
      }
    }

    function renderNode(entry, depth) {
      const li = el('li', 'ae-node');
      li.style.setProperty('--depth', String(depth));
      li.dataset.path = entry.path;
      const node = { entry, path: entry.path, depth, li, loaded: false, expanded: false };
      nodesByPath.set(entry.path, node);

      const row = el('div', 'ae-row');
      row.tabIndex = 0;
      row.dataset.path = entry.path;

      if (entry.directory) {
        li.setAttribute('role', 'treeitem');
        li.setAttribute('aria-expanded', 'false');
        const toggle = iconButton('caret', entry.name, () => setExpanded(node, !node.expanded));
        toggle.classList.add('ae-toggle');
        row.appendChild(toggle);
        row.appendChild(svgIcon('folder'));
        const name = el('button', 'ae-name ae-name--dir', entry.name);
        name.type = 'button';
        name.title = entry.name;
        name.addEventListener('click', () => setExpanded(node, !node.expanded));
        row.appendChild(name);
        row.appendChild(el('span', 'ae-size'));
        row.appendChild(el('span', 'ae-date'));
        const actions = el('span', 'ae-actions');
        actions.append(
          iconLink('download', label('DownloadFolderZip') || label('DownloadZip'), fileUrl(entry.path) + '/*zip*/' + encodeURIComponent(entry.name) + '.zip', false),
          copyLinkButton(dirUrl(entry.path), label('ToastFolderLinkCopied', 'Folder link copied to clipboard')));
        row.appendChild(actions);
      } else {
        li.setAttribute('role', 'treeitem');
        row.appendChild(el('span', 'ae-toggle ae-toggle--spacer'));
        row.appendChild(svgIcon('file'));
        const name = el('a', 'ae-name', entry.name);
        name.href = fileUrl(entry.path);
        name.title = entry.name;
        name.addEventListener('click', (event) => {
          if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button === 0) {
            event.preventDefault();
            openPreview(entry.path);
          }
        });
        row.appendChild(name);
        row.appendChild(el('span', 'ae-size', formatSize(entry.size)));
        row.appendChild(el('span', 'ae-date', formatDate(entry.lastModified)));
        const actions = el('span', 'ae-actions');
        actions.append(
          iconButton('preview', label('Preview'), () => openPreview(entry.path)),
          iconLink('download', label('Download'), fileUrl(entry.path), true),
          copyLinkButton(fileUrl(entry.path), label('ToastLinkCopied', 'Link copied to clipboard')),
          iconLink('fingerprint', label('Fingerprint', 'See fingerprints'), fingerprintUrl(entry.path), false));
        row.appendChild(actions);
      }
      li.appendChild(row);
      return li;
    }

    const rootNode = {
      path: basePath,
      depth: -1,
      li: treeContainer,
      loaded: false,
      expanded: false,
    };

    async function initTree() {
      setStatus(label('Loading'));
      await loadChildren(rootNode);
      if (rootNode.loaded) {
        setStatus('');
        rootNode.childrenList.classList.add('ae-list--root');
        rootNode.childrenList.setAttribute('role', 'tree');
        initExtensionPills();
        await handleHashNavigation();
      }
    }

    async function expandAll() {
      let budget = EXPAND_ALL_BUDGET;
      async function walk(node) {
        if (budget <= 0) {
          return;
        }
        await setExpanded(node, true);
        if (!node.childrenList) {
          return;
        }
        for (const child of Array.from(node.childrenList.children)) {
          const childNode = nodesByPath.get(child.dataset.path);
          budget--;
          if (childNode && childNode.entry.directory) {
            await walk(childNode);
          }
        }
      }
      expandAllButton.disabled = true;
      try {
        for (const node of Array.from(nodesByPath.values())) {
          if (node.depth === 0 && node.entry.directory) {
            await walk(node);
          }
        }
      } finally {
        expandAllButton.disabled = false;
      }
    }

    async function collapseAll() {
      for (const node of Array.from(nodesByPath.values())) {
        if (node.entry.directory && node.expanded) {
          await setExpanded(node, false);
        }
      }
    }

    async function revealPath(path) {
      searchInput.value = '';
      setExtensionFilter(null);
      showResults(null);
      const relative = basePath === '' ? path : path.substring(basePath.length + 1);
      const segments = relative.split('/');
      let current = basePath;
      for (let i = 0; i < segments.length - 1; i++) {
        current = current === '' ? segments[i] : current + '/' + segments[i];
        const node = nodesByPath.get(current);
        if (!node) {
          return;
        }
        await setExpanded(node, true);
      }
      const target = nodesByPath.get(path);
      if (target) {
        const row = target.li.firstElementChild;
        row.scrollIntoView({ block: 'center' });
        row.classList.add('ae-row--flash');
        window.setTimeout(() => row.classList.remove('ae-row--flash'), 1600);
      }
    }

    let isNavigatingHash = false;
    async function handleHashNavigation() {
      if (isNavigatingHash) {
        return;
      }
      const rawHash = window.location.hash;
      if (!rawHash || rawHash.length <= 1) {
        if (activePreviewPath) {
          closePreview();
        }
        return;
      }
      isNavigatingHash = true;
      try {
        const subPath = decodeURIComponent(rawHash.substring(1)).replace(/^\/+/, '').replace(/\/+$/, '');
        if (!subPath) {
          return;
        }

        let fullPath = subPath;
        if (basePath && !subPath.startsWith(basePath + '/')) {
          fullPath = (basePath === '' ? '' : basePath + '/') + subPath;
        }

        await revealPath(fullPath);
        const targetNode = nodesByPath.get(fullPath);
        if (targetNode && targetNode.entry && targetNode.entry.directory) {
          await setExpanded(targetNode, true);
        } else {
          await openPreview(fullPath);
        }
      } catch (e) {
        // Ignore invalid target hash
      } finally {
        isNavigatingHash = false;
      }
    }

    window.addEventListener('hashchange', handleHashNavigation);

    // ------------------------------------------------------------------ search

    let indexPromise = null;
    let indexTruncated = false;

    function loadIndex() {
      if (!indexPromise) {
        indexPromise = api('searchIndex').then((data) => {
          indexTruncated = data.truncated;
          const prefix = basePath === '' ? '' : basePath + '/';
          return data.files.filter((f) => f.startsWith(prefix));
        });
        indexPromise.catch(() => {
          indexPromise = null;
        });
      }
      return indexPromise;
    }

    function escapeRegExp(s) {
      return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function highlight(text, terms) {
      const fragment = document.createDocumentFragment();
      if (terms.length === 0) {
        fragment.appendChild(document.createTextNode(text));
        return fragment;
      }
      const regex = new RegExp('(' + terms.map(escapeRegExp).join('|') + ')', 'ig');
      text.split(regex).forEach((part, index) => {
        if (part === '') {
          return;
        }
        if (index % 2 === 1) {
          fragment.appendChild(el('mark', '', part));
        } else {
          fragment.appendChild(document.createTextNode(part));
        }
      });
      return fragment;
    }

    function showResults(content) {
      resultsContainer.hidden = content === null;
      treeContainer.hidden = content !== null;
      expandAllButton.disabled = content !== null;
      collapseAllButton.disabled = content !== null;
      resultsContainer.replaceChildren();
      if (content) {
        resultsContainer.appendChild(content);
        applyJenkinsBehaviour(resultsContainer);
      }
    }

    function getExtension(path) {
      const name = baseName(path).toLowerCase();
      if (name.endsWith('.tar.gz')) return '.tar.gz';
      if (name.endsWith('.tar.bz2')) return '.tar.bz2';
      if (name.endsWith('.tar.xz')) return '.tar.xz';
      const dotIdx = name.lastIndexOf('.');
      if (dotIdx > 0) {
        return name.substring(dotIdx);
      }
      return null;
    }

    let activeExtensionFilter = null;

    function setExtensionFilter(ext) {
      activeExtensionFilter = ext;
      pillsBar.querySelectorAll('.ae-pill').forEach((p) => {
        const isTarget = ext === null ? !p.dataset.ext : p.dataset.ext === ext;
        p.classList.toggle('jenkins-button--primary', isTarget);
        p.setAttribute('aria-pressed', isTarget ? 'true' : 'false');
      });
      runSearch();
    }

    async function initExtensionPills() {
      try {
        const files = await loadIndex();
        if (!files || files.length === 0) {
          return;
        }

        const extCounts = new Map();
        files.forEach((f) => {
          const ext = getExtension(f);
          if (ext) {
            extCounts.set(ext, (extCounts.get(ext) || 0) + 1);
          }
        });

        if (extCounts.size === 0) {
          return;
        }

        const sorted = Array.from(extCounts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
        pillsBar.replaceChildren();

        const allPill = el('button', 'jenkins-button jenkins-button--primary ae-pill');
        allPill.type = 'button';
        allPill.setAttribute('aria-pressed', 'true');
        const allLabel = el('span', 'ae-pill-label', label('All', 'All'));
        const allBadge = el('span', 'ae-pill-count', String(files.length));
        allPill.append(allLabel, allBadge);
        allPill.addEventListener('click', () => setExtensionFilter(null));
        pillsBar.appendChild(allPill);

        sorted.slice(0, 18).forEach(([ext, count]) => {
          const pill = el('button', 'jenkins-button ae-pill');
          pill.type = 'button';
          pill.dataset.ext = ext;
          pill.setAttribute('aria-pressed', 'false');
          const extLabel = el('span', 'ae-pill-label', ext);
          const countBadge = el('span', 'ae-pill-count', String(count));
          pill.append(extLabel, countBadge);
          pill.addEventListener('click', () => {
            if (activeExtensionFilter === ext) {
              setExtensionFilter(null);
            } else {
              setExtensionFilter(ext);
            }
          });
          pillsBar.appendChild(pill);
        });

        pillsBar.hidden = false;
      } catch (e) {
        // ignore
      }
    }

    let searchSequence = 0;
    async function runSearch() {
      const query = searchInput.value.trim().toLowerCase();
      const extFilter = activeExtensionFilter;
      const sequence = ++searchSequence;

      if (query === '' && extFilter === null) {
        showResults(null);
        setStatus('');
        return;
      }

      let files;
      try {
        files = await loadIndex();
      } catch (e) {
        setStatus(label('Error') + ' (' + e.message + ')', true);
        return;
      }
      if (sequence !== searchSequence) {
        return;
      }

      const terms = query.split(/\s+/).filter(Boolean);
      const matches = files.filter((f) => {
        const lower = f.toLowerCase();
        const matchesTerms = terms.length === 0 || terms.every((t) => lower.includes(t));
        const matchesExt = !extFilter || getExtension(f) === extFilter;
        return matchesTerms && matchesExt;
      });

      matches.sort((a, b) => {
        if (terms.length > 0) {
          const inNameA = terms.every((t) => baseName(a).toLowerCase().includes(t)) ? 0 : 1;
          const inNameB = terms.every((t) => baseName(b).toLowerCase().includes(t)) ? 0 : 1;
          if (inNameA !== inNameB) return inNameA - inNameB;
        }
        return a.length - b.length || a.localeCompare(b);
      });

      const list = el('ul', 'ae-list ae-list--results');
      matches.slice(0, MAX_SEARCH_RESULTS).forEach((path) => {
        const li = el('li', 'ae-node');
        li.style.setProperty('--depth', '0');
        const row = el('div', 'ae-row');
        row.tabIndex = 0;
        row.dataset.path = path;
        row.appendChild(svgIcon('file'));
        const link = el('a', 'ae-name');
        link.href = fileUrl(path);
        link.title = path;
        link.appendChild(highlight(path.substring(basePath === '' ? 0 : basePath.length + 1), terms));
        link.addEventListener('click', (event) => {
          if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button === 0) {
            event.preventDefault();
            openPreview(path);
          }
        });
        row.appendChild(link);
        row.appendChild(el('span', 'ae-size'));
        row.appendChild(el('span', 'ae-date'));
        const actions = el('span', 'ae-actions');
        actions.append(
          iconButton('preview', label('Preview'), () => openPreview(path)),
          iconButton('reveal', label('Reveal'), () => revealPath(path)),
          iconLink('download', label('Download'), fileUrl(path), true),
          copyLinkButton(fileUrl(path), label('ToastLinkCopied', 'Link copied to clipboard')),
          iconLink('fingerprint', label('Fingerprint', 'See fingerprints'), fingerprintUrl(path), false));
        row.appendChild(actions);
        li.appendChild(row);
        list.appendChild(li);
      });

      let filterSuffix = extFilter ? ' (' + extFilter + ')' : '';
      let summary = matches.length + ' ' + label('Matches') + filterSuffix;
      if (matches.length > MAX_SEARCH_RESULTS) {
        summary += ' (' + MAX_SEARCH_RESULTS + ')';
      }
      if (indexTruncated) {
        summary += ' - ' + label('Truncated');
      }
      setStatus(matches.length === 0 ? label('NoMatches') : summary);
      showResults(matches.length === 0 ? document.createDocumentFragment() : list);
    }

    let searchTimer = null;
    searchInput.addEventListener('input', () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(runSearch, 80);
    });

    // --------------------------------------------------------------- shortcuts

    function visibleRows() {
      const container = resultsContainer.hidden ? treeContainer : resultsContainer;
      return Array.from(container.querySelectorAll('.ae-row')).filter((r) => r.offsetParent !== null);
    }

    listColumn.addEventListener('keydown', async (event) => {
      const row = event.target.closest('.ae-row');
      if (!row) {
        return;
      }
      const rows = visibleRows();
      const idx = rows.indexOf(row);
      const node = nodesByPath.get(row.dataset.path);

      if (event.key === 'ArrowDown' && idx >= 0 && idx < rows.length - 1) {
        event.preventDefault();
        rows[idx + 1].focus();
      } else if (event.key === 'ArrowUp' && idx > 0) {
        event.preventDefault();
        rows[idx - 1].focus();
      } else if (event.key === 'ArrowRight' && node && node.entry.directory) {
        event.preventDefault();
        if (!node.expanded) {
          await setExpanded(node, true);
        } else {
          const next = visibleRows()[idx + 1];
          if (next) {
            next.focus();
          }
        }
      } else if (event.key === 'ArrowLeft' && node) {
        event.preventDefault();
        if (node.entry.directory && node.expanded) {
          await setExpanded(node, false);
        } else {
          const parentPath = node.path.substring(0, node.path.lastIndexOf('/'));
          const parentNode = nodesByPath.get(parentPath);
          if (parentNode && parentNode.li.firstElementChild) {
            parentNode.li.firstElementChild.focus();
          }
        }
      } else if (event.key === 'Enter' && event.target === row) {
        event.preventDefault();
        if (node && node.entry.directory) {
          await setExpanded(node, !node.expanded);
        } else if (row.dataset.path) {
          await openPreview(row.dataset.path);
        }
      }
    });

    expandAllButton.addEventListener('click', expandAll);
    collapseAllButton.addEventListener('click', collapseAll);

    document.addEventListener('keydown', (event) => {
      const typing = /^(input|textarea|select)$/i.test(event.target.tagName) || event.target.isContentEditable;

      if (event.key === 'Escape') {
        if (isModalOpen()) {
          return;
        }
        if (event.target === searchInput) {
          if (searchInput.value !== '' || activeExtensionFilter !== null) {
            event.preventDefault();
            searchInput.value = '';
            setExtensionFilter(null);
          }
          searchInput.blur();
          return;
        }
        if (activePreviewPath !== null) {
          event.preventDefault();
          closePreview();
          return;
        }
        if (activeExtensionFilter !== null || searchInput.value !== '') {
          event.preventDefault();
          searchInput.value = '';
          setExtensionFilter(null);
          return;
        }
        return;
      }

      if (typing || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      if (event.key === '?') {
        event.preventDefault();
        toggleShortcutsModal();
        return;
      }

      if (isModalOpen()) {
        return;
      }

      if (event.key === '/') {
        event.preventDefault();
        searchInput.focus();
        searchInput.select();
        return;
      }

      if (event.key === 'j' || event.key === 'k') {
        const rows = visibleRows();
        if (rows.length === 0) {
          return;
        }
        const currentFocusedRow = document.activeElement ? document.activeElement.closest('.ae-row') : null;
        let idx = currentFocusedRow ? rows.indexOf(currentFocusedRow) : -1;
        if (idx === -1) {
          const selected = root.querySelector('.ae-row--selected');
          if (selected) {
            idx = rows.indexOf(selected);
          }
        }
        if (event.key === 'j') {
          const nextIdx = idx === -1 ? 0 : Math.min(idx + 1, rows.length - 1);
          rows[nextIdx].focus();
        } else {
          const prevIdx = idx === -1 ? 0 : Math.max(idx - 1, 0);
          rows[prevIdx].focus();
        }
        event.preventDefault();
        return;
      }

      if (event.key === 'o' || (event.key === 'Enter' && !event.target.closest('.ae-row'))) {
        const focusedRow = document.activeElement ? document.activeElement.closest('.ae-row') : null;
        if (focusedRow) {
          const node = nodesByPath.get(focusedRow.dataset.path);
          if (node && node.entry.directory) {
            event.preventDefault();
            setExpanded(node, !node.expanded);
          } else if (focusedRow.dataset.path) {
            event.preventDefault();
            openPreview(focusedRow.dataset.path);
          }
        }
        return;
      }

      if (event.key === 's') {
        if (activePreview && typeof activePreview.computeChecksum === 'function') {
          event.preventDefault();
          activePreview.computeChecksum();
        }
        return;
      }

      if (event.key === 'c') {
        if (activePreview && typeof activePreview.copyContent === 'function') {
          event.preventDefault();
          activePreview.copyContent();
        }
        return;
      }

      if (event.key === 'l') {
        if (activePreview && typeof activePreview.copyLink === 'function') {
          event.preventDefault();
          activePreview.copyLink();
        } else {
          const focusedRow = document.activeElement ? document.activeElement.closest('.ae-row') : null;
          if (focusedRow && focusedRow.dataset.path) {
            event.preventDefault();
            const copyBtn = focusedRow.querySelector('.ae-iconbutton[aria-label*="link" i], .ae-iconbutton[tooltip*="link" i]');
            if (copyBtn) {
              copyBtn.click();
            }
          }
        }
        return;
      }

      if (event.key === 'd') {
        if (activePreview && typeof activePreview.download === 'function') {
          event.preventDefault();
          activePreview.download();
        } else {
          const focusedRow = document.activeElement ? document.activeElement.closest('.ae-row') : null;
          if (focusedRow && focusedRow.dataset.path) {
            event.preventDefault();
            const dl = focusedRow.querySelector('a[download]');
            if (dl) {
              dl.click();
            }
          }
        }
        return;
      }
    });

    initTree();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
