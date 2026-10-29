/*
 * Artifact Explorer: Progressive enhancement for classic "Last Successful Artifacts"
 * and "Build Artifacts" tables (table.fileList) on Job and Build summary pages.
 */
(function () {
  'use strict';

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
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    // The "external" glyph is the ionicons "open" icon (512 unit grid), same as Jenkins' own external.svg
    svg.setAttribute('viewBox', kind === 'external' ? '0 0 512 512' : '0 0 16 16');
    svg.setAttribute('class', 'ae-sum-icon ae-sum-icon--' + kind);
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(ns, 'path');
    const shapes = {
      folder: 'M1.5 3A1.5 1.5 0 0 1 3 1.5h3l1.5 1.5H13A1.5 1.5 0 0 1 14.5 4.5v8A1.5 1.5 0 0 1 13 14H3a1.5 1.5 0 0 1-1.5-1.5z',
      file: 'M3.5 1.5h6l3 3v10h-9zM9 1.5v3.5h3.5',
      caret: 'M6 3.5l4.5 4.5L6 12.5',
      tree: 'M2 3.5h3v3H2zM7 9.5h3v3H7zM7 3.5h3v3H7zM3.5 6.5v4.5H7M5 5h2',
      flat: 'M2.5 4h11M2.5 8h11M2.5 12h11',
      external: 'M384 224v184a40 40 0 01-40 40H104a40 40 0 01-40-40V168a40 40 0 0140-40h167.48M336 64h112v112M224 288L440 72',
      search: 'M7 2.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM10.5 10.5L14 14',
      fingerprint: 'M8 1.5a6.5 6.5 0 0 0-6.5 6.5c0 2.2.8 4.2 2.1 5.6M8 4a4 4 0 0 1 4 4c0 1.8-.5 3.6-1.4 5M8 6.5a1.5 1.5 0 0 1 1.5 1.5c0 1.5-.4 3-1.2 4.2M5.5 12.5c-.6-1.2-1-2.8-1-4.5a3.5 3.5 0 0 1 3.5-3.5',
      copy: 'M5.5 2.5h7A1.5 1.5 0 0 1 14 4v7a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 4 11V4a1.5 1.5 0 0 1 1.5-1.5zM2.5 5.5v7A1.5 1.5 0 0 0 4 14h7',
      check: 'M3 8.5l3.5 3.5 6.5-7',
      package: 'M8 1.5l6 3.2v6.6L8 14.5 2 11.3V4.7L8 1.5zM2 4.7l6 3.3 6-3.3M8 8v6.5'
    };
    path.setAttribute('d', shapes[kind] || shapes.file);
    if (kind === 'external') {
      path.setAttribute('stroke-width', '32');
    }
    svg.appendChild(path);
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
      iconWrap.appendChild(svgIcon('package'));

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
            Array.from(cell.childNodes).forEach((child) => {
              const cloned = child.cloneNode(true);
              if (cloned.nodeType === Node.ELEMENT_NODE && cloned.tagName === 'A') {
                cloned.classList.add('ae-fp-build-badge', 'model-link');
                buildsWrap.appendChild(cloned);
              } else if (cloned.nodeType === Node.TEXT_NODE) {
                const text = cloned.textContent.replace(/\u00a0/g, ' ').trim();
                if (text) {
                  buildsWrap.appendChild(el('span', 'ae-fp-range-sep', text));
                }
              } else {
                buildsWrap.appendChild(cloned);
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
