(function (window, document) {
  'use strict';

  /**
   * Surface-neutral floating panel mechanics. The host supplies the optional
   * dock geometry/lock adapter; this module owns state normalisation,
   * namespaced persistence, viewport clamping, drag, resize, collapse, and
   * frame application for every Pixflow surface.
   */
  var PANEL_SIZES = {
    sm: { width: 380, height: 560 },
    md: { width: 460, height: 680 },
    lg: { width: 560, height: 760 },
    xl: { width: 680, height: 820 }
  };


  // Presentation-only markers are translated by the mounted Pixflow i18n provider.
  // Never translate action identifiers, site keys, URLs or user-created names.
  var UI_LABEL_KEYS = {
  "Bridge connections": "ui.nativeShell.connections",
  "Connected sites": "ui.nativeShell.connectedSites",
  "Close connections": "ui.nativeShell.closeConnections",
  "Refreshing connections…": "ui.nativeShell.refreshing",
  "Could not refresh connections. Try again.": "ui.nativeShell.refreshFailed",
  "This Bridge is not connected to this site. Reconnect to refresh connections.": "ui.nativeShell.wrongSite",
  "Connected to this site. Multi-site controls are available in the desktop Bridge.": "ui.nativeShell.singleSite",
  "Up to {limit} idle sites stay ready. Others sleep after {minutes} minutes and reconnect when needed.": "ui.nativeShell.idlePolicy",
  "Working": "ui.nativeShell.working",
  "Sleeping": "ui.nativeShell.sleeping",
  "Freeing memory…": "ui.nativeShell.freeing",
  "Open admin ↗": "ui.nativeShell.openAdmin",
  "Open admin in a new tab": "ui.nativeShell.openAdminTab",
  "This site is still working.": "ui.nativeShell.stillWorking",
  "WordPress site": "ui.nativeShell.wordpressSite",
  "This site": "ui.nativeShell.thisSite",
  "Free memory": "ui.nativeShell.freeMemory",
  "Available after this site finishes its work": "ui.nativeShell.afterWork",
  "Reconnect with your conversation and settings retained": "ui.nativeShell.reconnectRetained",
  "Keep this site connected and release its idle processes": "ui.nativeShell.releaseIdle",
  "Connect this site to manage other connections": "ui.nativeShell.manageOthers",
  "Connect to refresh": "ui.nativeShell.connectRefresh",
  "Bridge connected · Site sleeping": "ui.nativeShell.bridgeSleeping",
  "Bridge connected · Connecting this site": "ui.nativeShell.bridgeWaking",
  "Bridge update required": "ui.finalAnnotation.bridgeUpdate",
  "Update": "ui.finalAnnotation.update",
  "Checking Bridge connection": "ui.finalAnnotation.bridgeChecking",
  "Bridge connected": "ui.finalAnnotation.bridgeConnected",
  "Bridge connected to another site": "ui.finalAnnotation.bridgeOtherSite",
  "Bridge disconnected": "ui.finalAnnotation.bridgeDisconnected",
  "Reconnect": "ui.xaiOAuthControl.reconnect",
  "Connected": "connectors.statusConnected",
  "Connecting…": "ui.xaiOAuthControl.connecting",
  "Unavailable": "connectors.unavailable",
  "Connect": "connectors.connect",
  "Close": "common.close",
  "Panel size presets": "ui.sitemapAgentPanel.panelSizePresets",
  "Expand panel": "ui.sitemapAgentPanel.expandPanel",
  "Collapse panel": "ui.sitemapAgentPanel.collapsePanel",
  "Set panel size {value1}": "ui.sitemapAgentPanel.setPanelSize",
  "Freeing…": "ui.nativeShell.freeing"
};
  function setUiLabel(element, kind, text, variables) {
    var value = String(text || '');
    var key = Object.prototype.hasOwnProperty.call(UI_LABEL_KEYS, value) ? UI_LABEL_KEYS[value] : '';
    var marker = 'data-pixflow-i18n-' + kind;
    var serializedVariables = variables ? JSON.stringify(variables) : null;
    // Retain the translated DOM value on unchanged heartbeats and polls.
    if (key && element.getAttribute(marker) === key && element.getAttribute('data-pixflow-i18n-vars') === serializedVariables) return;
    var rendered = value.replace(/\{(\w+)\}/g, function (match, name) { return variables && variables[name] !== undefined ? String(variables[name]) : match; });
    if (kind === 'text') { if (element.textContent !== rendered) element.textContent = rendered; }
    else { var target = kind === 'label' ? 'aria-label' : 'title'; if (element.getAttribute(target) !== rendered) element.setAttribute(target, rendered); }
    if (key) element.setAttribute(marker, key);
    else if (element.hasAttribute(marker)) element.removeAttribute(marker);
    if (variables) element.setAttribute('data-pixflow-i18n-vars', serializedVariables);
    else if (element.hasAttribute('data-pixflow-i18n-vars')) element.removeAttribute('data-pixflow-i18n-vars');
  }

  function clampNumber(value, min, max) {
    var next = Number(value);
    if (!Number.isFinite(next)) return min;
    return Math.max(min, Math.min(max, next));
  }

  function viewport() {
    return {
      width: Math.max(320, window.innerWidth || 1280),
      height: Math.max(320, window.innerHeight || 800)
    };
  }

  function panelLimits() {
    var view = viewport();
    var maxWidth = Math.min(760, view.width - 24);
    var maxHeight = Math.min(900, view.height - 64);
    return {
      minWidth: Math.min(PANEL_SIZES.sm.width, maxWidth),
      minHeight: Math.min(PANEL_SIZES.sm.height, maxHeight),
      maxWidth: maxWidth,
      maxHeight: maxHeight
    };
  }

  function panelDimension(value, fallback) {
    return value !== null && value !== '' && Number.isFinite(Number(value)) && Number(value) > 0
      ? Number(value) : fallback;
  }

  function normalizePanelState(panel, options) {
    options = options || {};
    var view = viewport();
    var limits = panelLimits();
    var defaultSize = PANEL_SIZES.md;
    var top = typeof options.getFloatTop === 'function' ? options.getFloatTop() : 48;
    limits.maxHeight = Math.min(limits.maxHeight, Math.max(1, view.height - top - 8));
    limits.minHeight = Math.min(limits.minHeight, limits.maxHeight);
    var floatWidth = clampNumber(
      panelDimension(panel && panel.floatWidth, panelDimension(panel && panel.width, defaultSize.width)),
      limits.minWidth,
      limits.maxWidth
    );
    var floatHeight = clampNumber(
      panelDimension(panel && panel.floatHeight, panelDimension(panel && panel.height, defaultSize.height)),
      limits.minHeight,
      limits.maxHeight
    );
    var floatX = Number(panel && panel.floatX);
    var floatY = Number(panel && panel.floatY);
    if (!Number.isFinite(floatX)) floatX = view.width - floatWidth - 18;
    if (!Number.isFinite(floatY)) floatY = 66;
    floatX = clampNumber(floatX, 8, Math.max(8, view.width - floatWidth - 8));
    floatY = clampNumber(floatY, top, Math.max(top, view.height - floatHeight - 8));

    var dock = panel && (panel.dock === 'left' || panel.dock === 'right' || panel.dock === 'float')
      ? panel.dock
      : 'float';
    if ((dock === 'left' || dock === 'right') && typeof options.getDockRect === 'function') {
      var dockWidth = clampNumber(panelDimension(panel && panel.width, defaultSize.width), limits.minWidth, limits.maxWidth);
      var dockRect = options.getDockRect(dock, dockWidth);
      // A host can decline docking when its canvas and native sidebars no longer fit.
      if (dockRect) return {
        x: dockRect.x,
        y: dockRect.y,
        width: dockRect.width,
        height: dockRect.height,
        dock: dock,
        collapsed: Boolean(panel && panel.collapsed),
        loaded: true,
        floatX: floatX,
        floatY: floatY,
        floatWidth: floatWidth,
        floatHeight: floatHeight
      };
      dock = 'float';
      panel = Object.assign({}, panel, { x: floatX, y: floatY, width: floatWidth, height: floatHeight });
    }

    var width = clampNumber(panelDimension(panel && panel.width, defaultSize.width), limits.minWidth, limits.maxWidth);
    var height = clampNumber(panelDimension(panel && panel.height, defaultSize.height), limits.minHeight, limits.maxHeight);
    var x = Number(panel && panel.x);
    var y = Number(panel && panel.y);
    if (!Number.isFinite(x)) x = view.width - width - 18;
    if (!Number.isFinite(y)) y = 66;
    x = clampNumber(x, 8, Math.max(8, view.width - width - 8));
    y = clampNumber(y, top, Math.max(top, view.height - (panel && panel.collapsed ? 74 : height) - 8));

    return {
      x: x,
      y: y,
      width: width,
      height: height,
      dock: dock,
      collapsed: Boolean(panel && panel.collapsed),
      loaded: true,
      floatX: clampNumber(floatX, 8, Math.max(8, view.width - floatWidth - 8)),
      floatY: clampNumber(floatY, top, Math.max(top, view.height - floatHeight - 8)),
      floatWidth: floatWidth,
      floatHeight: floatHeight
    };
  }

  function normalizeBridgeStatus(value) {
    var payload = value && typeof value === 'object' ? value : {};
    var explicitState = String(payload.state || payload.status || '').toLowerCase();
    var checked = payload.checked === true || explicitState !== '';
    var siteMismatch = payload.siteMismatch === true || explicitState === 'mismatch';
    var updateRequired = payload.updateRequired === true || explicitState === 'update';
    var connected = explicitState === 'connected' || explicitState === 'ready' || payload.running === true;
    var reconnecting = explicitState === 'checking' || explicitState === 'switching' || payload.reconnecting === true;

    if (updateRequired) {
      return { state: 'update', label: 'Bridge update required', actionLabel: 'Update' };
    }
    if (reconnecting || !checked) {
      return { state: 'checking', label: 'Checking Bridge connection', actionLabel: '' };
    }
    if (connected && !siteMismatch && !payload.error) {
      return { state: 'connected', label: 'Bridge connected', actionLabel: '' };
    }
    return {
      state: 'disconnected',
      label: siteMismatch ? 'Bridge connected to another site' : 'Bridge disconnected',
      actionLabel: 'Reconnect'
    };
  }

  /**
   * Shared floating-panel bridge chrome. Connection ownership remains with the
   * host heartbeat; this control only renders published state and requests the
   * host's existing site-aware recovery path when the user clicks Reconnect.
   */
  function createBridgeStatusControl(options) {
    options = options || {};
    var control = document.createElement('div');
    control.className = 'pixflow-agent-bridge-status pixflow-design-token-scope';
    control.setAttribute('role', 'status');
    control.setAttribute('aria-live', 'polite');

    var identity = document.createElement('button');
    identity.type = 'button';
    setUiLabel(identity, 'label', 'Bridge connections');
    identity.setAttribute('aria-expanded', 'false');
    identity.setAttribute('aria-haspopup', 'dialog');
    identity.className = 'pixflow-agent-bridge-status__identity';
    var identityLabel = document.createElement('span');
    identityLabel.textContent = 'Bridge';
    identity.appendChild(identityLabel);
    var dot = document.createElement('span');
    dot.className = 'pixflow-agent-bridge-status__dot';
    dot.setAttribute('aria-hidden', 'true');
    identity.appendChild(dot);
    control.appendChild(identity);

    var popout = null;
    var poll = null;
    var loading = false;
    var rows = new Map();
    var notice = null;
    var list = null;
    var latestRuntime = '';
    var actionError = '';
    function config() {
      return window.__PIXFLOW_DESIGN_WORDPRESS__ || window.pixflowDesignWpAdmin || window.pixflowDesignShell || window.pixflowDesignAdminBridge || {};
    }
    async function siteRequest(path, method) {
      var source = config();
      var base = String(source.bridgeBaseUrl || 'http://127.0.0.1:7456').replace(/\/+$/, '');
      var nativeFetch = window.__PIXFLOW_DESIGN_NATIVE_FETCH__ || window.fetch.bind(window);
      var response = await nativeFetch(base + '/api/pixflow/sites' + path, {
        method: method || 'GET', headers: { 'X-Pixflow-Site-Key': String(source.siteHash || ''), Accept: 'application/json' },
        signal: AbortSignal.timeout(method ? 45000 : 5000)
      });
      // A standalone development daemon has health/site identity but no desktop
      // multi-site directory. Verify that identity before showing its one site.
      if (response.status === 404 && !method && !path) {
        var healthResponse = await nativeFetch(base + '/api/health', {
          headers: { 'X-Pixflow-Site-Key': String(source.siteHash || ''), Accept: 'application/json' },
          signal: AbortSignal.timeout(5000)
        });
        if (!healthResponse.ok) throw new Error('Could not refresh connections. Try again.');
        var health = await healthResponse.json();
        if (!health.ok || !source.siteHash || !health.site || health.site.key !== String(source.siteHash)) {
          throw new Error('This Bridge is not connected to this site. Reconnect to refresh connections.');
        }
        return { managementAvailable: false, sites: [{ key: health.site.key, label: health.site.label, url: health.site.url, state: 'ready' }] };
      }
      if (!response.ok) throw new Error('Could not refresh connections. Try again.');
      return response.json();
    }
    function positionPopout() {
      if (!popout) return;
      var rect = identity.getBoundingClientRect();
      var width = Math.min(360, window.innerWidth - 24);
      popout.style.width = width + 'px';
      popout.style.left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.right - width)) + 'px';
      var height = Math.min(popout.scrollHeight, window.innerHeight - 32);
      var top = rect.bottom + 10;
      if (top + height > window.innerHeight - 12) top = Math.max(12, rect.top - height - 10);
      popout.style.top = top + 'px';
    }
    var stateLabels = { ready: 'Connected', working: 'Working', sleeping: 'Sleeping', waking: 'Connecting…', releasing: 'Freeing memory…', unavailable: 'Unavailable' };
    async function refreshSites() {
      if (!popout || loading) return;
      var activePopout = popout;
      loading = true;
      try {
        var result = await siteRequest('');
        if (popout !== activePopout) return;
        setUiLabel(notice, 'text', actionError || (result.managementAvailable === false
          ? 'Connected to this site. Multi-site controls are available in the desktop Bridge.'
          : "Up to {limit} idle sites stay ready. Others sleep after {minutes} minutes and reconnect when needed."), { limit: result.warmIdleLimit, minutes: Math.round(result.idleGraceMs / 60000) });
        var retained = new Set();
        (result.sites || []).forEach(function (site) {
          retained.add(site.key);
          var own = site.key === String(config().siteHash || '');
          if (own) latestRuntime = site.state;
          var row = rows.get(site.key);
          if (!row) {
            var element = document.createElement('div'); element.className = 'pixflow-bridge-sites__site';
            var heading = document.createElement('div'); heading.className = 'pixflow-bridge-sites__heading';
            var name = document.createElement('strong'); heading.appendChild(name);
            var badge = document.createElement('span'); badge.className = 'pixflow-bridge-sites__badge'; heading.appendChild(badge);
            var address = document.createElement('span'); address.className = 'pixflow-bridge-sites__address';
            var actions = document.createElement('div'); actions.className = 'pixflow-bridge-sites__actions';
            var status = document.createElement('span'); status.className = 'pixflow-bridge-sites__state'; actions.appendChild(status);
            var open = document.createElement('a'); setUiLabel(open, 'text', 'Open admin ↗'); setUiLabel(open, 'label', 'Open admin in a new tab'); setUiLabel(open, 'title', 'Open admin in a new tab'); open.target = '_blank'; open.rel = 'noopener noreferrer'; actions.appendChild(open);
            var action = document.createElement('button'); action.type = 'button'; actions.appendChild(action);
            element.appendChild(heading); element.appendChild(address); element.appendChild(actions); list.appendChild(element);
            row = { element: element, name: name, badge: badge, address: address, status: status, open: open, action: action, state: site.state, pending: false };
            rows.set(site.key, row);
            action.addEventListener('click', async function (event) {
              event.preventDefault(); event.stopPropagation();
              if (row.pending) return;
              actionError = '';
              var operation = row.state === 'sleeping' || row.state === 'unavailable' ? 'wake' : 'sleep';
              row.pending = true; action.disabled = true; setUiLabel(action, 'text', operation === 'wake' ? 'Connecting…' : 'Freeing…');
              try {
                var answer = await siteRequest('/' + encodeURIComponent(site.key) + '/' + operation, 'POST');
                if (!answer.ok) throw new Error(answer.reason || 'This site is still working.');
                if (own && operation === 'wake') window.dispatchEvent(new CustomEvent('pixflow-design:bridge-reconnect-request', { detail: { source: 'connections' } }));
              } catch (error) { actionError = error.message; if (notice) setUiLabel(notice, 'text', actionError); }
              finally { row.pending = false; action.disabled = false; await refreshSites(); }
            });
          }
          row.state = site.state;
          row.action.hidden = result.managementAvailable === false;
          if (site.label) { row.name.textContent = site.label; row.name.removeAttribute('data-pixflow-i18n-text'); } else setUiLabel(row.name, 'text', 'WordPress site');
          setUiLabel(row.badge, 'text', own ? 'This site' : ''); row.badge.hidden = !own;
          try { var url = new URL(site.url); setUiLabel(row.address, 'text', url.host + (url.pathname === '/' ? '' : url.pathname)); row.open.hidden = own || !/^https?:$/.test(url.protocol); row.open.href = /^https?:$/.test(url.protocol) ? new URL('wp-admin/', url.origin + url.pathname.replace(/\/?$/, '/')).href : '#'; }
          catch (_) { setUiLabel(row.address, 'text', ''); row.open.hidden = true; }
          row.element.dataset.state = site.state;
          setUiLabel(row.status, 'text', stateLabels[site.state] || 'Unavailable');
          if (!row.pending) {
            setUiLabel(row.action, 'text', site.state === 'sleeping' || site.state === 'unavailable' ? 'Connect' : 'Free memory');
            row.action.disabled = ['working', 'waking', 'releasing'].indexOf(site.state) !== -1;
            setUiLabel(row.action, 'title', row.action.disabled ? 'Available after this site finishes its work' : site.state === 'sleeping' ? 'Reconnect with your conversation and settings retained' : 'Keep this site connected and release its idle processes');
          }
        });
        rows.forEach(function (row, key) {
          if (retained.has(key) && key !== String(config().siteHash || '') && ['sleeping', 'waking', 'releasing'].indexOf(latestRuntime) !== -1) {
            row.action.disabled = true;
            setUiLabel(row.action, 'title', 'Connect this site to manage other connections');
          }
          if (!retained.has(key)) {
            if (latestRuntime === 'sleeping' || latestRuntime === 'waking' || latestRuntime === 'releasing') {
              setUiLabel(row.status, 'text', 'Connect to refresh'); row.action.disabled = true;
              row.element.dataset.state = 'sleeping'; setUiLabel(row.action, 'title', 'Connect this site to manage other connections');
            } else { row.element.remove(); rows.delete(key); }
          }
        });
        render(window.pixflowDesignBridgeStatus || {});
        positionPopout();
      } catch (error) { if (notice) setUiLabel(notice, 'text', error.message); }
      finally { loading = false; }
    }
    function closePopout(returnFocus) {
      if (!popout) return;
      var closing = popout; popout = null; notice = null; list = null; rows.clear();
      clearInterval(poll); poll = null;
      closing.dataset.open = 'false'; closing.inert = true;
      window.setTimeout(function () { closing.remove(); }, 140);
      identity.setAttribute('aria-expanded', 'false');
      if (returnFocus) identity.focus({ preventScroll: true });
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', keydown, true);
      window.removeEventListener('resize', positionPopout);
    }
    function outside(event) { if (popout && !popout.contains(event.target) && !control.contains(event.target)) closePopout(false); }
    function keydown(event) { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closePopout(true); } }
    identity.addEventListener('click', function (event) {
      event.preventDefault(); event.stopPropagation();
      if (popout) { closePopout(true); return; }
      popout = document.createElement('section'); popout.className = 'pixflow-bridge-sites pixflow-design-portal-scope';
      popout.setAttribute('role', 'dialog'); setUiLabel(popout, 'label', 'Bridge connections');
      // Copy the actual panel tokens, including its theme, into the body portal.
      var computed = window.getComputedStyle(control);
      ['--text', '--text-muted', '--border', '--border-strong', '--bg', '--bg-panel', '--bg-elevated', '--bg-subtle', '--composer-surface', '--composer-hover', '--green', '--amber', '--red', '--accent'].forEach(function (token) { popout.style.setProperty(token, computed.getPropertyValue(token)); });
      var header = document.createElement('div'); header.className = 'pixflow-bridge-sites__header';
      var title = document.createElement('strong'); setUiLabel(title, 'text', 'Connected sites'); header.appendChild(title);
      var close = document.createElement('button'); close.type = 'button'; var closeIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); closeIcon.setAttribute('viewBox', '0 0 24 24'); closeIcon.setAttribute('fill', 'none'); closeIcon.setAttribute('stroke', 'currentColor'); closeIcon.setAttribute('stroke-width', '1.8'); closeIcon.setAttribute('stroke-linecap', 'round'); closeIcon.setAttribute('aria-hidden', 'true'); var closePath = document.createElementNS('http://www.w3.org/2000/svg', 'path'); closePath.setAttribute('d', 'M6 6l12 12M18 6 6 18'); closeIcon.appendChild(closePath); close.appendChild(closeIcon); setUiLabel(close, 'label', 'Close connections'); close.addEventListener('click', function () { closePopout(true); }); header.appendChild(close);
      notice = document.createElement('p'); notice.className = 'pixflow-bridge-sites__notice'; notice.setAttribute('role', 'status'); setUiLabel(notice, 'text', 'Refreshing connections…');
      list = document.createElement('div'); list.className = 'pixflow-bridge-sites__list';
      popout.appendChild(header); popout.appendChild(list); popout.appendChild(notice); document.body.appendChild(popout);
      positionPopout(); identity.setAttribute('aria-expanded', 'true');
      window.requestAnimationFrame(function () { if (popout) popout.dataset.open = 'true'; });
      close.focus({ preventScroll: true });
      document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', keydown, true); window.addEventListener('resize', positionPopout);
      refreshSites(); poll = window.setInterval(function () { if (!document.hidden) refreshSites(); }, 4000);
    });

    var reconnect = document.createElement('button');
    reconnect.type = 'button';
    reconnect.className = 'pixflow-agent-bridge-status__reconnect';
    setUiLabel(reconnect, 'text', 'Reconnect');
    reconnect.hidden = true;
    reconnect.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (control.dataset.state === 'checking') return;
      window.dispatchEvent(new CustomEvent('pixflow-design:bridge-reconnect-request', {
        detail: { source: String(options.surface || 'floating-panel') }
      }));
    });
    control.appendChild(reconnect);

    function render(value) {
      var status = normalizeBridgeStatus(value);
      if (status.state === 'connected' && latestRuntime === 'sleeping') { status.label = 'Bridge connected · Site sleeping'; }
      if (status.state === 'connected' && latestRuntime === 'waking') { status.label = 'Bridge connected · Connecting this site'; }
      var identityText = latestRuntime === 'waking' ? 'Connecting…' : 'Bridge';
      setUiLabel(identityLabel, 'text', identityText);
      if (control.dataset.runtimeState !== latestRuntime) control.dataset.runtimeState = latestRuntime;
      if (control.dataset.state === status.state && control.getAttribute('data-pixflow-i18n-label') === UI_LABEL_KEYS[status.label]) return;
      control.dataset.state = status.state;
      setUiLabel(control, 'label', status.label);
      setUiLabel(control, 'title', status.label);
      reconnect.hidden = !status.actionLabel && !options.showReconnect;
      reconnect.disabled = status.state === 'checking';
      setUiLabel(reconnect, 'text', status.actionLabel || 'Reconnect');
    }

    function onStatus(event) {
      render(event && event.detail ? event.detail : {});
    }

    function onRuntimeState(event) {
      latestRuntime = String(event && event.detail && event.detail.state || '');
      render(window.pixflowDesignBridgeStatus || {});
    }

    // Keep one mounted control across execution-mode changes, preserving status.
    function onExecutionMode(event) {
      if (!options.followExecutionMode) return;
      var mode = event && event.detail && event.detail.mode;
      if (mode !== 'api' && mode !== 'daemon') return;
      control.hidden = mode === 'api';
      control.style.display = control.hidden ? 'none' : '';
      if (control.hidden) closePopout(false);
    }
    onExecutionMode({ detail: { mode: options.executionMode } });
    window.addEventListener('pixflow-design:app-config-changed', onExecutionMode);
    window.addEventListener('open-design:app-config-changed', onExecutionMode);
    window.addEventListener('pixflow-design:bridge-status', onStatus);
    window.addEventListener('pixflow-design:bridge-runtime-state', onRuntimeState);
    render(options.initialStatus || window.pixflowDesignBridgeStatus || {});
    control.destroy = function () {
      closePopout(false);
      window.removeEventListener('pixflow-design:app-config-changed', onExecutionMode);
      window.removeEventListener('open-design:app-config-changed', onExecutionMode);
      window.removeEventListener('pixflow-design:bridge-status', onStatus);
      window.removeEventListener('pixflow-design:bridge-runtime-state', onRuntimeState);
    };
    return control;
  }

  function createPanelController(options) {
    options = options || {};
    var storageKey = String(options.storageKey || 'pixflowDesign.panel.v1');
    var shellSelector = String(options.shellSelector || '#pixflow-agent-shell');
    var getState = typeof options.getState === 'function' ? options.getState : function () { return {}; };
    var setState = typeof options.setState === 'function' ? options.setState : function () {};
    var onRender = typeof options.onRender === 'function' ? options.onRender : function () {};
    var isOpen = typeof options.isOpen === 'function' ? options.isOpen : function () { return true; };
    var dockOptions = {
      getDockRect: options.getDockRect,
      getFloatTop: options.getFloatTop,
    };
    var remountObserver = null;
    var remountObserverQueued = false;
    var resizeListenerBound = false;

    function current() {
      return normalizePanelState(getState(), dockOptions);
    }

    function load() {
      var panel = getState();
      if (panel && panel.loaded) {
        panel = normalizePanelState(panel, dockOptions);
        setState(panel);
        return panel;
      }
      var saved = null;
      try {
        saved = JSON.parse(window.localStorage.getItem(storageKey) || 'null');
      } catch (error) {
        saved = null;
      }
      panel = normalizePanelState(saved || panel, dockOptions);
      setState(panel);
      return panel;
    }

    function save(panel) {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify({
          x: panel.x,
          y: panel.y,
          width: panel.width,
          height: panel.height,
          floatX: panel.floatX,
          floatY: panel.floatY,
          floatWidth: panel.floatWidth,
          floatHeight: panel.floatHeight,
          dock: panel.dock,
          collapsed: panel.collapsed,
          open: Boolean(isOpen())
        }));
      } catch (error) {
        // Locked-down/private browsing storage is non-fatal.
      }
    }

    function getSavedOpenState() {
      try {
        var saved = JSON.parse(window.localStorage.getItem(storageKey) || 'null');
        return Boolean(saved && saved.open === true);
      } catch (error) {
        return false;
      }
    }

    function scheduleDockRefresh() {
      if (remountObserverQueued) return;
      remountObserverQueued = true;
      window.requestAnimationFrame(function () {
        remountObserverQueued = false;
        if (!isOpen() || !findShell()) return;
        var panel = current();
        if (panel.dock !== 'left' && panel.dock !== 'right') return;
        if (typeof options.onDockRefresh === 'function') options.onDockRefresh(panel);
        applyFrame();
      });
    }

    function ensureRemountObserver() {
      if (remountObserver || typeof MutationObserver === 'undefined') return;
      remountObserver = new MutationObserver(scheduleDockRefresh);
      remountObserver.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true
      });
      if (!resizeListenerBound) {
        resizeListenerBound = true;
        window.addEventListener('resize', scheduleDockRefresh, { passive: true });
      }
    }

    function findShell() {
      return document.querySelector(shellSelector);
    }

    function applyFrame(shell) {
      var target = shell || findShell();
      var panel = load();
      if (!target) return panel;
      target.style.left = panel.x + 'px';
      target.style.top = panel.y + 'px';
      target.style.right = 'auto';
      target.style.width = panel.width + 'px';
      target.style.height = panel.collapsed ? 'auto' : panel.height + 'px';
      var limits = panelLimits();
      target.style.minWidth = panel.dock === 'float' ? limits.minWidth + 'px' : '0px';
      target.style.minHeight = panel.collapsed || panel.dock !== 'float' ? '0px' : limits.minHeight + 'px';
      target.dataset.dock = panel.dock;
      target.dataset.collapsed = panel.collapsed ? 'true' : 'false';
      if (isOpen()) {
        if (typeof options.onDockApply === 'function') options.onDockApply(panel);
      } else if (typeof options.onDockRelease === 'function') {
        options.onDockRelease();
      }
      if (isOpen() && (panel.dock === 'left' || panel.dock === 'right')) ensureRemountObserver();
      return panel;
    }

    function update(patch) {
      var next = normalizePanelState(Object.assign({}, getState(), patch || {}), dockOptions);
      if (next.dock === 'float') {
        next.floatX = next.x;
        next.floatY = next.y;
        next.floatWidth = next.width;
        next.floatHeight = next.height;
      }
      setState(next);
      save(next);
      applyFrame();
      return next;
    }

    function setSize(sizeKey) {
      var size = PANEL_SIZES[sizeKey] || PANEL_SIZES.md;
      var panel = current();
      return update({
        width: size.width,
        height: size.height,
        floatWidth: panel.dock === 'float' ? size.width : panel.floatWidth,
        floatHeight: panel.dock === 'float' ? size.height : panel.floatHeight,
        dock: panel.dock === 'float' ? 'float' : panel.dock
      });
    }

    function dock(side) {
      if (side !== 'left' && side !== 'right') return current();
      if (typeof options.onDockHint === 'function') options.onDockHint(side);
      window.setTimeout(function () {
        if (typeof options.onDockHint === 'function') options.onDockHint('');
      }, 420);
      var panel = current();
      var rect = typeof options.getDockRect === 'function'
        ? options.getDockRect(side, panel.width)
        : { x: panel.x, y: panel.y, width: panel.width, height: panel.height };
      return update(Object.assign({
        dock: side,
        floatX: panel.dock === 'float' ? panel.x : panel.floatX,
        floatY: panel.dock === 'float' ? panel.y : panel.floatY,
        floatWidth: panel.dock === 'float' ? panel.width : panel.floatWidth,
        floatHeight: panel.dock === 'float' ? panel.height : panel.floatHeight
      }, rect));
    }

    function floatPanel() {
      var panel = current();
      var view = viewport();
      var size = PANEL_SIZES.md;
      var width = panel.floatWidth && panel.floatWidth < view.width - 24 ? panel.floatWidth : size.width;
      var height = panel.floatHeight && panel.floatHeight < view.height - 64 ? panel.floatHeight : size.height;
      var top = typeof options.getFloatTop === 'function' ? options.getFloatTop() : 48;
      return update({
        dock: 'float',
        width: width,
        height: height,
        x: clampNumber(panel.floatX || view.width - width - 22, 8, Math.max(8, view.width - width - 8)),
        y: clampNumber(panel.floatY || 66, top, Math.max(top, view.height - height - 8))
      });
    }

    function refreshDockGeometry() {
      // Inspect the rendered state before normalization can demote an unsafe
      // dock to floating; that transition must still release the host layout.
      var panel = getState() || {};
      if (panel.dock !== 'left' && panel.dock !== 'right') return panel;
      var next = normalizePanelState(panel, dockOptions);
      setState(next);
      save(next);
      applyFrame();
      return next;
    }

    function toggleCollapse() {
      update({ collapsed: !current().collapsed });
      onRender();
    }

    function bindDrag(header) {
      header.addEventListener('pointerdown', function (event) {
        if (event.button !== 0 || event.target.closest('button, input, textarea, select, a')) return;
        event.preventDefault();
        var startX = event.clientX;
        var startY = event.clientY;
        var initial = load();
        var pendingDock = '';
          var moved = false;
        document.body.classList.add(String(options.movingClass || 'pixflow-agent-panel-moving'));
        if (typeof options.onDockRelease === 'function') options.onDockRelease();
        header.setPointerCapture(event.pointerId);
        function onMove(moveEvent) {
            if (!moved && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < 4) return;
            moved = true;
            var candidate = update({
            x: initial.x + (moveEvent.clientX - startX),
            y: initial.y + (moveEvent.clientY - startY),
              width: initial.dock === 'float' ? initial.width : initial.floatWidth || initial.width,
              height: initial.dock === 'float' ? initial.height : initial.floatHeight || PANEL_SIZES.md.height,
            dock: 'float'
          });
            pendingDock = typeof options.inferDockSide === 'function'
              ? options.inferDockSide(moveEvent.clientX, moveEvent.clientY, candidate)
              : '';
            if (typeof options.onDockHint === 'function') options.onDockHint(pendingDock);
        }
        function onUp(upEvent) {
          header.releasePointerCapture(upEvent.pointerId);
          header.removeEventListener('pointermove', onMove);
          header.removeEventListener('pointerup', onUp);
          header.removeEventListener('pointercancel', onUp);
          document.body.classList.remove(String(options.movingClass || 'pixflow-agent-panel-moving'));
          if (pendingDock) dock(pendingDock);
          else {
            if (typeof options.onDockHint === 'function') options.onDockHint('');
            applyFrame();
          }
        }
        header.addEventListener('pointermove', onMove);
        header.addEventListener('pointerup', onUp);
        header.addEventListener('pointercancel', onUp);
      });
    }

    function bindResize(handle) {
      handle.addEventListener('pointerdown', function (event) {
        if (event.button !== 0) return;
        event.preventDefault();
        var startX = event.clientX;
        var startY = event.clientY;
        var initial = load();
        document.body.classList.add(String(options.movingClass || 'pixflow-agent-panel-moving'));
        if (typeof options.onDockRelease === 'function') options.onDockRelease();
        handle.setPointerCapture(event.pointerId);
        function onMove(moveEvent) {
          update({
            width: initial.width + (moveEvent.clientX - startX),
            height: initial.height + (moveEvent.clientY - startY),
            dock: 'float',
            collapsed: false
          });
        }
        function onUp(upEvent) {
          handle.releasePointerCapture(upEvent.pointerId);
          handle.removeEventListener('pointermove', onMove);
          handle.removeEventListener('pointerup', onUp);
          handle.removeEventListener('pointercancel', onUp);
          document.body.classList.remove(String(options.movingClass || 'pixflow-agent-panel-moving'));
        }
        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', onUp);
        handle.addEventListener('pointercancel', onUp);
      });
    }

    function releaseDockLocks() {
      if (remountObserver) {
        remountObserver.disconnect();
        remountObserver = null;
      }
      if (typeof options.onDockHint === 'function') options.onDockHint('');
      if (typeof options.onDockRelease === 'function') options.onDockRelease();
    }

    return {
      getState: current,
      load: load,
      getSavedOpenState: getSavedOpenState,
      persistOpenState: function () { save(load()); },
      applyFrame: applyFrame,
      update: update,
      setSize: setSize,
      dock: dock,
      floatPanel: floatPanel,
      toggleCollapse: toggleCollapse,
      bindDrag: bindDrag,
      bindResize: bindResize,
      releaseDockLocks: releaseDockLocks,
      refreshDockGeometry: refreshDockGeometry,
      normalizeState: function (value) { return normalizePanelState(value, dockOptions); }
    };
  }

  window.PixflowDesignFloatingPanel = Object.assign({}, window.PixflowDesignFloatingPanel || {}, {
    setUiLabel: setUiLabel,
    PANEL_SIZES: PANEL_SIZES,
    clampNumber: clampNumber,
    normalizePanelState: normalizePanelState,
    createPanelController: createPanelController,
    createBridgeStatusControl: createBridgeStatusControl
  });
})(window, document);
