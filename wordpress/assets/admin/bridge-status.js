(function () {
  'use strict';

  var config = window.pixflowDesignAdminBridge || {};
  var currentState = '';
  var currentTitle = '';
  var currentVersion = '';
  var observedRoute = '';
  var publishedRoute = '';
  var hasResolvedOnce = false;
  var lastProbeAt = 0;
  var probeInFlight = false;
  var failedProbeCount = 0;
  var reconnectQueued = false;
  var bridgeHeartbeatTimer = null;
  var tabWasHidden = document.visibilityState === 'hidden';
  var PROBE_COOLDOWN_MS = 120000;
  var PRECONNECT_TTL_MS = 24 * 60 * 60 * 1000;
  var HEARTBEAT_INTERVAL_MS = 4000;
  var BRIDGE_HELP_TITLE = 'Pixflow Bridge connects Local CLI and local files. Click to check the connection.';

  function normalizeBaseUrl(value) {
    return String(value || '').trim().replace(/\/+$/, '');
  }

  function bridgeApiUrl(path) {
    var baseUrl = normalizeBaseUrl(config.bridgeBaseUrl);
    return baseUrl ? baseUrl + '/api/' + String(path || '').replace(/^\/+/, '') : '';
  }

  function preconnectStorageKey() {
    return 'pixflow-design:bridge-preconnect:' + String(config.siteHash || 'site');
  }

  function readPreconnect() {
    var storages = [];
    try { if (window.localStorage) storages.push(window.localStorage); } catch (_) {}
    try { if (window.sessionStorage) storages.push(window.sessionStorage); } catch (_) {}
    for (var index = 0; index < storages.length; index += 1) {
      try {
        var raw = storages[index].getItem(preconnectStorageKey());
        if (!raw) continue;
        var parsed = JSON.parse(raw);
        if (!parsed || !parsed.checkedAt) continue;
        var ttl = Number(parsed.ttlMs || PRECONNECT_TTL_MS);
        if (Date.now() - Number(parsed.checkedAt) > ttl) continue;
        return parsed;
      } catch (_) {
        // Storage is optional in locked-down admin tabs.
      }
    }
    return null;
  }

  function persistPreconnect(payload, state, error) {
    var value = JSON.stringify({
        checkedAt: Date.now(),
        ttlMs: PRECONNECT_TTL_MS,
        state: state || '',
        running: state === 'connected',
        version: payload && payload.version ? String(payload.version) : '',
        instanceId: payload && payload.instanceId ? String(payload.instanceId) : '',
        site: payload && payload.site && typeof payload.site === 'object' ? payload.site : null,
        siteMismatch: isSiteMismatch(payload),
        error: error && error.message ? String(error.message) : error ? String(error) : ''
      });
    try { window.localStorage.setItem(preconnectStorageKey(), value); } catch (_) {}
    try { window.sessionStorage.setItem(preconnectStorageKey(), value); } catch (_) {}
  }

  function installerUrl() {
    var platform = String(window.navigator && window.navigator.platform || '');
    var userAgent = String(window.navigator && window.navigator.userAgent || '');
    var isWindows = /\bWindows\b/i.test(userAgent) || /^win/i.test(platform);
    if (isWindows) return config.bridgeInstallWindowsUrl || 'https://pixflow.dev/downloads/pixflow-design-bridge/packages/pixflow-design-bridge-win-x64-setup.exe';
    if (/mac|darwin/i.test(platform + ' ' + userAgent)) {
      return config.bridgeInstallMacArm64Url || 'https://pixflow.dev/downloads/pixflow-design-bridge/packages/pixflow-design-bridge-mac-arm64.dmg';
    }
    if (!isWindows && config.bridgeInstallUnixUrl) return config.bridgeInstallUnixUrl;
    return config.bridgeInstallWindowsUrl || config.bridgeInstallUnixUrl || '#';
  }

  function setState(state, label, title) {
    var nextState = state || '';
    var nextTitle = title || label || BRIDGE_HELP_TITLE;
    var titleChanged = currentTitle !== nextTitle;
    var stateChanged = currentState !== nextState;

    // The healthy four-second heartbeat is intentionally frequent, but a successful
    // no-change probe must not churn shared application state or repaint any
    // of the subscribed panel/workspace controls. Publish only real changes.
    var route = nextState === 'connected' ? observedRoute : '';
    if (stateChanged || titleChanged || publishedRoute !== route) {
      publishedRoute = route;
      currentState = nextState;
      currentTitle = nextTitle;
      var status = {
        checked: nextState !== 'checking',
        running: nextState === 'connected' || nextState === 'update',
        state: nextState,
        status: nextState,
        updateRequired: nextState === 'update',
        version: currentVersion,
        connectionRoute: route,
        error: nextState === 'missing' || nextState === 'error' ? nextTitle : ''
      };
      window.pixflowDesignBridgeStatus = status;
      window.dispatchEvent(new CustomEvent('pixflow-design:bridge-status', { detail: status }));
    }
  }

  function applyCachedPreconnect() {
    var cached = readPreconnect();
    if (!cached) return false;

    hasResolvedOnce = true;
    currentVersion = cached.version ? String(cached.version) : '';
    var cachedVersion = cached.version ? ' ' + String(cached.version) : '';
    if (cached.state === 'connected' && cached.siteMismatch !== true) {
      setState('connected', 'Pixflow Bridge', 'Pixflow Design Bridge is connected' + cachedVersion + '. Click to check the connection.');
      return true;
    }
    if (cached.state === 'mismatch') {
      setState('error', 'Pixflow Bridge', 'Pixflow Design Bridge is connected to another WordPress site. Click to connect it to this site.');
      return true;
    }
    if (cached.state === 'update') {
      setState('update', 'Pixflow Bridge', 'Pixflow Design Bridge requires an update before Local CLI can be used.');
      return true;
    }
    setState('missing', 'Pixflow Bridge', 'Pixflow Design Bridge is offline. Click to retry. Local CLI and local files are unavailable until it reconnects.');
    return true;
  }

  function compareVersionParts(a, b) {
    var left = String(a || '').split(/[.-]/).map(function (part) { return parseInt(part, 10) || 0; });
    var right = String(b || '').split(/[.-]/).map(function (part) { return parseInt(part, 10) || 0; });
    var length = Math.max(left.length, right.length);
    for (var index = 0; index < length; index++) {
      var diff = (left[index] || 0) - (right[index] || 0);
      if (diff !== 0) return diff;
    }
    return 0;
  }

  function bridgeNeedsUpdate(payload) {
    return Boolean(
      payload &&
      payload.version &&
      config.bridgeRequiredVersion &&
      compareVersionParts(payload.version, config.bridgeRequiredVersion) < 0
    );
  }

  function bridgeJson(path, options) {
    var url = bridgeApiUrl(path);
    if (!url) return Promise.reject(new Error('Pixflow Bridge URL is unavailable.'));
    // Pixflow-owned: the WordPress app installs a fetch broker on admin
    // screens. Bridge ownership, health, and entitlement routes must bypass
    // that broker or a `/api/pixflow/...` URL can be mistaken for a WP REST
    // request, leaving the admin-bar state stuck in "switching".
    var bridgeFetch = typeof window.__PIXFLOW_DESIGN_NATIVE_FETCH__ === 'function'
      ? window.__PIXFLOW_DESIGN_NATIVE_FETCH__
      : window.fetch;
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timeout = window.setTimeout(function () {
      if (controller) controller.abort();
    }, options && options.timeoutMs ? Number(options.timeoutMs) : 1800);
    return bridgeFetch(url, {
      method: options && options.method ? options.method : 'GET',
      mode: 'cors',
      targetAddressSpace: 'loopback',
      cache: 'no-store',
      headers: Object.assign({ Accept: 'application/json', 'X-Pixflow-Site-Key': String(config.siteHash || '') }, options && options.headers || {}),
      body: options && options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller ? controller.signal : undefined
    }).then(function (response) {
      if (!response.ok) throw new Error('Pixflow Bridge returned HTTP ' + response.status);
      return response.json().catch(function () { return {}; }).then(function (payload) {
        if (path === 'health' && payload && payload.ok !== false) {
          var nativeRoute = response.headers && response.headers.get('X-Pixflow-Connection-Route');
          observedRoute = nativeRoute === 'chrome-extension' ? 'chrome-extension'
            : response.pixflowConnectionRoute === 'direct' || !window.__PIXFLOW_NATIVE_PROTOTYPE__ ? 'direct' : '';
        }
        return payload;
      });
    }).catch(function (error) {
      if (error && error.name === 'AbortError') {
        throw new Error('Pixflow Design Bridge did not respond.');
      }
      throw error;
    }).finally(function () {
      window.clearTimeout(timeout);
    });
  }

  function isSiteMismatch(payload) {
    return Boolean(
      config.siteHash &&
      (
        !payload ||
        !payload.site ||
        !payload.site.key ||
        String(payload.site.key) !== String(config.siteHash)
      )
    );
  }

  function waitForSiteContext(previousPayload) {
    var startedAt = Date.now();
    var previousInstanceId = String(previousPayload && previousPayload.instanceId || '');
    var sawTransition = false;
    var stableTargetResponses = 0;

    function poll() {
      return bridgeJson('health', { timeoutMs: 1600 }).then(function (payload) {
        var key = String(payload && payload.site && payload.site.key || '');
        var instanceId = String(payload && payload.instanceId || '');
        if (key !== String(config.siteHash || '') || (previousInstanceId && instanceId && instanceId !== previousInstanceId)) {
          sawTransition = true;
        }
        if (payload && payload.ok !== false && key === String(config.siteHash || '')) {
          stableTargetResponses += 1;
          if (
            sawTransition ||
            (previousInstanceId && instanceId && instanceId !== previousInstanceId) ||
            (!previousInstanceId && Date.now() - startedAt >= 2500 && stableTargetResponses >= 3)
          ) {
            return payload;
          }
        } else {
          stableTargetResponses = 0;
        }
        if (Date.now() - startedAt >= 35000) {
          throw new Error('Pixflow Design Bridge did not finish switching sites.');
        }
        return new Promise(function (resolve) {
          window.setTimeout(resolve, 350);
        }).then(poll);
      }, function (error) {
        sawTransition = true;
        if (Date.now() - startedAt >= 35000) {
          throw error;
        }
        return new Promise(function (resolve) {
          window.setTimeout(resolve, 350);
        }).then(poll);
      });
    }

    return poll();
  }

  function syncBridgeEntitlement() {
    var restBase = normalizeBaseUrl(config.restBaseUrl);
    if (!restBase) return Promise.resolve(true);
    return window.fetch(restBase + '/license/status', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'X-WP-Nonce': String(config.restNonce || '')
      }
    }).then(function (response) {
      if (!response.ok) throw new Error('Pixflow license status returned HTTP ' + response.status);
      return response.json().catch(function () { return {}; });
    }).then(function (payload) {
      var token = String(payload && payload.bridge_entitlement && payload.bridge_entitlement.token || '').trim();
      if (!payload || !payload.license || payload.license.valid !== true || !token) {
        return true;
      }
      return bridgeJson('pixflow/license-entitlement', {
        method: 'POST',
        timeoutMs: 5000,
        headers: { 'Content-Type': 'application/json' },
        body: { token: token }
      }).then(function () { return true; });
    });
  }

  function switchSiteContext(previousPayload) {
    setState('switching', 'Pixflow Bridge: switching', 'Switching Pixflow Design Bridge to this WordPress site...');
    return bridgeJson('pixflow/site-context/switch', {
      method: 'POST',
      timeoutMs: 6000,
      headers: { 'Content-Type': 'application/json' },
      body: {
        siteKey: config.siteHash || '',
        siteOrigin: config.siteOrigin || '',
        siteUrl: config.siteUrl || '',
        siteLabel: config.siteLabel || ''
      }
    }).then(function (payload) {
      if (!payload || payload.ok === false) {
        throw new Error('Pixflow Design Bridge rejected the site switch.');
      }
      if (payload.status === 'claimed') {
        return bridgeJson('health', { timeoutMs: 2200 });
      }
      return waitForSiteContext(previousPayload);
    }).then(function (payload) {
      return syncBridgeEntitlement().then(function () {
        return payload;
      });
    });
  }

  function probe(options) {
    if (probeInFlight) return;
    var opts = options || {};
    var now = Date.now();
    // A stopped Bridge is normal. Back off failed background requests while
    // keeping explicit reconnect immediate and healthy status checks frequent.
    var retryDelay = failedProbeCount > 0
      ? Math.min(PROBE_COOLDOWN_MS, 8000 * Math.pow(2, Math.min(failedProbeCount - 1, 4)))
      : HEARTBEAT_INTERVAL_MS;
    if (!opts.force && hasResolvedOnce && now - lastProbeAt < retryDelay) {
      return;
    }
    lastProbeAt = now;
    probeInFlight = true;
    if (!hasResolvedOnce || opts.showPending) {
      setState('checking', 'Pixflow Bridge', BRIDGE_HELP_TITLE);
    }
    bridgeJson('health', { timeoutMs: 1800 }).then(function (payload) {
      if (!payload || payload.ok === false) {
        throw new Error('Pixflow Design Bridge is not running.');
      }
      failedProbeCount = 0;
      if (isSiteMismatch(payload)) {
        if (opts.allowSwitch !== true) {
          hasResolvedOnce = true;
          persistPreconnect(payload, 'mismatch');
          setState('error', 'Pixflow Bridge', 'Pixflow Design Bridge is connected to another WordPress site. Click to connect it to this site.');
          return null;
        }
        return switchSiteContext(payload);
      }
      return payload;
    }).then(function (payload) {
      if (!payload) return;
      var version = payload && payload.version ? ' ' + payload.version : '';
      currentVersion = payload && payload.version ? String(payload.version) : '';
      if (bridgeNeedsUpdate(payload)) {
        hasResolvedOnce = true;
        persistPreconnect(payload, 'update');
        setState('update', 'Pixflow Bridge: update', 'Pixflow Design Bridge' + version + ' is older than required ' + config.bridgeRequiredVersion + '. Click to update.');
        return;
      }
      hasResolvedOnce = true;
      persistPreconnect(payload, 'connected');
      setState('connected', 'Pixflow Bridge', 'Pixflow Design Bridge is connected' + version + '. Click to check the connection.');
    }).catch(function (error) {
      failedProbeCount = Math.min(failedProbeCount + 1, 5);
      var wasSwitching = currentState === 'switching';
      hasResolvedOnce = true;
      currentVersion = '';
      persistPreconnect(null, wasSwitching ? 'error' : 'missing', error);
      setState(
        wasSwitching ? 'error' : 'missing',
        'Pixflow Bridge',
        wasSwitching
          ? 'Could not connect Pixflow Design Bridge to this site. Click to retry.'
          : 'Pixflow Design Bridge is offline. Click to retry. Local CLI and local files are unavailable until it reconnects.'
      );
    }).finally(function () {
      probeInFlight = false;
      if (reconnectQueued) {
        reconnectQueued = false;
        requestReconnect();
      }
    });
  }

  function requestReconnect() {
    if (hasResolvedOnce && currentState === 'update') {
      window.open(installerUrl(), '_blank', 'noopener,noreferrer');
      return;
    }
    // Preserve explicit recovery intent if a read-only heartbeat is in flight.
    if (probeInFlight) {
      reconnectQueued = true;
      return;
    }
    probe({ force: true, allowSwitch: true, showPending: true });
  }

  function bindBridgeHeartbeat() {
    if (bridgeHeartbeatTimer) return;

    function heartbeat() {
      if (document.visibilityState === 'hidden') return;
      // Health checks keep the dot honest, but a heartbeat never claims a
      // bridge currently owned by another site. Only an explicit request or
      // status click selects a different site.
      probe({ force: false, allowSwitch: false });
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        tabWasHidden = true;
        return;
      }
      if (tabWasHidden) {
        tabWasHidden = false;
        probe({ force: true, allowSwitch: false });
      } else {
        heartbeat();
      }
    }

    bridgeHeartbeatTimer = window.setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pageshow', function () {
      tabWasHidden = false;
      probe({ force: true, allowSwitch: false });
    });
    window.addEventListener('focus', heartbeat);
  }

  function bind() {
    var cached = applyCachedPreconnect();
    if (!cached) {
      hasResolvedOnce = true;
      persistPreconnect(null, 'missing');
      setState('missing', 'Pixflow Bridge', 'Pixflow Design Bridge is offline. Click to retry. Local CLI and local files are unavailable until it reconnects.');
    }
    window.addEventListener('pixflow-design:bridge-reconnect-request', requestReconnect);
    bindBridgeHeartbeat();
    if (cached && (currentState === 'connected' || currentState === 'update')) {
      window.setTimeout(function () {
        probe({ force: true, allowSwitch: false });
      }, 150);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind, { once: true });
  } else {
    bind();
  }
})();
