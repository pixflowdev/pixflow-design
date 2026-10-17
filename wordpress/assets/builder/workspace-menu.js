(function () {
  'use strict';

  function createSvgIcon(name) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '15');
    svg.setAttribute('height', '15');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');

    function path(d) {
      var node = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      node.setAttribute('d', d);
      svg.appendChild(node);
    }

    if (name === 'workspace') {
      path('M3 5h18v14H3z');
      path('M3 9h18');
      path('M8 9v10');
    } else if (name === 'font') {
      path('M5 5h14');
      path('M12 5v14');
      path('M8 19h8');
    } else if (name === 'icons') {
      path('M4 4h6v6H4z');
      path('M14 4h6v6h-6z');
      path('M4 14h6v6H4z');
      path('M17 14l3 6h-6z');
    } else if (name === 'palette') {
      path('M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z');
      path('M7.5 10h.01');
      path('M9.5 6.5h.01');
      path('M14 6h.01');
      path('M17 9h.01');
    } else if (name === 'sitemap') {
      path('M6 4v16');
      path('M6 8h7a3 3 0 0 1 3 3v1');
      path('M6 14h7a3 3 0 0 0 3-3');
      path('M16 12v4');
      path('M13 16h6');
    } else if (name === 'settings') {
      path('M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z');
      path('M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6l-.04.08H10l-.04-.08a1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1L3.92 14v-4L4 9.96a1.7 1.7 0 0 0 .6-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.86-2.86.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6l.04-.08h4L14 4a1.7 1.7 0 0 0 1 .6 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19.4 9c.08.4.3.75.6 1l.08.04v4L20 14a1.7 1.7 0 0 0-.6 1z');
    } else if (name === 'sun') {
      path('M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z');
      path('M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.41M17.66 6.34l1.41-1.41');
    } else if (name === 'moon') {
      path('M21 12.8A8.5 8.5 0 1 1 11.2 3 6.5 6.5 0 0 0 21 12.8z');
    } else {
      path('M12 3v18');
      path('M3 12h18');
    }

    return svg;
  }

  function appendIcon(target, name) {
    target.appendChild(createSvgIcon(name));
  }

  function createButton(className, label, iconName, onClick) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.setAttribute('role', 'menuitem');
    if (iconName) {
      var icon = document.createElement('span');
      icon.className = 'entry-settings-menu__item-icon';
      appendIcon(icon, iconName);
      button.appendChild(icon);
    }
    var text = document.createElement('span');
    text.textContent = label;
    button.appendChild(text);
    button.addEventListener('click', onClick);
    return button;
  }

  function mount(options) {
    var trigger = options && options.trigger;
    if (!trigger) {
      return null;
    }

    var menu = document.createElement('div');
    menu.className = 'pixflow-design-toolbar-menu entry-settings-menu__popover';
    menu.id = options.id || 'pixflow-design-toolbar-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Pixflow Design');
    menu.hidden = true;

    var workspaceButton = createButton(
      'entry-settings-menu__item entry-settings-menu__item--primary pixflow-design-toolbar-menu__workspace',
      'Open workspace',
      'workspace',
      function () {
        close();
        options.onToggleWorkspace();
      }
    );
    var workspaceButtonLabel = workspaceButton.querySelector('span:last-child');
    workspaceButton.hidden = options.workspaceAvailable === false;
    menu.appendChild(workspaceButton);

    var appearance = document.createElement('section');
    appearance.className = 'entry-settings-menu__section';
    var appearanceTitle = document.createElement('div');
    appearanceTitle.className = 'entry-settings-menu__section-title';
    appendIcon(appearanceTitle, 'palette');
    var appearanceLabel = document.createElement('span');
    appearanceLabel.textContent = 'Appearance';
    appearanceTitle.appendChild(appearanceLabel);
    appearance.appendChild(appearanceTitle);

    var themeRow = document.createElement('div');
    themeRow.className = 'entry-settings-menu__theme-row';
    [
      { value: 'system', label: 'System', icon: 'palette' },
      { value: 'light', label: 'Light', icon: 'sun' },
      { value: 'dark', label: 'Dark', icon: 'moon' }
    ].forEach(function (theme) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'entry-settings-menu__theme';
      button.setAttribute('role', 'menuitemradio');
      button.dataset.themeValue = theme.value;
      appendIcon(button, theme.icon);
      var label = document.createElement('span');
      label.textContent = theme.label;
      button.appendChild(label);
      button.addEventListener('click', function () {
        options.onThemeChange(theme.value);
        refreshTheme();
      });
      themeRow.appendChild(button);
    });
    appearance.appendChild(themeRow);
    menu.appendChild(appearance);

    var tools = document.createElement('section');
    tools.className = 'entry-settings-menu__section';
    var toolsTitle = document.createElement('div');
    toolsTitle.className = 'entry-settings-menu__section-title';
    appendIcon(toolsTitle, 'workspace');
    var toolsLabel = document.createElement('span');
    toolsLabel.textContent = 'Design tools';
    toolsTitle.appendChild(toolsLabel);
    tools.appendChild(toolsTitle);

    var toolGrid = document.createElement('div');
    toolGrid.className = 'inline-switcher__agent-grid pixflow-design-toolbar-menu__tools';

    function addTool(label, icon, tool) {
      var row = document.createElement('div');
      row.className = 'inline-switcher__agent-row';
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'inline-switcher__agent';
      button.setAttribute('role', 'menuitem');
      appendIcon(button, icon);
      var name = document.createElement('span');
      name.className = 'inline-switcher__agent-name';
      name.textContent = label;
      button.appendChild(name);
      button.addEventListener('click', function () {
        close();
        options.onOpenTool(tool);
      });
      row.appendChild(button);
      toolGrid.appendChild(row);
      return row;
    }

    addTool('Google Fonts', 'font', 'google-fonts');
    addTool('Icon Sets', 'icons', 'icon-sets');
    var sitemapTool = addTool('Sitemap Builder', 'sitemap', 'sitemap');
    sitemapTool.hidden = options.planningAvailable === false;
    var designSystemTool = addTool(options.designSystemLabel || 'Design Your System', 'palette', 'design-system');
    designSystemTool.hidden = !Boolean(options.initialDesignSystemVisible);
    tools.appendChild(toolGrid);
    menu.appendChild(tools);

    var divider = document.createElement('div');
    divider.className = 'entry-settings-menu__divider';
    divider.setAttribute('aria-hidden', 'true');
    menu.appendChild(divider);

    var settingsButton = createButton(
      'entry-settings-menu__item entry-settings-menu__item--primary',
      'Settings',
      'settings',
      function () {
        close();
        options.onOpenSettings();
      }
    );
    menu.appendChild(settingsButton);

    document.body.appendChild(menu);

    function resolvedTheme() {
      var theme = String(options.getTheme() || 'dark');
      if (theme === 'light' || theme === 'dark') {
        return theme;
      }
      if (typeof options.resolveSystemTheme === 'function') return options.resolveSystemTheme();
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }

    function refreshTheme() {
      var selected = String(options.getTheme() || 'system');
      menu.dataset.theme = resolvedTheme();
      Array.prototype.forEach.call(
        menu.querySelectorAll('[data-theme-value]'),
        function (button) {
          var active = button.dataset.themeValue === selected;
          button.classList.toggle('is-active', active);
          button.setAttribute('aria-checked', active ? 'true' : 'false');
        }
      );
    }

    function refreshWorkspaceState() {
      var runtime = window.__PIXFLOW_FEATURE_RUNTIME__;
      if (runtime && Array.isArray(runtime.features)) {
        var planning = runtime.features.indexOf('planning') !== -1;
        workspaceButton.hidden = !planning;
        sitemapTool.hidden = !planning;
        designSystemTool.hidden = !planning;
      }
      var open = Boolean(options.isWorkspaceOpen());
      var onboardingCompleted = typeof options.isOnboardingCompleted !== 'function'
        || options.isOnboardingCompleted();
      var workspaceLabel = open
        ? 'Close workspace'
        : (onboardingCompleted ? 'Open workspace' : 'Start onboarding');
      if (workspaceButtonLabel) {
        workspaceButtonLabel.textContent = workspaceLabel;
      }
      workspaceButton.setAttribute('aria-label', workspaceLabel);
      tools.hidden = !onboardingCompleted || workspaceButton.hidden;
      divider.hidden = tools.hidden;
      // Settings is also the Free setup/recovery entry point. A legacy or
      // incomplete onboarding flag must never strand users in Appearance.
      settingsButton.hidden = false;
    }

    var designSystemVisibilityPromise = null;
    function refreshDesignSystemVisibility() {
      if (designSystemVisibilityPromise || typeof options.resolveDesignSystemVisibility !== 'function') {
        return designSystemVisibilityPromise || Promise.resolve(!designSystemTool.hidden);
      }
      designSystemVisibilityPromise = Promise.resolve(options.resolveDesignSystemVisibility()).then(function (visible) {
        var runtime = window.__PIXFLOW_FEATURE_RUNTIME__;
        if (runtime && Array.isArray(runtime.features) && runtime.features.indexOf('planning') === -1) visible = false;
        designSystemTool.hidden = !Boolean(visible);
        return Boolean(visible);
      }).catch(function () {
        return !designSystemTool.hidden;
      }).finally(function () {
        designSystemVisibilityPromise = null;
      });
      return designSystemVisibilityPromise;
    }

    function position() {
      var rect = trigger.getBoundingClientRect();
      var width = Math.min(320, Math.max(260, window.innerWidth - 24));
      var left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.right - width));
      menu.style.width = width + 'px';
      menu.style.left = Math.round(left) + 'px';
      menu.style.top = Math.round(rect.bottom + 8) + 'px';
      if (options.placement === 'right-up') {
        menu.style.left = Math.round(Math.max(8, Math.min(rect.right + 8, window.innerWidth - width - 8))) + 'px';
        menu.style.top = 'auto';
        menu.style.bottom = Math.max(8, window.innerHeight - rect.bottom) + 'px';
        menu.style.maxHeight = Math.max(120, rect.bottom - 16) + 'px';
        menu.style.overflowY = 'auto';
      }
    }

    function close() {
      menu.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    }

    function open() {
      refreshTheme();
      refreshWorkspaceState();
      position();
      menu.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      // Keep the server-rendered visibility for the first paint and refresh it
      // in the background. The menu must never wait on WordPress REST to lay out.
      refreshDesignSystemVisibility();
    }

    function toggle() {
      if (menu.hidden) {
        open();
      } else {
        close();
      }
    }

    function onDocumentPointerDown(event) {
      if (menu.hidden || menu.contains(event.target) || trigger.contains(event.target)) {
        return;
      }
      close();
    }

    function onDocumentKeyDown(event) {
      if (event.key === 'Escape' && !menu.hidden) {
        event.preventDefault();
        close();
        trigger.focus();
      }
    }

    function onViewportChange() {
      if (!menu.hidden) {
        position();
      }
    }

    document.addEventListener('pointerdown', onDocumentPointerDown);
    document.addEventListener('keydown', onDocumentKeyDown);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    window.addEventListener('pixflow-design:feature-runtime-changed', refreshWorkspaceState);

    return {
      toggle: toggle,
      close: close,
      refreshTheme: refreshTheme,
      refreshWorkspaceState: refreshWorkspaceState,
      refreshDesignSystemVisibility: refreshDesignSystemVisibility,
      destroy: function () {
        document.removeEventListener('pointerdown', onDocumentPointerDown);
        document.removeEventListener('keydown', onDocumentKeyDown);
        window.removeEventListener('resize', onViewportChange);
        window.removeEventListener('scroll', onViewportChange, true);
        window.removeEventListener('pixflow-design:feature-runtime-changed', refreshWorkspaceState);
        menu.remove();
      }
    };
  }

  window.pixflowDesignWorkspaceMenu = {
    mount: mount
  };
})();
