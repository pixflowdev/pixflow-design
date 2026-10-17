(function (window, document) {
  'use strict';

  function setPanelUiLabel(element, kind, text, variables) {
    window.PixflowDesignFloatingPanel.setUiLabel(element, kind, text, variables);
  }

  var config = window.pixflowDesignWpAdmin || {};
  var shell = null;
  var root = null;
  var controller = null;
  var mountHandle = null;
  var launcher = null;
  // Match the M preset for a first-open Admin panel. Persisted user geometry
  // is loaded by the shared controller and still takes precedence afterward.
  var state = { loaded: false, open: false, x: 0, y: 66, width: 460, height: 680, dock: 'float', collapsed: false };
  var storageKey = String(config.panelStorageKey || 'pixflowDesign.wpAdminAgentPanel.v1')
    + ':' + String(config.siteHash || 'site') + ':' + userKey();

  function userKey() {
    if (config.userId !== undefined && config.userId !== null && String(config.userId).trim()) {
      return String(config.userId);
    }
    var user = config.context && config.context.user && config.context.user.id;
    return String(user || 'user');
  }

  function createPanelSvgIcon(name) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    function append(tag, attrs) {
      var node = document.createElementNS('http://www.w3.org/2000/svg', tag);
      Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
      svg.appendChild(node);
    }
    if (name === 'collapse') append('path', { d: 'M5 12h14' });
    if (name === 'expand') {
      append('path', { d: 'M8 3H3v5' });
      append('path', { d: 'M16 3h5v5' });
      append('path', { d: 'M8 21H3v-5' });
      append('path', { d: 'M16 21h5v-5' });
    }
    if (name === 'close') {
      append('path', { d: 'M18 6L6 18' });
      append('path', { d: 'M6 6l12 12' });
    }
    return svg;
  }

  function isAdminAgentLauncher(node) {
    return node && node.id === 'wp-admin-bar-pixflow-design';
  }

  function ensureShell() {
    if (shell) return shell;
    shell = document.createElement('section');
    shell.id = 'pixflow-wp-admin-agent-shell';
    // Pixflow-owned: the WP Admin surface uses the same floating-panel host
    // contract as the Bricks Agent. Surface policy lives in React; frame
    // geometry, chrome, drag, resize, and collapse stay shared here.
    shell.className = 'pixflow-bricks-agent-shell pixflow-wp-admin-agent-shell';
    shell.setAttribute('aria-label', String(config.panelLabel || 'Pixflow Design WordPress Admin Agent'));
    shell.setAttribute('aria-hidden', 'true');
    var panel = document.createElement('div');
    panel.className = 'pixflow-bricks-agent-panel';
    var header = document.createElement('header');
    header.className = 'pixflow-bricks-agent-panel__head';
    header.setAttribute('data-pixflow-panel-drag-handle', 'true');
    var titleWrap = document.createElement('div');
    titleWrap.className = 'pixflow-bricks-agent-panel__title';
    var mark = document.createElement('span');
    mark.className = 'pixflow-bricks-agent-panel__mark';
    mark.setAttribute('aria-hidden', 'true');
    if (config.iconUrl) {
      var icon = document.createElement('img');
      icon.src = String(config.iconUrl);
      icon.alt = '';
      mark.appendChild(icon);
    } else {
      mark.textContent = 'P';
    }
    titleWrap.appendChild(mark);
    if (
      (!config.appConfig || config.appConfig.mode !== 'api')
      && window.PixflowDesignFloatingPanel
      && typeof window.PixflowDesignFloatingPanel.createBridgeStatusControl === 'function'
    ) {
      titleWrap.appendChild(window.PixflowDesignFloatingPanel.createBridgeStatusControl({
        surface: 'wp-admin-floating-panel'
      }));
    }
    header.appendChild(titleWrap);

    var actions = document.createElement('div');
    actions.className = 'pixflow-bricks-agent-panel__actions';
    var sizes = document.createElement('div');
    sizes.className = 'pixflow-bricks-agent-panel__sizes';
    setPanelUiLabel(sizes, 'label', 'Panel size presets');
    ['sm', 'md', 'lg'].forEach(function (sizeKey) {
      var sizeButton = document.createElement('button');
      sizeButton.type = 'button';
      sizeButton.className = 'pixflow-bricks-agent-panel__icon-button';
      sizeButton.textContent = sizeKey.charAt(0).toUpperCase();
      setPanelUiLabel(sizeButton, 'title', 'Set panel size {value1}', { value1: sizeKey.toUpperCase() });
      setPanelUiLabel(sizeButton, 'label', 'Set panel size {value1}', { value1: sizeKey.toUpperCase() });
      sizeButton.addEventListener('click', function () {
        if (controller) controller.setSize(sizeKey);
        updatePanelChrome();
      });
      sizes.appendChild(sizeButton);
    });
    actions.appendChild(sizes);

    var collapse = document.createElement('button');
    collapse.type = 'button';
    collapse.className = 'pixflow-bricks-agent-panel__icon-button';
    collapse.setAttribute('data-pixflow-wp-admin-collapse', 'true');
    setPanelUiLabel(collapse, 'title', 'Collapse panel');
    setPanelUiLabel(collapse, 'label', 'Collapse panel');
    collapse.appendChild(createPanelSvgIcon('collapse'));
    collapse.addEventListener('click', function () {
      if (controller) controller.toggleCollapse();
      updatePanelChrome();
    });
    actions.appendChild(collapse);

    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'pixflow-bricks-agent-panel__icon-button';
    setPanelUiLabel(close, 'title', 'Close');
    setPanelUiLabel(close, 'label', 'Close');
    close.setAttribute('data-pixflow-wp-admin-close', 'true');
    close.appendChild(createPanelSvgIcon('close'));
    close.addEventListener('click', closePanel);
    actions.appendChild(close);
    header.appendChild(actions);
    panel.appendChild(header);

    var body = document.createElement('div');
    body.className = 'pixflow-bricks-agent-panel__body';
    root = document.createElement('div');
    root.className = 'pixflow-wp-admin-agent-root';
    body.appendChild(root);
    panel.appendChild(body);

    var resize = document.createElement('span');
    resize.className = 'pixflow-bricks-agent-panel__resize';
    resize.setAttribute('data-pixflow-panel-resize', 'true');
    resize.setAttribute('aria-hidden', 'true');
    panel.appendChild(resize);
    shell.appendChild(panel);
    document.body.appendChild(shell);
    updatePanelChrome();
    return shell;
  }

  function updatePanelChrome() {
    if (!shell) return;
    var panel = shell.querySelector('.pixflow-bricks-agent-panel');
    var body = shell.querySelector('.pixflow-bricks-agent-panel__body');
    var collapse = shell.querySelector('[data-pixflow-wp-admin-collapse]');
    var collapsed = Boolean(state.collapsed);
    if (body) body.hidden = collapsed;
    if (collapse) {
      collapse.replaceChildren(createPanelSvgIcon(collapsed ? 'expand' : 'collapse'));
      setPanelUiLabel(collapse, 'title', collapsed ? 'Expand panel' : 'Collapse panel');
      setPanelUiLabel(collapse, 'label', collapsed ? 'Expand panel' : 'Collapse panel');
      collapse.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    }
    if (panel) panel.dataset.collapsed = collapsed ? 'true' : 'false';
  }

  function setLauncherOpen(open) {
    if (!launcher) return;
    launcher.classList.toggle('is-open', open);
    launcher.setAttribute('aria-expanded', open ? 'true' : 'false');
    launcher.dataset.pixflowOpen = open ? 'true' : 'false';
  }

  function readOpenState() {
    try {
      var explicit = window.localStorage.getItem(storageKey + ':open');
      if (explicit === '1' || explicit === '0') return explicit === '1';
      var saved = JSON.parse(window.localStorage.getItem(storageKey) || 'null');
      return Boolean(saved && saved.open === true);
    } catch (_) {
      return false;
    }
  }

  function writeOpenState(open) {
    try {
      window.localStorage.setItem(storageKey + ':open', open ? '1' : '0');
      var saved = JSON.parse(window.localStorage.getItem(storageKey) || '{}');
      saved = saved && typeof saved === 'object' ? saved : {};
      saved.open = Boolean(open);
      window.localStorage.setItem(storageKey, JSON.stringify(saved));
    } catch (_) {
      // Best effort; the current page remains usable if storage is locked.
    }
  }

  function hasUsableContext(value) {
    var screen = value && value.screen && typeof value.screen === 'object' ? value.screen : {};
    return Boolean(String(screen.id || '').trim() || String(screen.base || '').trim());
  }

  function mountReact() {
    if (mountHandle || !root || !window.PixflowDesignApp || typeof window.PixflowDesignApp.mount !== 'function') return;
    mountHandle = window.PixflowDesignApp.mount(root, Object.assign({}, config, {
      surface: 'wp_admin',
    }));
    window.setTimeout(bindPanelHandles, 0);
  }

  function bindPanelHandles() {
    if (!shell || !controller) return;
    var header = shell.querySelector('[data-pixflow-panel-drag-handle]');
    var resize = shell.querySelector('[data-pixflow-panel-resize]');
    if (header && !header.dataset.pixflowDragBound) {
      header.dataset.pixflowDragBound = 'true';
      controller.bindDrag(header);
    }
    if (resize && !resize.dataset.pixflowResizeBound) {
      resize.dataset.pixflowResizeBound = 'true';
      controller.bindResize(resize);
    }
    controller.applyFrame(shell);
    updatePanelChrome();
  }

  function openPanel() {
    ensureShell();
    state.open = true;
    shell.classList.add('is-open');
    shell.setAttribute('aria-hidden', 'false');
    setLauncherOpen(true);
    writeOpenState(true);
    if (!controller) {
      controller = window.PixflowDesignFloatingPanel && window.PixflowDesignFloatingPanel.createPanelController({
        storageKey: storageKey,
        shellSelector: '#pixflow-wp-admin-agent-shell',
        getState: function () { return state; },
        setState: function (next) { state = Object.assign({}, state, next); },
        isOpen: function () { return state.open; },
        getDockRect: function (side, width) {
          var adapter = window.PixflowDesignHostDock;
          return adapter ? adapter.getDockRect(side, width) : { x: state.x, y: state.y, width: width, height: state.height };
        },
        getFloatTop: function () { return window.PixflowDesignHostDock && typeof window.PixflowDesignHostDock.getFloatTop === 'function' ? window.PixflowDesignHostDock.getFloatTop() : 48; },
        inferDockSide: function (x, y, panel) { return window.PixflowDesignHostDock ? window.PixflowDesignHostDock.inferDockSide(x, y, panel) : ''; },
        onDockApply: function (panel) { if (window.PixflowDesignHostDock) window.PixflowDesignHostDock.onDockApply(panel); },
        onDockRelease: function () { if (window.PixflowDesignHostDock) window.PixflowDesignHostDock.onDockRelease(); },
        onDockHint: function (side) { if (window.PixflowDesignHostDock) window.PixflowDesignHostDock.onDockHint(side); },
        movingClass: 'pixflow-wp-admin-panel-moving'
      });
      if (controller) controller.load();
    }
    updatePanelChrome();
    mountReact();
    window.dispatchEvent(new CustomEvent('pixflow-design:wp-admin-panel-open'));
    bindPanelHandles();
    refreshContext();
  }

  function closePanel() {
    window.dispatchEvent(new CustomEvent('pixflow-design:wp-admin-panel-close'));
    state.open = false;
    if (shell) {
      shell.classList.remove('is-open');
      shell.setAttribute('aria-hidden', 'true');
    }
    setLauncherOpen(false);
    writeOpenState(false);
    controller && controller.releaseDockLocks();
  }

  function refreshContext() {
    var url = String(config.contextUrl || '').trim();
    if (!url) return;
    var nonce = String(config.restNonce || (window.wpApiSettings && window.wpApiSettings.nonce) || '');
    window.fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json', 'X-WP-Nonce': nonce }
    }).then(function (response) {
      if (!response.ok) throw new Error('context ' + response.status);
      return response.json();
    }).then(function (payload) {
      if (!payload || !payload.context) return;
      if (hasUsableContext(payload.context) || !hasUsableContext(config.context)) {
        config.context = payload.context;
        window.dispatchEvent(new CustomEvent('pixflow-design:wp-admin-context', { detail: payload.context }));
      }
    }).catch(function () {
      window.dispatchEvent(new CustomEvent('pixflow-design:wp-admin-context-unavailable'));
    });
  }

  function bind() {
    bindWorkspaceMenu();
    window.addEventListener('pixflow-design:host-docking-ready', function () { if (controller && state.open) controller.refreshDockGeometry(); });
    launcher = document.getElementById('wp-admin-bar-pixflow-design');
    var anchor = launcher && isAdminAgentLauncher(launcher) ? launcher.querySelector(':scope > .ab-item') : null;
    window.addEventListener('pixflow-design:host-panel-toggle', function () {
      if (state.open) closePanel(); else openPanel();
    });
    if (anchor) {
      anchor.setAttribute('role', 'button');
      anchor.setAttribute('aria-haspopup', 'dialog');
      anchor.setAttribute('aria-expanded', 'false');
      anchor.addEventListener('click', function (event) {
        event.preventDefault();
        openPanel();
      });
      anchor.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openPanel();
        }
      });
    }
    document.addEventListener('click', function (event) {
      var target = event.target && event.target.closest ? event.target.closest('[data-pixflow-wp-admin-close]') : null;
      if (target) closePanel();
    });
    window.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && state.open && !event.defaultPrevented
        && !document.body.classList.contains('pixflow-admin-workspace-open')) closePanel();
    });
    window.addEventListener('popstate', function () {
      if (state.open) refreshContext();
    });
    window.addEventListener('pageshow', function () {
      if (state.open) refreshContext();
    });
    ['wp-save-post-success', 'wp-autosave-success', 'pixflow-design:wp-admin-context-invalidated'].forEach(function (eventName) {
      window.addEventListener(eventName, function () {
        if (state.open) refreshContext();
      });
    });
    window.addEventListener('pixflow-design:wp-admin-close', closePanel);
    window.addEventListener('pagehide', function () {
      writeOpenState(state.open);
      if (!controller) return;
      try {
        var panel = controller.getState();
        var saved = JSON.parse(window.localStorage.getItem(storageKey) || '{}');
        saved = saved && typeof saved === 'object' ? saved : {};
        window.localStorage.setItem(storageKey, JSON.stringify(Object.assign({}, saved, panel, {
          open: Boolean(state.open)
        })));
      } catch (_) {
        // The controller already saved the latest geometry when storage works.
      }
    });
    // A handoff only opens the panel. Authenticated receipt/canvas checks in
    // the receiver remain the authority to dispatch any work.
    var handoffParams = new URLSearchParams(window.location.search);
    var hasBuilderHandoff = /^[a-f0-9]{64}$/.test(handoffParams.get('pixflow_handoff') || '')
      && /^[A-Za-z0-9_-]{16,128}$/.test(handoffParams.get('pixflow_handoff_tab') || '');
    // Gutenberg can normalize its URL before this footer script runs. The
    // server captures only this document's validated identity, never a draft.
    var documentHandoff = config.builderHandoff;
    if (!hasBuilderHandoff && documentHandoff && typeof documentHandoff === 'object') {
      hasBuilderHandoff = /^[a-f0-9]{64}$/.test(documentHandoff.id || '')
        && /^[A-Za-z0-9_-]{16,128}$/.test(documentHandoff.tabId || '')
        && Number.isInteger(documentHandoff.postId) && documentHandoff.postId > 0
        && String(documentHandoff.postId) === (handoffParams.get('post') || handoffParams.get('post_id'))
        && (handoffParams.get('action') === 'edit' || handoffParams.get('action') === 'elementor' || handoffParams.get('etch') === 'magic');
    }
    if (readOpenState() || hasBuilderHandoff) openPanel();
  }

  // Settings remain available in Free. Workspace access can change in place
  // after Pro activation; its UI and REST checks remain authoritative.
  function bindWorkspaceMenu() {
    var trigger = document.querySelector('#wp-admin-bar-pixflow-design-menu > .ab-item');
    var api = window.pixflowDesignWorkspaceMenu;
    if (!trigger || !api) return;
    function workspaceAvailable() {
      var runtime = window.__PIXFLOW_FEATURE_RUNTIME__;
      if (runtime && Array.isArray(runtime.features)) return runtime.features.indexOf('planning') !== -1;
      // wp_localize_script serializes top-level booleans as "1" / "".
      return config.workspaceAvailable === true || config.workspaceAvailable === '1';
    }
    var overlay = null;
    var ready = false;
    var pending = [];
    var menu = null;
    var keepWorkspaceOnToolClose = false;
    var theme = (config.appConfig && config.appConfig.theme) || 'dark';
    function post(data) {
      window.postMessage(Object.assign({ source: 'pixflow-design-shell' }, data), window.location.origin);
    }
    function close() {
      if (!overlay) return;
      overlay.hidden = true;
      document.body.classList.remove('pixflow-admin-workspace-open');
      post({ type: 'pixflow-design:workspace-visibility', open: false });
      trigger.focus();
    }
    function open(command, show) {
      show = show !== false;
      if (!overlay) {
        if (!window.PixflowDesignApp) return;
        overlay = document.createElement('section');
        overlay.id = 'pixflow-admin-workspace';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-label', 'Your Pixflow workspace');
        overlay.setAttribute('data-pixflow-i18n-label', 'ui.wpAdminOnboardingHost.yourPixflowWorkspace');
        var workspaceRoot = document.createElement('div');
        workspaceRoot.id = 'pixflow-design-root';
        overlay.appendChild(workspaceRoot);
        document.body.appendChild(overlay);
        window.PixflowDesignApp.mount(workspaceRoot, Object.assign({}, config, {
          surface: 'workspace', workspaceInitiallyVisible: show, settingsPortal: true
        }));
      }
      overlay.hidden = !show;
      document.body.classList.toggle('pixflow-admin-workspace-open', show);
      var commands = [
        { type: 'pixflow-design:workspace-visibility', open: show },
        command || { type: 'pixflow-design:close-workspace-tool' }
      ];
      if (ready) commands.forEach(post); else pending = pending.concat(commands);
    }
    window.addEventListener('message', function (event) {
      if (!overlay || event.source !== window || event.origin !== window.location.origin) return;
      var data = event.data;
      if (!data || data.source !== 'pixflow-design') return;
      if (data.type === 'pixflow-design:workspace-ready') {
        ready = true;
        pending.splice(0).forEach(post);
      }
      if (data.type === 'pixflow-design:close-workspace') close();
      if (data.type === 'pixflow-design:workspace-tool-closed') {
        if (!keepWorkspaceOnToolClose) close();
        keepWorkspaceOnToolClose = false;
      }
    });
    trigger.setAttribute('role', 'button');
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', 'false');
    function toggle(event) {
      event.preventDefault();
      event.stopPropagation();
      // Editor screens already own a workspace host; reuse it instead of
      // creating competing app roots or duplicate menus in the same document.
      var nativeTrigger = document.querySelector('#pixflow-gutenberg-workspace-toggle, #pixflow-elementor-workspace-toggle, #pixflow-etch-workspace-toggle');
      if (nativeTrigger) { nativeTrigger.click(); return; }
      if (!menu) menu = api.mount({
        id: 'pixflow-admin-toolbar-menu', trigger: trigger,
        getTheme: function () { return theme; },
        isWorkspaceOpen: function () { return Boolean(overlay && !overlay.hidden); },
        isOnboardingCompleted: function () { return !config.appConfig || config.appConfig.onboardingCompleted !== false; },
        workspaceAvailable: workspaceAvailable(), planningAvailable: workspaceAvailable(), initialDesignSystemVisible: workspaceAvailable(),
        designSystemLabel: 'Design systems',
        onToggleWorkspace: function () { if (overlay && !overlay.hidden) close(); else if (workspaceAvailable()) open(); },
        onOpenTool: function (tool) { if (!workspaceAvailable()) return; keepWorkspaceOnToolClose = false; open({ type: 'pixflow-design:open-workspace-tool', tool: tool === 'design-system' ? 'design-systems' : tool }); },
        onOpenSettings: function () {
          keepWorkspaceOnToolClose = Boolean(overlay && !overlay.hidden);
          open({ type: 'pixflow-design:open-settings', section: 'execution' }, keepWorkspaceOnToolClose);
        },
        onThemeChange: function (value) {
          theme = value;
          open({ type: 'pixflow-design:change-theme', theme: value }, Boolean(overlay && !overlay.hidden));
        }
      });
      menu.toggle();
    }
    trigger.addEventListener('click', toggle);
    trigger.addEventListener('keydown', function (event) {
      if (event.key === ' ') toggle(event);
    });
    window.addEventListener('open-design:app-config-changed', function (event) {
      var value = event.detail && event.detail.theme;
      if (value === 'light' || value === 'dark' || value === 'system') {
        theme = value;
        if (menu) menu.refreshTheme();
      }
    });
  }

  // A native editor can be usable while unrelated deferred scripts still hold
  // DOMContentLoaded. Bind once parsing ends; native canvas readiness is separate.
  var bound = false;
  function bindWhenParsed() {
    if (bound || document.readyState === 'loading') return;
    bound = true;
    document.removeEventListener('readystatechange', bindWhenParsed);
    document.removeEventListener('DOMContentLoaded', bindWhenParsed);
    bind();
  }
  document.addEventListener('readystatechange', bindWhenParsed);
  document.addEventListener('DOMContentLoaded', bindWhenParsed);
  bindWhenParsed();
})(window, document);
