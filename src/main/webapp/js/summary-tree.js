/*
 * Artifact Explorer: Progressive enhancement for classic "Last Successful Artifacts"
 * and "Build Artifacts" tables (table.fileList) on Job and Build summary pages.
 */
(function () {
  'use strict';

  const SVGS = {
    folder:
      '<svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512"><path d="M440 432H72a40 40 0 01-40-40V120a40 40 0 0140-40h75.89a40 40 0 0122.19 6.72l27.84 18.56a40 40 0 0022.19 6.72H440a40 40 0 0140 40v240a40 40 0 01-40 40zM32 192h448" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"/></svg>',
    file:
      '<svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512"><path d="M416 221.25V416a48 48 0 01-48 48H144a48 48 0 01-48-48V96a48 48 0 0148-48h98.75a32 32 0 0122.62 9.37l141.26 141.26a32 32 0 019.37 22.62z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="32"/><path d="M256 56v120a32 32 0 0032 32h120M176 288h160M176 368h160" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"/></svg>',
    caret:
      '<svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="48" d="M184 112l144 144-144 144"/></svg>',
    tree:
      '<svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M160 128h288M160 256h288M160 384h288M64 128h32M96 128v128h32M96 256v128h32"/></svg>',
    flat:
      '<svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M160 144h288M160 256h288M160 368h288"/><circle cx="80" cy="144" r="16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"/><circle cx="80" cy="256" r="16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"/><circle cx="80" cy="368" r="16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"/></svg>',
    external:
      '<svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512"><path d="M384 224v184a40 40 0 01-40 40H104a40 40 0 01-40-40V168a40 40 0 0140-40h167.48M336 64h112v112M224 288L440 72" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"/></svg>',
    fingerprint:
      '<svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512"><path d="M390.42 75.28a10.45 10.45 0 01-5.32-1.44C340.72 50.08 302.35 40 256.35 40c-45.77 0-89.23 11.28-128.76 33.84C122 77 115.11 74.8 111.87 69a12.4 12.4 0 014.63-16.32A281.81 281.81 0 01256.35 16c49.23 0 92.23 11.28 139.39 36.48a12 12 0 014.85 16.08 11.3 11.3 0 01-10.17 6.72zm-330.79 126a11.73 11.73 0 01-6.7-2.16 12.26 12.26 0 01-2.78-16.8c22.89-33.6 52-60 86.69-78.48 72.58-38.84 165.51-39.12 238.32-.24 34.68 18.48 63.8 44.64 86.69 78a12.29 12.29 0 01-2.78 16.8 11.26 11.26 0 01-16.18-2.88c-20.8-30.24-47.15-54-78.36-70.56-66.34-35.28-151.18-35.28-217.29.24-31.44 16.8-57.79 40.8-78.59 71a10 10 0 01-9.02 5.08zM204.1 491a10.66 10.66 0 01-8.09-3.6C175.9 466.48 165 453 149.55 424c-16-29.52-24.27-65.52-24.27-104.16 0-71.28 58.71-129.36 130.84-129.36S387 248.56 387 319.84a11.56 11.56 0 11-23.11 0c0-58.08-48.32-105.36-107.72-105.36S148.4 261.76 148.4 319.84c0 34.56 7.39 66.48 21.49 92.4 14.8 27.6 25 39.36 42.77 58.08a12.67 12.67 0 010 17 12.44 12.44 0 01-8.56 3.68zm165.75-44.4c-27.51 0-51.78-7.2-71.66-21.36a129.1 129.1 0 01-55-105.36 11.57 11.57 0 1123.12 0 104.28 104.28 0 0044.84 85.44c16.41 11.52 35.6 17 58.72 17a147.41 147.41 0 0024-2.4c6.24-1.2 12.25 3.12 13.4 9.84a11.92 11.92 0 01-9.47 13.92 152.28 152.28 0 01-27.95 2.88zM323.38 496a13 13 0 01-3-.48c-36.76-10.56-60.8-24.72-86-50.4-32.37-33.36-50.16-77.76-50.16-125.28 0-38.88 31.9-70.56 71.19-70.56s71.2 31.68 71.2 70.56c0 25.68 21.5 46.56 48.08 46.56s48.08-20.88 48.08-46.56c0-90.48-75.13-163.92-167.59-163.92-65.65 0-125.75 37.92-152.79 96.72-9 19.44-13.64 42.24-13.64 67.2 0 18.72 1.61 48.24 15.48 86.64 2.32 6.24-.69 13.2-6.7 15.36a11.34 11.34 0 01-14.79-7 276.39 276.39 0 01-16.88-95c0-28.8 5.32-55 15.72-77.76 30.75-67 98.94-110.4 173.6-110.4 105.18 0 190.71 84.24 190.71 187.92 0 38.88-31.9 70.56-71.2 70.56s-71.2-31.68-71.2-70.56c.01-25.68-21.49-46.6-48.07-46.6s-48.08 20.88-48.08 46.56c0 41 15.26 79.44 43.23 108.24 22 22.56 43 35 75.59 44.4 6.24 1.68 9.71 8.4 8.09 14.64a11.39 11.39 0 01-10.87 9.16z" fill="currentColor"/></svg>',
    copy:
      '<svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512"><rect x="128" y="128" width="336" height="336" rx="57" ry="57" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="32"/><path d="M383.5 128l.5-24a56.16 56.16 0 00-56-56H112a64.19 64.19 0 00-64 64v216a56.16 56.16 0 0056 56h24M296 216v160M376 296H216" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"/></svg>',
    check:
      '<svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M416 128L192 384l-96-96"/></svg>',
  };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function applyJenkinsBehaviour(container) {
    if (container && window.Behaviour && typeof window.Behaviour.applySubtree === 'function') {
      try {
        window.Behaviour.applySubtree(container, false);
      } catch (e) {
        // ignore if Behaviour is not available
      }
    }
  }

  function svgIcon(kind) {
    const raw = SVGS[kind] || SVGS.file;
    const t = document.createElement('template');
    t.innerHTML = raw.trim();
    const svg = t.content.firstElementChild;
    svg.setAttribute('class', 'ae-sum-icon ae-sum-icon--' + kind);
    svg.setAttribute('aria-hidden', 'true');
    return svg;
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function getExtension(path) {
    const slashIdx = path.lastIndexOf('/');
    const name = (slashIdx >= 0 ? path.substring(slashIdx + 1) : path).toLowerCase();
    if (name.endsWith('.tar.gz')) return '.tar.gz';
    if (name.endsWith('.tar.bz2')) return '.tar.bz2';
    if (name.endsWith('.tar.xz')) return '.tar.xz';
    const dotIdx = name.lastIndexOf('.');
    if (dotIdx > 0) {
      return name.substring(dotIdx);
    }
    return null;
  }

  function highlight(text, query) {
    const frag = document.createDocumentFragment();
    if (!query) {
      frag.appendChild(document.createTextNode(text));
      return frag;
    }
    const regex = new RegExp('(' + escapeRegExp(query) + ')', 'ig');
    text.split(regex).forEach((part, idx) => {
      if (!part) return;
      if (idx % 2 === 1) {
        frag.appendChild(el('mark', 'ae-sum-mark', part));
      } else {
        frag.appendChild(document.createTextNode(part));
      }
    });
    return frag;
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

  function enhanceFileListTable(table) {
    try {
      if (table.dataset.aeEnhanced === 'true') return;
      const fileRows = table.querySelectorAll('tr');
      if (!fileRows || fileRows.length === 0) return;

      // Check if table contains artifact links
      const firstLink = table.querySelector('a[href*="/artifact/"]');
      if (!firstLink) return;

      table.dataset.aeEnhanced = 'true';

      // Determine artifact root URL from the first artifact link
      const rawHref = firstLink.getAttribute('href') || '';
      const artIdx = rawHref.indexOf('/artifact/');
      const artifactRootUrl = artIdx >= 0 ? rawHref.substring(0, artIdx + '/artifact/'.length) : 'artifact/';

      const encodePath = (p) => p.split('/').map(encodeURIComponent).join('/');

      // Parse all rows from classic table.fileList
      const rootNode = { name: '', path: '', children: new Map(), files: [] };
      const allFiles = [];

      fileRows.forEach((tr) => {
        const cells = tr.querySelectorAll('td');
        if (cells.length < 2) return;

        const mainLink = cells[1].querySelector('a[href*="/artifact/"]:not([href*="/*view*/"]):not([href*="/*fingerprint*/"])');
        if (!mainLink) return;

        const href = mainLink.getAttribute('href') || '';
        const idx = href.indexOf('/artifact/');
        if (idx < 0) return;

        const relEncoded = href.substring(idx + '/artifact/'.length);
        if (!relEncoded || relEncoded.includes('/*')) return;

        const segments = relEncoded.split('/').map((s) => {
          try {
            return decodeURIComponent(s);
          } catch (e) {
            return s;
          }
        });

        const viewLink = cells[1].querySelector('a[href*="/*view*/"]');
        const viewHref = viewLink ? viewLink.getAttribute('href') : (href + '/*view*/');

        const sizeCell = tr.querySelector('td.fileSize');
        const sizeText = sizeCell ? sizeCell.textContent.trim() : '';

        let fpHref = null;
        for (let i = 2; i < cells.length; i++) {
          const fpLink = cells[i].querySelector('a[href*="/*fingerprint*/"], a[href*="/fingerprint/"]');
          if (fpLink) {
            fpHref = fpLink.getAttribute('href');
            break;
          }
        }

        // Insert into hierarchical tree
        let curr = rootNode;
        let accPath = '';
        for (let i = 0; i < segments.length - 1; i++) {
          const seg = segments[i];
          accPath = accPath ? accPath + '/' + seg : seg;
          if (!curr.children.has(seg)) {
            curr.children.set(seg, {
              name: seg,
              path: accPath,
              children: new Map(),
              files: []
            });
          }
          curr = curr.children.get(seg);
        }

        const fileName = segments[segments.length - 1];
        const decodedRelPath = segments.join('/');
        const fileObj = {
          name: fileName,
          path: decodedRelPath,
          href: href,
          size: sizeText,
          viewHref: viewHref,
          fpHref: fpHref
        };
        curr.files.push(fileObj);
        allFiles.push(fileObj);
      });

      // Create enhancement UI container
      const wrapper = el('div', 'ae-sum-wrapper');
      const toolbar = el('div', 'ae-sum-toolbar');

      // View toggle buttons (Tree vs Flat)
      const toggleGroup = el('div', 'ae-sum-btn-group');
      const treeBtn = el('button', 'ae-sum-toggle ae-sum-toggle--active', ' Tree');
      treeBtn.type = 'button';
      treeBtn.prepend(svgIcon('tree'));
      const flatBtn = el('button', 'ae-sum-toggle', ' Flat');
      flatBtn.type = 'button';
      flatBtn.prepend(svgIcon('flat'));
      toggleGroup.append(treeBtn, flatBtn);

      // Search filter
      const searchWrap = el('div', 'ae-sum-search-wrap');
      const searchInput = el('input', 'ae-sum-search');
      searchInput.type = 'search';
      searchInput.placeholder = 'Filter artifacts...';
      searchWrap.appendChild(searchInput);

      // Link to full explorer
      const explorerLink = el('a', 'ae-sum-link', 'Full Explorer ');
      explorerLink.href = artifactRootUrl;
      explorerLink.setAttribute('tooltip', 'Open in full Artifact Explorer');
      explorerLink.appendChild(svgIcon('external'));

      toolbar.append(toggleGroup, searchWrap, explorerLink);

      // Extension filter pills bar
      const sumPillsBar = el('div', 'ae-sum-pills');
      let activeSummaryExt = null;

      function setSummaryExt(ext) {
        activeSummaryExt = ext;
        sumPillsBar.querySelectorAll('.ae-sum-pill').forEach((p) => {
          const isTarget = ext === null ? !p.dataset.ext : p.dataset.ext === ext;
          p.classList.toggle('jenkins-button--primary', isTarget);
        });
        applyFilter();
      }

      const extCounts = new Map();
      allFiles.forEach((f) => {
        const ext = getExtension(f.path);
        if (ext) {
          extCounts.set(ext, (extCounts.get(ext) || 0) + 1);
        }
      });

      if (extCounts.size > 1) {
        const sortedExts = Array.from(extCounts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
        const allPill = el('button', 'jenkins-button jenkins-button--primary ae-sum-pill');
        allPill.type = 'button';
        allPill.append(el('span', '', 'All'), el('span', 'ae-sum-pill-count', String(allFiles.length)));
        allPill.addEventListener('click', () => setSummaryExt(null));
        sumPillsBar.appendChild(allPill);

        sortedExts.slice(0, 10).forEach(([ext, count]) => {
          const pill = el('button', 'jenkins-button ae-sum-pill');
          pill.type = 'button';
          pill.dataset.ext = ext;
          pill.append(el('span', '', ext), el('span', 'ae-sum-pill-count', String(count)));
          pill.addEventListener('click', () => {
            if (activeSummaryExt === ext) {
              setSummaryExt(null);
            } else {
              setSummaryExt(ext);
            }
          });
          sumPillsBar.appendChild(pill);
        });
      } else {
        sumPillsBar.hidden = true;
      }

      // Containers for Tree and Flat views
      const treeRootEl = el('div', 'ae-sum-tree');
      const flatRootEl = el('div', 'ae-sum-flat');
      flatRootEl.hidden = true;
      wrapper.append(toolbar, sumPillsBar, treeRootEl, flatRootEl);

      // Render tree function
      function renderTree(filterQuery) {
        treeRootEl.replaceChildren();
        const q = (filterQuery || '').trim().toLowerCase();

        function buildDirUl(dirNode, depth) {
          const ul = el('ul', 'ae-sum-list');
          if (depth > 0) ul.classList.add('ae-sum-list--nested');

          // Render subdirectories
          const sortedDirs = Array.from(dirNode.children.values()).sort((a, b) => a.name.localeCompare(b.name));
          sortedDirs.forEach((subDir) => {
            const matchingCount = countMatches(subDir, q);
            if (q && matchingCount === 0) return;

            const li = el('li', 'ae-sum-node ae-sum-node--dir');
            li.style.setProperty('--depth', depth);

            const row = el('div', 'ae-sum-row ae-sum-row--dir');
            const toggle = el('button', 'ae-sum-caret');
            toggle.type = 'button';
            toggle.appendChild(svgIcon('caret'));

            const folderIcon = svgIcon('folder');
            const nameSpan = el('span', 'ae-sum-name ae-sum-name--dir');
            nameSpan.title = subDir.name;
            nameSpan.appendChild(highlight(subDir.name, q));

            const countBadge = el('span', 'ae-sum-badge', subDir.files.length + subDir.children.size + ' items');

            const actions = el('span', 'ae-sum-actions');
            const zipLink = el('a', 'ae-sum-act-link', 'zip');
            zipLink.href = artifactRootUrl + encodePath(subDir.path) + '/*zip*/' + encodeURIComponent(subDir.name) + '.zip';
            zipLink.setAttribute('tooltip', 'Download ' + subDir.name + ' as .zip');
            zipLink.setAttribute('aria-label', 'Download ' + subDir.name + ' as .zip');
            zipLink.addEventListener('click', (e) => e.stopPropagation());
            actions.appendChild(zipLink);

            row.append(toggle, folderIcon, nameSpan, countBadge, actions);
            li.appendChild(row);

            const childUl = buildDirUl(subDir, depth + 1);
            li.appendChild(childUl);

            // Folders open by default if depth < 2 or if searching
            let isOpen = depth < 2 || (q.length > 0 && matchingCount > 0);
            li.classList.toggle('ae-sum-node--open', isOpen);
            childUl.hidden = !isOpen;

            function toggleDir() {
              isOpen = !isOpen;
              li.classList.toggle('ae-sum-node--open', isOpen);
              childUl.hidden = !isOpen;
            }

            toggle.addEventListener('click', (e) => {
              e.stopPropagation();
              toggleDir();
            });
            row.addEventListener('click', toggleDir);

            ul.appendChild(li);
          });

          // Render files
          const sortedFiles = dirNode.files.slice().sort((a, b) => a.name.localeCompare(b.name));
          sortedFiles.forEach((file) => {
            if (q && !file.path.toLowerCase().includes(q)) return;
            if (activeSummaryExt && getExtension(file.path) !== activeSummaryExt) return;

            const li = el('li', 'ae-sum-node ae-sum-node--file');
            li.style.setProperty('--depth', depth);

            const row = el('div', 'ae-sum-row ae-sum-row--file');
            const spacer = el('span', 'ae-sum-caret ae-sum-caret--spacer');
            const fileIcon = svgIcon('file');

            const link = el('a', 'ae-sum-name ae-sum-name--file');
            link.href = file.href;
            link.title = file.name;
            link.appendChild(highlight(file.name, q));

            const size = el('span', 'ae-sum-size', file.size);

            const actions = el('span', 'ae-sum-actions');
            if (file.viewHref) {
              const vLink = el('a', 'ae-sum-act-link', 'view');
              vLink.href = file.viewHref;
              actions.appendChild(vLink);
            }
            if (file.fpHref) {
              const fpLink = el('a', 'ae-sum-act-link', 'fingerprint');
              fpLink.href = file.fpHref;
              actions.appendChild(fpLink);
            }

            row.append(spacer, fileIcon, link, size, actions);
            li.appendChild(row);
            ul.appendChild(li);
          });

          return ul;
        }

        function countMatches(dirNode, query) {
          let count = dirNode.files.filter((f) => (!query || f.path.toLowerCase().includes(query)) && (!activeSummaryExt || getExtension(f.path) === activeSummaryExt)).length;
          dirNode.children.forEach((c) => {
            count += countMatches(c, query);
          });
          return count;
        }

        const treeDom = buildDirUl(rootNode, 0);
        if (treeDom.children.length === 0) {
          treeRootEl.appendChild(el('div', 'ae-sum-empty', 'No matching artifacts found.'));
        } else {
          treeRootEl.appendChild(treeDom);
          applyJenkinsBehaviour(treeRootEl);
        }
      }

      // Render modern consistent flat view function
      function renderFlat(filterQuery) {
        flatRootEl.replaceChildren();
        const q = (filterQuery || '').trim().toLowerCase();
        const sorted = allFiles.slice().sort((a, b) => a.path.localeCompare(b.path));
        const matches = sorted.filter((f) => (!q || f.path.toLowerCase().includes(q)) && (!activeSummaryExt || getExtension(f.path) === activeSummaryExt));

        if (matches.length === 0) {
          flatRootEl.appendChild(el('div', 'ae-sum-empty', 'No matching artifacts found.'));
          return;
        }

        const ul = el('ul', 'ae-sum-list');
        matches.forEach((file) => {
          const li = el('li', 'ae-sum-node ae-sum-node--file');
          const row = el('div', 'ae-sum-row ae-sum-row--file ae-sum-row--flat');
          const fileIcon = svgIcon('file');

          const link = el('a', 'ae-sum-name ae-sum-name--file');
          link.href = file.href;
          link.title = file.path;
          link.appendChild(highlight(file.path, q));

          const size = el('span', 'ae-sum-size', file.size);

          const actions = el('span', 'ae-sum-actions');
          if (file.viewHref) {
            const vLink = el('a', 'ae-sum-act-link', 'view');
            vLink.href = file.viewHref;
            actions.appendChild(vLink);
          }
          if (file.fpHref) {
            const fpLink = el('a', 'ae-sum-act-link', 'fingerprint');
            fpLink.href = file.fpHref;
            actions.appendChild(fpLink);
          }

          row.append(fileIcon, link, size, actions);
          li.appendChild(row);
          ul.appendChild(li);
        });
        flatRootEl.appendChild(ul);
        applyJenkinsBehaviour(flatRootEl);
      }

      // Toggle view handler
      function setView(mode) {
        if (mode === 'tree') {
          treeBtn.classList.add('ae-sum-toggle--active');
          flatBtn.classList.remove('ae-sum-toggle--active');
          treeRootEl.hidden = false;
          flatRootEl.hidden = true;
          renderTree(searchInput.value);
          try { localStorage.setItem('ae-sum-view-mode', 'tree'); } catch (e) {}
        } else {
          flatBtn.classList.add('ae-sum-toggle--active');
          treeBtn.classList.remove('ae-sum-toggle--active');
          treeRootEl.hidden = true;
          flatRootEl.hidden = false;
          renderFlat(searchInput.value);
          try { localStorage.setItem('ae-sum-view-mode', 'flat'); } catch (e) {}
        }
        table.style.display = 'none';
      }

      treeBtn.addEventListener('click', () => setView('tree'));
      flatBtn.addEventListener('click', () => setView('flat'));

      function applyFilter() {
        if (!treeRootEl.hidden) {
          renderTree(searchInput.value);
        } else {
          renderFlat(searchInput.value);
        }
      }

      let searchTimer = null;
      searchInput.addEventListener('input', () => {
        window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(applyFilter, 80);
      });

      // Insert wrapper right before the table
      table.parentNode.insertBefore(wrapper, table);
      applyJenkinsBehaviour(toolbar);

      // Respect saved preference (default to tree)
      const saved = (function () {
        try { return localStorage.getItem('ae-sum-view-mode'); } catch (e) { return null; }
      })();
      setView(saved === 'flat' ? 'flat' : 'tree');
    } catch (err) {
      console.warn('Artifact Explorer: could not enhance fileList table', err);
    }
  }

  function enhanceFingerprintPage() {
    try {
      const mainPanel = document.getElementById('main-panel');
      if (!mainPanel) return;
      const md5El = mainPanel.querySelector('.md5sum');
      const fpTable = mainPanel.querySelector('table.fingerprint-summary');
      if (!md5El && !fpTable) return;
      if (mainPanel.dataset.aeFpEnhanced === 'true') return;
      mainPanel.dataset.aeFpEnhanced = 'true';

      const h1 = mainPanel.querySelector('h1');
      const fileName = h1 ? h1.textContent.trim() : 'Artifact Fingerprint';

      // Extract MD5
      let md5Hash = '';
      if (md5El) {
        const match = md5El.textContent.match(/([a-fA-F0-9]{32})/);
        if (match) md5Hash = match[1];
      }

      // Extract Introduced info & origin build link (including when provided outside Jenkins)
      let introducedHtml = '';
      let originBuildHref = '';
      const introDiv = md5El ? md5El.nextElementSibling : null;
      if (introDiv && introDiv.tagName === 'DIV') {
        const originLink = introDiv.querySelector('a');
        if (originLink) {
          const href = originLink.getAttribute('href') || '';
          if (/\/\d+\/?$/.test(href)) {
            originBuildHref = href;
          }
        }
        introducedHtml = introDiv.innerHTML.trim();
      }

      // Extract usage entries from table (preserving one row per job and build ranges like #7 - #10)
      const usages = [];
      if (fpTable) {
        fpTable.querySelectorAll('tr').forEach((tr) => {
          const jobHeader = tr.querySelector('.fingerprint-summary-header');
          const jobLink = jobHeader ? jobHeader.querySelector('a') : null;
          const jobName = jobLink ? jobLink.textContent.trim() : (jobHeader ? jobHeader.textContent.trim() : '');
          const jobHref = jobLink ? jobLink.getAttribute('href') : '';

          const buildCells = Array.from(tr.querySelectorAll('td')).filter(
            (td) => !td.classList.contains('fingerprint-summary-header')
          );
          let latestBuildHref = '';
          buildCells.forEach((cell) => {
            cell.querySelectorAll('a').forEach((a) => {
              const href = a.getAttribute('href') || '';
              if (/\/\d+\/?$/.test(href)) {
                latestBuildHref = href;
              }
            });
          });
          if (jobName) {
            usages.push({ jobName, jobHref, buildCells, latestBuildHref });
          }
        });
      }

      // Hide original raw elements cleanly
      if (h1) h1.style.display = 'none';
      if (md5El) md5El.style.display = 'none';
      if (introDiv && introDiv.tagName === 'DIV') introDiv.style.display = 'none';
      const h2 = mainPanel.querySelector('h2');
      if (h2) h2.style.display = 'none';
      const introP = mainPanel.querySelector('p');
      if (introP) introP.style.display = 'none';
      if (fpTable) fpTable.style.display = 'none';

      // Create modern container
      const fpRoot = el('div', 'ae-fp-container');

      // 1. Hero Card
      const heroCard = el('div', 'ae-fp-card ae-fp-hero');
      const heroHeader = el('div', 'ae-fp-hero-header');
      const iconWrap = el('div', 'ae-fp-icon-wrap');
      iconWrap.appendChild(svgIcon('fingerprint'));

      const titleGroup = el('div', 'ae-fp-title-group');
      const title = el('h1', 'ae-fp-title', fileName);
      const subtitle = el('div', 'ae-fp-subtitle', 'Artifact Fingerprint & Provenance');
      titleGroup.append(title, subtitle);
      heroHeader.append(iconWrap, titleGroup);

      // Hash Pill
      const hashRow = el('div', 'ae-fp-hash-row');
      const hashLabel = el('span', 'ae-fp-hash-label', 'MD5 CHECKSUM');
      const hashVal = el('code', 'ae-fp-hash-code', md5Hash || 'N/A');
      const copyBtn = el('button', 'ae-fp-btn', ' Copy');
      copyBtn.type = 'button';
      copyBtn.prepend(svgIcon('copy'));
      copyBtn.addEventListener('click', async () => {
        if (!md5Hash) return;
        const success = await copyTextToClipboard(md5Hash);
        if (success) {
          copyBtn.textContent = ' Copied!';
          copyBtn.prepend(svgIcon('check'));
          notify('MD5 checksum copied to clipboard');
          setTimeout(() => {
            copyBtn.textContent = ' Copy';
            copyBtn.prepend(svgIcon('copy'));
          }, 2000);
        } else {
          notify('Could not copy to clipboard', true);
        }
      });
      hashRow.append(hashLabel, hashVal, copyBtn);

      // Meta details (shown both when introduced by a Jenkins build and when provided outside Jenkins)
      const metaDetails = el('div', 'ae-fp-meta-details');
      if (introducedHtml) {
        const introSpan = el('div', 'ae-fp-meta-item');
        introSpan.innerHTML = introducedHtml;
        introSpan.querySelectorAll('a').forEach((a) => {
          a.classList.add('ae-fp-link', 'model-link');
        });
        metaDetails.appendChild(introSpan);
      }

      // Hero Action Buttons
      const heroActions = el('div', 'ae-fp-actions');
      if (originBuildHref) {
        const explorerBtn = el('a', 'jenkins-button jenkins-button--primary', 'View in Artifact Explorer');
        explorerBtn.href = originBuildHref.endsWith('/') ? originBuildHref + 'artifact/' : originBuildHref + '/artifact/';
        explorerBtn.appendChild(svgIcon('external'));
        heroActions.appendChild(explorerBtn);
      }

      heroCard.append(heroHeader, hashRow, metaDetails, heroActions);

      // 2. Usage Table Card
      const usageCard = el('div', 'ae-fp-card ae-fp-usage-card');
      const usageHeader = el('div', 'ae-fp-card-header');
      const usageTitle = el('h2', 'ae-fp-card-title', 'Usage History & Lineage');
      const usageDesc = el('p', 'ae-fp-card-desc', 'All pipelines and builds recorded using or producing this artifact:');
      usageHeader.append(usageTitle, usageDesc);

      const tableWrap = el('div', 'ae-fp-table-wrap');
      const modernTable = el('table', 'ae-fp-table');
      const thead = el('thead');
      thead.innerHTML = '<tr><th>Pipeline / Job</th><th>Builds</th><th>Action</th></tr>';
      modernTable.appendChild(thead);

      const tbody = el('tbody');
      if (usages.length === 0) {
        const emptyRow = el('tr');
        emptyRow.innerHTML = '<td colspan="3" class="ae-fp-empty">No usage records found.</td>';
        tbody.appendChild(emptyRow);
      } else {
        usages.forEach((u) => {
          const tr = el('tr');
          const tdJob = el('td', 'ae-fp-cell-job');
          const jobLink = el('a', 'ae-fp-link model-link', u.jobName);
          jobLink.href = u.jobHref;
          tdJob.appendChild(jobLink);

          const tdBuild = el('td', 'ae-fp-cell-build');
          const buildsWrap = el('div', 'ae-fp-builds-wrap');
          u.buildCells.forEach((cell) => {
            let currentGroup = null;
            function ensureGroup() {
              if (!currentGroup) {
                currentGroup = el('span', 'ae-fp-range-group');
                buildsWrap.appendChild(currentGroup);
              }
              return currentGroup;
            }

            Array.from(cell.childNodes).forEach((child) => {
              if (child.nodeType === Node.ELEMENT_NODE && child.tagName === 'A') {
                const cloned = child.cloneNode(true);
                cloned.classList.add('ae-fp-build-badge', 'model-link');
                ensureGroup().appendChild(cloned);
              } else if (child.nodeType === Node.TEXT_NODE) {
                const text = child.textContent.replace(/\u00a0/g, ' ').trim();
                if (text === '-') {
                  ensureGroup().appendChild(el('span', 'ae-fp-range-sep', text));
                } else if (text) {
                  currentGroup = null;
                } else {
                  currentGroup = null;
                }
              } else if (child.nodeType === Node.ELEMENT_NODE) {
                const cloned = child.cloneNode(true);
                ensureGroup().appendChild(cloned);
              }
            });
          });
          tdBuild.appendChild(buildsWrap);

          const tdAction = el('td', 'ae-fp-cell-action');
          const baseHref = u.latestBuildHref || (u.jobHref.endsWith('/') ? u.jobHref + 'lastSuccessfulBuild/' : u.jobHref + '/lastSuccessfulBuild/');
          const expLink = el('a', 'ae-fp-btn-link', 'Artifact Explorer');
          expLink.appendChild(svgIcon('external'));
          expLink.href = baseHref.endsWith('/') ? baseHref + 'artifact/' : baseHref + '/artifact/';
          tdAction.appendChild(expLink);

          tr.append(tdJob, tdBuild, tdAction);
          tbody.appendChild(tr);
        });
      }
      modernTable.appendChild(tbody);
      tableWrap.appendChild(modernTable);
      usageCard.append(usageHeader, tableWrap);

      fpRoot.append(heroCard, usageCard);
      mainPanel.prepend(fpRoot);
      applyJenkinsBehaviour(fpRoot);
    } catch (err) {
      console.warn('Artifact Explorer: could not enhance fingerprint page', err);
    }
  }

  function init() {
    document.querySelectorAll('table.fileList').forEach(enhanceFileListTable);
    enhanceFingerprintPage();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
