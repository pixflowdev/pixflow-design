/**
 * Pixflow-owned structure IR and Bricks projection validator.
 *
 * The IR describes the settled source tree before any Bricks element choice.
 * Bricks-specific nestability is consulted only while validating a completed
 * projection through the Phase 2 compatibility adapter.
 */

import { getPixflowBricksElementCapability } from './html-to-bricks-compatibility.mjs';

export const PIXFLOW_HTML_STRUCTURE_IR_SCHEMA = 'pixflow.html_to_bricks.structure_ir.v1';
export const PIXFLOW_HTML_STRUCTURE_REPORT_SCHEMA = 'pixflow.html_to_bricks.structure_report.v1';

/**
 * Attach the source-ordered full-document tree before a deterministic baseline
 * becomes observable. Extracted template arrays are final-apply sidecars and
 * must not be merged into this live preview copy.
 */
export function attachPixflowStageBBaselinePreviewContent(
  result,
  completeDocumentContent,
  { sourceFidelityClone = false } = {},
) {
  if (!result || typeof result !== 'object' || Array.isArray(result) || sourceFidelityClone !== true) {
    return result;
  }
  const content = arrayValue(completeDocumentContent);
  if (content.length === 0) return result;
  result.baseline_preview_content = structuredClone(content);
  result.baselinePreviewContent = result.baseline_preview_content;
  return result;
}

export function buildPixflowHtmlStructureIr({
  roots = [],
  scope = 'page',
  runtimeEvidenceBySourceId = {},
} = {}) {
  const normalizedScope = firstString(scope, 'page');
  const nodes = [];
  let order = 0;

  const visit = (node, parentNodeId = '', ancestorNonVisual = false) => {
    if (!node || !['element', 'text'].includes(firstString(node.type))) return '';
    const type = firstString(node.type);
    const text = type === 'text' ? normalizeWhitespace(node.text) : '';
    if (type === 'text' && !text) return '';
    const nodeId = structureNodeId(node, normalizedScope);
    const childNodeIds = [];
    const record = type === 'text'
      ? {
          nodeId,
          type: 'text',
          tag: '#text',
          sourceIndex: positiveInteger(node.sourceIndex),
          order: order++,
          parentNodeId: firstString(parentNodeId),
          childNodeIds,
          text,
          role: 'text',
          attributes: [],
          classes: [],
          runtimeEvidence: unavailableRuntimeEvidence(),
          potentiallyVisible: !ancestorNonVisual
            && !isKnownNonVisualSourceNode(node?.parent, firstString(node?.parent?.tag).toLowerCase()),
        }
      : buildElementRecord(node, nodeId, parentNodeId, order++, runtimeEvidenceBySourceId);
    if (ancestorNonVisual) record.potentiallyVisible = false;
    record.childNodeIds = childNodeIds;
    nodes.push(record);
    const descendantNonVisual = ancestorNonVisual || record.potentiallyVisible !== true;
    for (const child of arrayValue(node.children)) {
      const childId = visit(child, nodeId, descendantNonVisual);
      if (childId) childNodeIds.push(childId);
    }
    return nodeId;
  };

  const rootNodeIds = [];
  for (const root of arrayValue(roots)) {
    const nodeId = visit(root, '');
    if (nodeId) rootNodeIds.push(nodeId);
  }

  return {
    schema: PIXFLOW_HTML_STRUCTURE_IR_SCHEMA,
    version: 1,
    scope: normalizedScope,
    rootNodeIds,
    nodes,
  };
}

export function createPixflowStructureProjectionRecorder({ ir, compatibilityContext = {} } = {}) {
  const normalizedIr = objectValue(ir).schema === PIXFLOW_HTML_STRUCTURE_IR_SCHEMA
    ? ir
    : buildPixflowHtmlStructureIr({});
  const nodeById = new Map(arrayValue(normalizedIr.nodes).map((node) => [firstString(node?.nodeId), node]));
  const dispositionByNodeId = new Map();
  const provenanceByElementId = new Map();
  const diagnostics = [];

  const recordDisposition = (node, disposition, reason, ownerElementId = '') => {
    const nodeId = structureNodeId(node, firstString(normalizedIr.scope, 'page'));
    if (!nodeId || !nodeById.has(nodeId)) return;
    const existing = dispositionByNodeId.get(nodeId);
    if (existing?.disposition === 'projected') return;
    dispositionByNodeId.set(nodeId, {
      nodeId,
      disposition: firstString(disposition, 'normalized'),
      reason: firstString(reason, 'deterministic_structure_normalization'),
      ownerElementId: firstString(ownerElementId),
    });
  };

  const recordSubtreeDisposition = (node, disposition, reason, ownerElementId = '', includeRoot = false) => {
    const visit = (item, isRoot) => {
      if (!isRoot || includeRoot) recordDisposition(item, disposition, reason, ownerElementId);
      for (const child of arrayValue(item?.children)) visit(child, false);
    };
    if (node) visit(node, true);
  };

  const recordSourceElement = ({ elementId, elementName, node, reason = 'semantic_source_projection' } = {}) => {
    const bricksElementId = firstString(elementId);
    const nodeId = structureNodeId(node, firstString(normalizedIr.scope, 'page'));
    if (!bricksElementId || !nodeId) return;
    provenanceByElementId.set(bricksElementId, {
      bricksElementId,
      bricksElementName: firstString(elementName),
      kind: 'source_node',
      sourceNodeId: nodeId,
      sourceTag: firstString(node?.tag, node?.type === 'text' ? '#text' : ''),
      sourceIndex: positiveInteger(node?.sourceIndex),
      reason: firstString(reason, 'semantic_source_projection'),
      confidence: 'deterministic',
    });
    dispositionByNodeId.set(nodeId, {
      nodeId,
      disposition: 'projected',
      reason: firstString(reason, 'semantic_source_projection'),
      ownerElementId: bricksElementId,
    });
  };

  const recordSyntheticElement = ({ elementId, elementName, reason, parentElementId = '' } = {}) => {
    const bricksElementId = firstString(elementId);
    const normalizedReason = firstString(reason);
    if (!bricksElementId) return;
    provenanceByElementId.set(bricksElementId, {
      bricksElementId,
      bricksElementName: firstString(elementName),
      kind: 'synthetic',
      reason: normalizedReason,
      parentElementId: firstString(parentElementId),
      confidence: normalizedReason ? 'documented_synthetic' : 'missing_reason',
    });
  };

  const addDiagnostic = (diagnostic = {}) => {
    const normalized = {
      code: firstString(diagnostic.code, 'structure_projection_diagnostic'),
      severity: ['info', 'warning', 'error'].includes(firstString(diagnostic.severity))
        ? firstString(diagnostic.severity)
        : 'warning',
      message: firstString(diagnostic.message, diagnostic.code, 'Structure projection diagnostic.'),
      sourceNodeId: firstString(diagnostic.sourceNodeId),
      bricksElementId: firstString(diagnostic.bricksElementId),
    };
    const preferredBricksElementId = firstString(diagnostic.preferredBricksElementId);
    if (preferredBricksElementId) normalized.preferredBricksElementId = preferredBricksElementId;
    const collisionIndex = positiveInteger(diagnostic.collisionIndex);
    if (collisionIndex > 0) normalized.collisionIndex = collisionIndex;
    diagnostics.push(normalized);
  };

  const reconcileRemovedElements = ({
    elementIds = [],
    ownerElementId = '',
    reason = 'deterministic_post_projection_normalization',
  } = {}) => {
    for (const elementId of arrayValue(elementIds).map(firstString).filter(Boolean)) {
      const provenance = provenanceByElementId.get(elementId);
      if (!provenance) continue;
      provenanceByElementId.delete(elementId);
      if (provenance.kind !== 'source_node' || !firstString(provenance.sourceNodeId)) continue;
      dispositionByNodeId.set(firstString(provenance.sourceNodeId), {
        nodeId: firstString(provenance.sourceNodeId),
        disposition: 'normalized_into_generated_capability',
        reason: firstString(reason, 'deterministic_post_projection_normalization'),
        ownerElementId: firstString(ownerElementId),
      });
    }
  };

  return {
    ir: normalizedIr,
    compatibilityContext,
    dispositionByNodeId,
    provenanceByElementId,
    diagnostics,
    recordDisposition,
    recordSubtreeDisposition,
    recordSourceElement,
    recordSyntheticElement,
    reconcileRemovedElements,
    addDiagnostic,
  };
}

export function finalizePixflowHtmlStructureProjection({
  recorders = [],
  elements = [],
  compatibilityContext = {},
} = {}) {
  const sources = arrayValue(recorders).filter(Boolean);
  const provenance = sources.flatMap((recorder) => [...recorder.provenanceByElementId.values()]);
  const diagnostics = sources.flatMap((recorder) => arrayValue(recorder.diagnostics));
  const scopes = sources.map((recorder) => recorder.ir);
  const sourceNodes = scopes.flatMap((ir) => arrayValue(ir?.nodes));
  const dispositions = sources.flatMap((recorder) => [...recorder.dispositionByNodeId.values()]);
  const dispositionByScopedNode = new Map();
  for (let index = 0; index < sources.length; index += 1) {
    const scope = firstString(sources[index]?.ir?.scope, `scope-${index}`);
    for (const disposition of sources[index].dispositionByNodeId.values()) {
      dispositionByScopedNode.set(`${scope}:${firstString(disposition?.nodeId)}`, disposition);
    }
  }
  const visibleSourceNodes = [];
  const uncoveredVisibleSourceNodes = [];
  const omittedVisibleSourceNodes = [];
  for (let index = 0; index < scopes.length; index += 1) {
    const scope = firstString(scopes[index]?.scope, `scope-${index}`);
    for (const node of arrayValue(scopes[index]?.nodes)) {
      if (node?.potentiallyVisible !== true) continue;
      visibleSourceNodes.push(node);
      const disposition = dispositionByScopedNode.get(`${scope}:${firstString(node?.nodeId)}`);
      if (!disposition) {
        uncoveredVisibleSourceNodes.push({ scope, nodeId: firstString(node?.nodeId), tag: firstString(node?.tag) });
      } else if (firstString(disposition?.disposition).startsWith('omitted')) {
        omittedVisibleSourceNodes.push({
          scope,
          nodeId: firstString(node?.nodeId),
          tag: firstString(node?.tag),
          reason: firstString(disposition?.reason),
        });
      }
    }
  }
  for (const node of uncoveredVisibleSourceNodes) {
    diagnostics.push({
      code: 'uncovered_visible_source_node',
      severity: 'error',
      message: `Visible source node ${node.nodeId} (${node.tag}) has no projection or documented normalization.`,
      sourceNodeId: node.nodeId,
      scope: node.scope,
    });
  }
  for (const node of omittedVisibleSourceNodes) {
    diagnostics.push({
      code: 'visible_source_node_omitted',
      severity: 'error',
      message: `Visible source node ${node.nodeId} (${node.tag}) was omitted: ${node.reason || 'no reason'}.`,
      sourceNodeId: node.nodeId,
      scope: node.scope,
    });
  }

  const validation = validatePixflowBricksStructureProjection({
    elements,
    provenance,
    compatibilityContext,
  });
  diagnostics.push(...validation.errors, ...validation.warnings);
  const errors = diagnostics.filter((item) => firstString(item?.severity) === 'error');
  const warnings = diagnostics.filter((item) => firstString(item?.severity) === 'warning');
  const nativeEditableElementCount = arrayValue(elements)
    .filter((element) => !['html', 'code'].includes(firstString(element?.name).toLowerCase())).length;
  const exactFallbackElementCount = arrayValue(elements)
    .filter((element) => ['html', 'code'].includes(firstString(element?.name).toLowerCase())).length;
  const coveredVisibleCount = Math.max(
    0,
    visibleSourceNodes.length - uncoveredVisibleSourceNodes.length - omittedVisibleSourceNodes.length,
  );

  return {
    ir: {
      schema: PIXFLOW_HTML_STRUCTURE_IR_SCHEMA,
      version: 1,
      scopes,
    },
    report: {
      schema: PIXFLOW_HTML_STRUCTURE_REPORT_SCHEMA,
      version: 1,
      ok: errors.length === 0,
      sourceNodeCount: sourceNodes.length,
      visibleSourceNodeCount: visibleSourceNodes.length,
      coveredVisibleSourceNodeCount: coveredVisibleCount,
      uncoveredVisibleSourceNodeCount: uncoveredVisibleSourceNodes.length,
      omittedVisibleSourceNodeCount: omittedVisibleSourceNodes.length,
      sourceCoverageRatio: visibleSourceNodes.length > 0 ? coveredVisibleCount / visibleSourceNodes.length : 1,
      emittedElementCount: arrayValue(elements).length,
      provenanceRecordCount: provenance.length,
      sourceProjectedElementCount: provenance.filter((entry) => entry.kind === 'source_node').length,
      syntheticElementCount: provenance.filter((entry) => entry.kind === 'synthetic').length,
      normalizedSourceNodeCount: dispositions.filter((entry) => entry.disposition !== 'projected').length,
      nativeEditableElementCount,
      exactFallbackElementCount,
      errorCount: errors.length,
      warningCount: warnings.length,
      errors,
      warnings,
      diagnostics,
      provenance,
      dispositions,
    },
  };
}

export function validatePixflowBricksStructureProjection({
  elements = [],
  provenance = [],
  compatibilityContext = {},
} = {}) {
  const errors = [];
  const warnings = [];
  const list = arrayValue(elements);
  const idCounts = new Map();
  for (const element of list) {
    const id = firstString(element?.id);
    if (!id) {
      errors.push(error('missing_bricks_element_id', 'A projected Bricks element has no ID.'));
      continue;
    }
    idCounts.set(id, (idCounts.get(id) || 0) + 1);
  }
  for (const [id, count] of idCounts) {
    if (count > 1) errors.push(error('duplicate_bricks_element_id', `Bricks element ID ${id} occurs ${count} times.`, { bricksElementId: id }));
  }
  const elementById = new Map(list
    .map((element) => [firstString(element?.id), element])
    .filter(([id]) => id));
  const provenanceById = new Map(arrayValue(provenance)
    .map((entry) => [firstString(entry?.bricksElementId), entry])
    .filter(([id]) => id));

  for (const [id] of provenanceById) {
    if (!elementById.has(id)) {
      errors.push(error(
        'stale_element_provenance',
        `Structure provenance references removed Bricks element ${id}.`,
        { bricksElementId: id },
      ));
    }
  }

  for (const element of list) {
    const id = firstString(element?.id);
    const parentId = firstString(element?.parent);
    const children = arrayValue(element?.children).map(firstString).filter(Boolean);
    if (!provenanceById.has(id)) {
      errors.push(error('missing_element_provenance', `Bricks element ${id || '(missing id)'} has no source or synthetic provenance.`, { bricksElementId: id }));
    } else {
      const record = provenanceById.get(id);
      if (record?.kind === 'synthetic' && !firstString(record?.reason)) {
        errors.push(error('missing_synthetic_reason', `Synthetic Bricks element ${id} has no deterministic reason.`, { bricksElementId: id }));
      }
    }
    if (parentId && !elementById.has(parentId)) {
      errors.push(error('missing_parent_element', `Bricks element ${id} references missing parent ${parentId}.`, { bricksElementId: id }));
    }
    if (parentId) {
      const parent = elementById.get(parentId);
      if (parent && !arrayValue(parent.children).map(firstString).includes(id)) {
        errors.push(error('parent_child_link_mismatch', `Parent ${parentId} does not list child ${id}.`, { bricksElementId: id }));
      }
    }
    const capability = getPixflowBricksElementCapability(element?.name, compatibilityContext);
    if (children.length > 0 && capability.nestable !== true) {
      errors.push(error('non_nestable_parent_element', `Bricks ${firstString(element?.name)} element ${id} cannot own projected children.`, { bricksElementId: id }));
    }
    for (const childId of children) {
      const child = elementById.get(childId);
      if (!child) {
        errors.push(error('missing_child_element', `Bricks element ${id} references missing child ${childId}.`, { bricksElementId: id }));
      } else if (firstString(child.parent) !== id) {
        errors.push(error('child_parent_link_mismatch', `Child ${childId} does not reference parent ${id}.`, { bricksElementId: id }));
      }
    }
    const attributes = objectValue(element?.settings)._attributes;
    if (attributes !== undefined && !Array.isArray(attributes)) {
      errors.push(error('invalid_bricks_attributes', `Bricks element ${id} attributes are not a list.`, { bricksElementId: id }));
    } else if (Array.isArray(attributes)) {
      const invalidAttribute = attributes.find((attribute) => (
        !firstString(attribute?.name)
        || (attribute?.value !== undefined && typeof attribute?.value !== 'string')
      ));
      if (invalidAttribute) {
        errors.push(error(
          'invalid_bricks_attribute_entry',
          `Bricks element ${id} contains an invalid attribute entry for ${firstString(invalidAttribute?.name, '(missing name)')}.`,
          { bricksElementId: id, attributeName: firstString(invalidAttribute?.name) },
        ));
      }
    }
    if (firstString(element?.name) === 'image' && !firstString(objectValue(objectValue(element?.settings).image).url)) {
      errors.push(error('missing_image_reference', `Image element ${id} has no media URL.`, { bricksElementId: id }));
    }
    if (
      ['html', 'code'].includes(firstString(element?.name).toLowerCase())
      && /<(?:html|head|body)\b/i.test(firstString(objectValue(element?.settings).html, objectValue(element?.settings).code))
    ) {
      errors.push(error(
        'document_shell_fallback_forbidden',
        `Fallback element ${id} contains a document shell instead of one bounded source subtree.`,
        { bricksElementId: id },
      ));
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

function buildElementRecord(node, nodeId, parentNodeId, order, runtimeEvidenceBySourceId) {
  const attributes = arrayValue(node?.attrList)
    .map((attribute) => ({ name: firstString(attribute?.name), value: String(attribute?.value ?? '') }))
    .filter((attribute) => attribute.name && attribute.name.toLowerCase() !== 'data-pf-source-id');
  const evidence = summarizeRuntimeEvidence(arrayValue(objectValue(runtimeEvidenceBySourceId)[nodeId]));
  const tag = firstString(node?.tag).toLowerCase();
  return {
    nodeId,
    type: 'element',
    tag,
    sourceIndex: positiveInteger(node?.sourceIndex),
    order,
    parentNodeId: firstString(parentNodeId),
    childNodeIds: [],
    text: '',
    role: firstString(objectValue(node?.attrs).role, semanticRole(tag)),
    attributes,
    classes: classList(objectValue(node?.attrs).class),
    runtimeEvidence: evidence,
    potentiallyVisible: !isKnownNonVisualSourceNode(node, tag)
      && evidence.hiddenAtEveryViewport !== true,
  };
}

function isKnownNonVisualSourceNode(node, tag) {
  const attrs = objectValue(node?.attrs);
  const style = firstString(attrs.style).toLowerCase();
  if (['script', 'style', 'meta', 'link', 'title', 'template', 'noscript'].includes(tag)) return true;
  if (tag === 'next-route-announcer' || firstString(attrs.id) === '__next-route-announcer__') return true;
  if (Object.prototype.hasOwnProperty.call(attrs, 'hidden') || firstString(attrs['aria-hidden']).toLowerCase() === 'true') return true;
  if (/(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0)/i.test(style)) return true;
  if (tag === 'iframe') {
    const width = Number.parseFloat(firstString(attrs.width));
    const height = Number.parseFloat(firstString(attrs.height));
    if (Number.isFinite(width) && Number.isFinite(height) && width <= 1 && height <= 1) return true;
  }
  if (tag === 'img' && !firstString(attrs.src, attrs['data-img'], attrs['data-src'], attrs.srcset)) {
    const marker = `${firstString(attrs.id)} ${firstString(attrs.class)}`.toLowerCase();
    if (/\b(?:lightbox|modal|preview|runtime|placeholder)\b/.test(marker)) return true;
  }
  return false;
}

function summarizeRuntimeEvidence(evidence) {
  if (evidence.length === 0) return unavailableRuntimeEvidence();
  let visibleViewportCount = 0;
  const geometry = [];
  for (const entry of evidence) {
    const styles = objectValue(entry?.styles);
    const box = objectValue(entry?.geometry || entry?.rect);
    const hidden = firstString(styles.display).toLowerCase() === 'none'
      || firstString(styles.visibility).toLowerCase() === 'hidden'
      || firstString(styles.opacity) === '0'
      || (Number(box.width) === 0 && Number(box.height) === 0);
    if (!hidden) visibleViewportCount += 1;
    geometry.push({
      viewport: firstString(objectValue(entry?.provenance).viewport),
      x: finiteNumber(box.x),
      y: finiteNumber(box.y),
      width: finiteNumber(box.width),
      height: finiteNumber(box.height),
      visible: !hidden,
    });
  }
  return {
    available: true,
    viewportCount: evidence.length,
    visibleViewportCount,
    hiddenAtEveryViewport: visibleViewportCount === 0,
    geometry,
  };
}

function unavailableRuntimeEvidence() {
  return {
    available: false,
    viewportCount: 0,
    visibleViewportCount: 0,
    hiddenAtEveryViewport: false,
    geometry: [],
  };
}

function structureNodeId(node, scope) {
  if (!node) return '';
  if (firstString(node.type) === 'text') return `${firstString(scope, 'page')}:text:${positiveInteger(node.sourceIndex)}`;
  return firstString(objectValue(node.attrs)['data-pf-source-id'], `${firstString(scope, 'page')}:element:${positiveInteger(node.sourceIndex)}`);
}

function semanticRole(tag) {
  const roles = {
    a: 'link',
    button: 'button',
    form: 'form',
    header: 'banner',
    footer: 'contentinfo',
    main: 'main',
    nav: 'navigation',
    aside: 'complementary',
    img: 'img',
  };
  if (/^h[1-6]$/.test(tag)) return 'heading';
  return roles[tag] || '';
}

function classList(value) {
  return String(value || '').split(/\s+/).map((item) => item.trim()).filter(Boolean);
}

function error(code, message, extra = {}) {
  return { code, severity: 'error', message, ...extra };
}

function warning(code, message, extra = {}) {
  return { code, severity: 'warning', message, ...extra };
}

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
