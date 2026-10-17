(function () {
  'use strict';

  var config = window.pixflowDesignGutenbergBridge;
  if (!config || window.parent === window || !window.wp || !wp.blocks || !wp.data) return;

  var targetOrigin = String(config.origin || window.location.origin);
  if (targetOrigin !== window.location.origin) targetOrigin = window.location.origin;
  var handled = false;

  function post(type, payload) {
    window.parent.postMessage(Object.assign({
      source: 'pixflow-design-gutenberg-editor',
      type: type,
      ticketId: config.ticketId,
    }, payload || {}), targetOrigin);
  }

  function createBlock(node) {
    var children = Array.isArray(node.innerBlocks) ? node.innerBlocks.map(createBlock) : [];
    var name = String(node.name || '');
    return wp.blocks.createBlock(name, ((window.PixflowGutenbergExtensions || []).find(function (extension) { return extension.owns(name); }) || {input: function (_, attributes) { return attributes; }}).input(name, node.attributes || {}, true), children);
  }

  function sanitizeValidationIssues(issues) {
    if (!Array.isArray(issues)) return [];
    return issues.slice(0, 20).map(function (issue) {
      if (typeof issue === 'string') return issue;
      if (!issue || typeof issue !== 'object') return String(issue || 'Unknown block validation issue.');
      var message = typeof issue.message === 'string' ? issue.message : '';
      var code = typeof issue.code === 'string' ? issue.code : '';
      return [code, message].filter(Boolean).join(': ') || 'Block validation failed.';
    });
  }

  function validationResult(block) {
    try {
      var result = wp.blocks.validateBlock(block);
      if (Array.isArray(result)) return { valid: result[0] === true, issues: sanitizeValidationIssues(result[1]) };
      if (typeof result === 'boolean') return { valid: result, issues: [] };
      return { valid: Boolean(result && (result.isValid === true || result.valid === true)), issues: sanitizeValidationIssues(result && result.issues) };
    } catch (error) {
      return { valid: false, issues: [String(error && error.message || error)] };
    }
  }

  function flatten(blocks, output) {
    blocks.forEach(function (block) {
      if (!block || !block.name) return;
      output.push(block);
      flatten(Array.isArray(block.innerBlocks) ? block.innerBlocks : [], output);
    });
    return output;
  }

  function publicAttributes(block) {
    var attributes = block && block.attributes && typeof block.attributes === 'object' ? block.attributes : {};
    var type = block && block.name ? wp.blocks.getBlockType(block.name) : null;
    var schema = type && type.attributes && typeof type.attributes === 'object' ? type.attributes : {};
    return Object.keys(attributes).reduce(function (output, key) {
      var definition = schema[key];
      if (definition && Object.prototype.hasOwnProperty.call(definition, 'default')) {
        try {
          if (JSON.stringify(attributes[key]) === JSON.stringify(definition.default)) return output;
        } catch (_) {
          // Preserve values that cannot be compared safely.
        }
      }
      output[key] = attributes[key];
      return output;
    }, {});
  }

  function publicBlocks(blocks) {
    return blocks.filter(function (block) { return block && block.name; }).map(function (block) {
      return {
        name: String(block.name || ''),
        attributes: publicAttributes(block),
        innerBlocks: publicBlocks(Array.isArray(block.innerBlocks) ? block.innerBlocks : []),
      };
    });
  }

  function missingBlockCounts(required, current) {
    var requiredCounts = {};
    var currentCounts = {};
    flatten(required, []).forEach(function (block) { requiredCounts[block.name] = (requiredCounts[block.name] || 0) + 1; });
    flatten(current, []).forEach(function (block) { currentCounts[block.name] = (currentCounts[block.name] || 0) + 1; });
    return Object.keys(requiredCounts).filter(function (name) { return (currentCounts[name] || 0) < requiredCounts[name]; }).map(function (name) {
      return name + ':' + (requiredCounts[name] - (currentCounts[name] || 0));
    });
  }

  function waitForStableBlocks(previous, attempts, requiredBlocks) {
    return new Promise(function (resolve, reject) {
      window.setTimeout(function () {
        var selected = wp.data.select('core/block-editor').getBlocks();
        var current = Array.isArray(selected) ? selected : [];
        var serialized = Array.isArray(selected) ? wp.blocks.serialize(current) : '';
        var currentCount = flatten(current, []).length;
        var requiredCount = flatten(requiredBlocks, []).length;
        if (serialized && currentCount >= requiredCount && serialized === previous) return resolve(current);
        if (attempts >= 20) {
          var missing = missingBlockCounts(requiredBlocks, current);
          return reject(new Error('The target Block Editor did not mount the complete non-empty document (required ' + requiredCount + ', mounted ' + currentCount + (missing.length ? '; missing ' + missing.join(', ') : '; document did not stabilize') + ').'));
        }
        waitForStableBlocks(serialized, attempts + 1, requiredBlocks).then(resolve, reject);
      }, 150);
    });
  }

  function waitForEditorRuntime(attempts, previousContent) {
    return new Promise(function (resolve, reject) {
      var store = wp.data.select('core/block-editor');
      var editor = wp.data.select('core/editor');
      var currentPostId = editor && typeof editor.getCurrentPostId === 'function' ? Number(editor.getCurrentPostId()) : 0;
      var currentPost = editor && typeof editor.getCurrentPost === 'function' ? editor.getCurrentPost() : null;
      var editedContent = editor && typeof editor.getEditedPostContent === 'function' ? editor.getEditedPostContent() : null;
      var currentBlocks = store && typeof store.getBlocks === 'function' ? store.getBlocks() : null;
      var currentContent = Array.isArray(currentBlocks) ? wp.blocks.serialize(currentBlocks) : null;
      var ready = store && Array.isArray(currentBlocks)
        && wp.blocks.getBlockTypes().length > 0
        && currentPostId === Number(config.postId)
        && currentPost && Number(currentPost.id || 0) === Number(config.postId)
        && typeof editedContent === 'string';
      if (ready && currentContent === previousContent) return resolve();
      if (attempts >= 80) return reject(new Error('The target Block Editor and post context did not become ready.'));
      window.setTimeout(function () { waitForEditorRuntime(attempts + 1, currentContent).then(resolve, reject); }, 125);
    });
  }

  async function serialize(message) {
    await waitForEditorRuntime(0, null);
    var editorDispatch = wp.data.dispatch('core/editor');
    var blockDispatch = wp.data.dispatch('core/block-editor');
    if (!blockDispatch || typeof blockDispatch.resetBlocks !== 'function') {
      throw new Error('The target Block Editor store is unavailable.');
    }
    if (editorDispatch && typeof editorDispatch.lockPostSaving === 'function') editorDispatch.lockPostSaving('pixflow-gutenberg-serializer');
    if (editorDispatch && typeof editorDispatch.lockPostAutosaving === 'function') editorDispatch.lockPostAutosaving('pixflow-gutenberg-serializer');

    var requested = Array.isArray(message.blocks) ? message.blocks : [];
    var requestedFlat = flatten(requested, []);
    if (!requested.length || !requestedFlat.length) throw new Error('A Gutenberg replacement requires a non-empty proposed document.');
    var unavailable = requestedFlat.filter(function (node) { return !wp.blocks.getBlockType(String(node.name || '')); }).map(function (node) { return String(node.name || ''); });
    if (unavailable.length) throw new Error('Unavailable target-editor blocks: ' + unavailable.join(', '));
    var created = requested.map(createBlock);
    var createdContent = wp.blocks.serialize(created);
    var canonicalRequested = createdContent ? wp.blocks.parse(createdContent) : [];
    var canonicalFlat = flatten(canonicalRequested, []);
    var canonicalMissing = missingBlockCounts(requested, canonicalRequested);
    if (!createdContent || canonicalFlat.length < requestedFlat.length || canonicalMissing.length) {
      throw new Error('The target Block Editor could not canonicalize every proposed block (required ' + requestedFlat.length + ', parsed ' + canonicalFlat.length + (canonicalMissing.length ? '; missing ' + canonicalMissing.join(', ') : '') + ').');
    }
    blockDispatch.resetBlocks(canonicalRequested);
    var mounted = await waitForStableBlocks(null, 0, canonicalRequested);
    for (const extension of (window.PixflowGutenbergExtensions || [])) await extension.settle(wp, function () {});
    mounted = wp.data.select('core/block-editor').getBlocks();
    var content = wp.blocks.serialize(mounted);
    if (!content || !content.trim()) throw new Error('The target Block Editor returned empty serialized content for a non-empty document.');
    var parsed = wp.blocks.parse(content);
    var flat = flatten(parsed, []);
    if (!flat.length || flat.length < requestedFlat.length) throw new Error('Required blocks disappeared during target-editor serialization.');
    var errors = [];
    flat.forEach(function (block, index) {
      var check = validationResult(block);
      if (!check.valid) errors.push({ index: index, name: block.name, issues: check.issues });
    });
    post('serialized', {
      resolvedTreeHash: message.resolvedTreeHash,
      content: content,
      validation: {
        valid: errors.length === 0,
        errors: errors,
        blockCount: flat.length,
        registeredBlockCount: wp.blocks.getBlockTypes().length,
        usedBlockTypes: flat.map(function (block) { return block.name; }).filter(function (name, index, names) { return names.indexOf(name) === index; }),
        editorContext: 'target-post',
      },
    });
  }

  async function discover() {
    await waitForEditorRuntime(0, null);
    var items = wp.blocks.getBlockTypes().slice(0, 500).map(function (block) {
      var variations = [];
      var styles = [];
      var transformCounts = { from: 0, to: 0 };
      try {
        if (typeof wp.blocks.getBlockVariations === 'function') {
          variations = wp.blocks.getBlockVariations(block.name).slice(0, 40).map(function (variation) {
            return {
              name: String(variation.name || ''),
              title: String(variation.title || variation.name || ''),
              description: String(variation.description || ''),
              scope: Array.isArray(variation.scope) ? variation.scope.slice(0, 12).map(String) : [],
              isDefault: variation.isDefault === true,
              attributes: variation.attributes && typeof variation.attributes === 'object' ? variation.attributes : {},
            };
          });
        }
      } catch (_) {}
      try {
        if (typeof wp.blocks.getBlockStyles === 'function') {
          styles = wp.blocks.getBlockStyles(block.name).slice(0, 40).map(function (style) {
            return { name: String(style.name || ''), label: String(style.label || style.name || ''), isDefault: style.isDefault === true };
          });
        }
      } catch (_) {}
      try {
        if (typeof wp.blocks.getBlockTransforms === 'function') {
          transformCounts.from = wp.blocks.getBlockTransforms('from', block.name).length;
          transformCounts.to = wp.blocks.getBlockTransforms('to', block.name).length;
        }
      } catch (_) {}
      return {
        name: String(block.name || ''),
        title: String(block.title || block.name || ''),
        description: String(block.description || ''),
        category: String(block.category || ''),
        apiVersion: Number(block.apiVersion || 1),
        attributes: block.attributes || {},
        supports: block.supports || {},
        parent: Array.isArray(block.parent) ? block.parent : [],
        ancestor: Array.isArray(block.ancestor) ? block.ancestor : [],
        allowedBlocks: Array.isArray(block.allowedBlocks) ? block.allowedBlocks : [],
        usesContext: Array.isArray(block.usesContext) ? block.usesContext : [],
        providesContext: block.providesContext && typeof block.providesContext === 'object' ? block.providesContext : {},
        keywords: Array.isArray(block.keywords) ? block.keywords.slice(0, 40).map(String) : [],
        variations: variations,
        styles: styles,
        transformCounts: transformCounts,
        deprecatedCount: Array.isArray(block.deprecated) ? block.deprecated.length : 0,
        browserRegistrySource: 'target-post-editor',
      };
    });
    post('discovered', { items: items, registeredBlockCount: items.length, editorContext: 'target-post' });
  }

  async function parseDocument(message) {
    await waitForEditorRuntime(0, null);
    var content = typeof message.content === 'string' ? message.content : '';
    if (!content.trim()) throw new Error('The exact Gutenberg read contained no canonical content to parse.');
    var parsed = wp.blocks.parse(content);
    var flat = flatten(parsed, []);
    if (!flat.length) throw new Error('The target Block Editor parsed no blocks from the exact document read.');
    var errors = [];
    flat.forEach(function (block, index) {
      var check = validationResult(block);
      if (!check.valid) errors.push({ index: index, name: block.name, issues: check.issues });
    });
    post('parsed', {
      resolvedTreeHash: message.resolvedTreeHash,
      blocks: publicBlocks(parsed),
      // Existing content may contain legacy markup that WordPress can still
      // display but its newest save implementation would canonicalize. That
      // validation status is read evidence, not authority to discard the
      // target editor's complete derived attributes (captions, classes, etc.).
      validation: { valid: errors.length === 0, errors: errors, blockCount: flat.length, editorContext: 'target-post' },
    });
  }

  window.addEventListener('message', function (event) {
    var message = event.data;
    if (handled || event.source !== window.parent || event.origin !== targetOrigin || !message || message.source !== 'pixflow-design-gutenberg-host') return;
    if (!['serialize', 'discover', 'parse'].includes(message.type) || message.ticketId !== config.ticketId || message.resolvedTreeHash !== config.resolvedTreeHash) return;
    handled = true;
    var operation = message.type === 'discover' ? discover() : message.type === 'parse' ? parseDocument(message) : serialize(message);
    operation.catch(function (error) {
      post('error', { message: String(error && error.message || error) });
    });
  });

  wp.domReady(function () {
    var editorDispatch = wp.data.dispatch('core/editor');
    if (editorDispatch && typeof editorDispatch.lockPostSaving === 'function') editorDispatch.lockPostSaving('pixflow-gutenberg-serializer');
    if (editorDispatch && typeof editorDispatch.lockPostAutosaving === 'function') editorDispatch.lockPostAutosaving('pixflow-gutenberg-serializer');
    post('ready', { resolvedTreeHash: config.resolvedTreeHash, postId: config.postId });
  });
}());
