import type { Dict } from './types';

/** Display-only metadata. Never replace skill IDs, source bodies or saved mentions. */
export const SKILL_DISPLAY_KEYS: Record<string, { name: keyof Dict; description?: keyof Dict }> = {
  "frontend-design": { "name": "ui.skillDisplay.frontend-design.name", "description": "ui.skillDisplay.frontend-design.description" },
  "online-research": {
    "name": "ui.skillDisplay.online-research.name",
    "description": "ui.skillDisplay.online-research.description"
  },
  "wordpress-content": {
    "name": "ui.skillDisplay.wordpress-content.name",
    "description": "ui.skillDisplay.wordpress-content.description"
  },
  "wordpress-source": {
    "name": "ui.skillDisplay.wordpress-source.name",
    "description": "ui.skillDisplay.wordpress-source.description"
  },
  "pixflow-library": {
    "name": "ui.projectView.pixflowLibrary",
    "description": "ui.skillDisplay.pixflow-library.description"
  },
  "build-in-bricks-html-first": {
    "name": "ui.projectView.buildInBricksHtmlFirst",
    "description": "ui.skillDisplay.build-in-bricks-html-first.description"
  },
  "prototype-bricks": {
    "name": "ui.skillDisplay.prototype-bricks.name",
    "description": "ui.skillDisplay.prototype-bricks.description"
  },
  "website-clone": {
    "name": "ui.skillDisplay.website-clone.name",
    "description": "ui.skillDisplay.website-clone.description"
  },
  "html-to-bricks": {
    "name": "ui.skillDisplay.html-to-bricks.name",
    "description": "ui.skillDisplay.html-to-bricks.description"
  },
  "dynamic-data": {
    "name": "ui.skillDisplay.dynamic-data.name",
    "description": "ui.skillDisplay.dynamic-data.description"
  },
  "query-loops": {
    "name": "ui.skillDisplay.query-loops.name",
    "description": "ui.skillDisplay.query-loops.description"
  },
  "global-queries": {
    "name": "ui.skillDisplay.global-queries.name",
    "description": "ui.skillDisplay.global-queries.description"
  },
  "api-queries": {
    "name": "ui.skillDisplay.api-queries.name",
    "description": "ui.skillDisplay.api-queries.description"
  },
  "selected-element": {
    "name": "ui.skillDisplay.selected-element.name",
    "description": "ui.skillDisplay.selected-element.description"
  },
  "current-page": {
    "name": "ui.skillDisplay.current-page.name",
    "description": "ui.skillDisplay.current-page.description"
  },
  "bricks-schema": {
    "name": "ui.skillDisplay.bricks-schema.name",
    "description": "ui.skillDisplay.bricks-schema.description"
  },
  "bricks-settings": {
    "name": "ui.skillDisplay.bricks-settings.name",
    "description": "ui.skillDisplay.bricks-settings.description"
  },
  "bricks-elements": {
    "name": "ui.skillDisplay.bricks-elements.name",
    "description": "ui.skillDisplay.bricks-elements.description"
  },
  "bricks-controls": {
    "name": "ui.skillDisplay.bricks-controls.name",
    "description": "ui.skillDisplay.bricks-controls.description"
  },
  "element-controls": {
    "name": "ui.skillDisplay.element-controls.name",
    "description": "ui.skillDisplay.element-controls.description"
  },
  "bricks-conditions": {
    "name": "ui.skillDisplay.bricks-conditions.name",
    "description": "ui.skillDisplay.bricks-conditions.description"
  },
  "bricks-filters": {
    "name": "ui.skillDisplay.bricks-filters.name",
    "description": "ui.skillDisplay.bricks-filters.description"
  },
  "bricks-forms": {
    "name": "ui.skillDisplay.bricks-forms.name",
    "description": "ui.skillDisplay.bricks-forms.description"
  },
  "bricks-interactions": {
    "name": "ui.skillDisplay.bricks-interactions.name",
    "description": "ui.skillDisplay.bricks-interactions.description"
  },
  "design-tokens": {
    "name": "ui.skillDisplay.design-tokens.name",
    "description": "ui.skillDisplay.design-tokens.description"
  },
  "responsive": {
    "name": "ui.skillDisplay.responsive.name",
    "description": "ui.skillDisplay.responsive.description"
  },
  "interactions": {
    "name": "ui.skillDisplay.interactions.name",
    "description": "ui.skillDisplay.interactions.description"
  },
  "accessibility": {
    "name": "settings.designSystemsCraftAccessibility",
    "description": "ui.skillDisplay.accessibility.description"
  },
  "forms": {
    "name": "connectors.category.forms",
    "description": "ui.skillDisplay.forms.description"
  },
  "woocommerce": {
    "name": "ui.skillDisplay.woocommerce.name",
    "description": "ui.skillDisplay.woocommerce.description"
  },
  "custom-code": {
    "name": "ui.skillDisplay.custom-code.name",
    "description": "ui.skillDisplay.custom-code.description"
  },
  "bricks-generated-media": {
    "name": "ui.skillDisplay.bricks-generated-media.name",
    "description": "ui.skillDisplay.bricks-generated-media.description"
  },
  "etch-live-editor": {
    "name": "ui.skillDisplay.etch-live-editor.name",
    "description": "ui.skillDisplay.etch-live-editor.description"
  },
  "elementor-live-editor": {
    "name": "ui.skillDisplay.elementor-live-editor.name",
    "description": "ui.skillDisplay.elementor-live-editor.description"
  },
  "pixflow-design-systems": {
    "name": "automations.filterDesignSystems",
    "description": "ui.skillDisplay.pixflow-design-systems.description"
  },
  "agent-browser": {
    "name": "ui.skillDisplay.agent-browser.name",
    "description": "ui.skillDisplay.agent-browser.description"
  },
  "brandkit": {
    "name": "ui.skillDisplay.brandkit.name",
    "description": "ui.skillDisplay.brandkit.description"
  },
  "design-brief": {
    "name": "ui.pixflowDesignSystemLibrary.designBrief",
    "description": "ui.skillDisplay.design-brief.description"
  },
  "ecommerce-image-workflow": {
    "name": "ui.skillDisplay.ecommerce-image-workflow.name",
    "description": "ui.skillDisplay.ecommerce-image-workflow.description"
  },
  "emil-design-eng": {
    "name": "ui.skillDisplay.emil-design-eng.name",
    "description": "ui.skillDisplay.emil-design-eng.description"
  },
  "emilkowalski-motion": {
    "name": "ui.skillDisplay.emilkowalski-motion.name",
    "description": "ui.skillDisplay.emilkowalski-motion.description"
  },
  "export-download-debugging": {
    "name": "ui.skillDisplay.export-download-debugging.name",
    "description": "ui.skillDisplay.export-download-debugging.description"
  },
  "gsap-core": {
    "name": "ui.skillDisplay.gsap-core.name",
    "description": "ui.skillDisplay.gsap-core.description"
  },
  "gsap-frameworks": {
    "name": "ui.skillDisplay.gsap-frameworks.name",
    "description": "ui.skillDisplay.gsap-frameworks.description"
  },
  "gsap-performance": {
    "name": "ui.skillDisplay.gsap-performance.name",
    "description": "ui.skillDisplay.gsap-performance.description"
  },
  "gsap-plugins": {
    "name": "ui.skillDisplay.gsap-plugins.name",
    "description": "ui.skillDisplay.gsap-plugins.description"
  },
  "gsap-react": {
    "name": "ui.skillDisplay.gsap-react.name",
    "description": "ui.skillDisplay.gsap-react.description"
  },
  "gsap-scrolltrigger": {
    "name": "ui.skillDisplay.gsap-scrolltrigger.name",
    "description": "ui.skillDisplay.gsap-scrolltrigger.description"
  },
  "gsap-timeline": {
    "name": "ui.skillDisplay.gsap-timeline.name",
    "description": "ui.skillDisplay.gsap-timeline.description"
  },
  "gsap-utils": {
    "name": "ui.skillDisplay.gsap-utils.name",
    "description": "ui.skillDisplay.gsap-utils.description"
  },
  "image-to-code": {
    "name": "ui.skillDisplay.image-to-code.name",
    "description": "ui.skillDisplay.image-to-code.description"
  },
  "reference-design-contract": {
    "name": "ui.skillDisplay.reference-design-contract.name",
    "description": "ui.skillDisplay.reference-design-contract.description"
  },
  "review-animations": {
    "name": "ui.skillDisplay.review-animations.name",
    "description": "ui.skillDisplay.review-animations.description"
  },
  "stitch-design-taste": {
    "name": "ui.skillDisplay.stitch-design-taste.name",
    "description": "ui.skillDisplay.stitch-design-taste.description"
  },
  "web-clone": {
    "name": "ui.skillDisplay.web-clone.name",
    "description": "ui.skillDisplay.web-clone.description"
  },
  "web-design-guidelines": {
    "name": "ui.skillDisplay.web-design-guidelines.name",
    "description": "ui.skillDisplay.web-design-guidelines.description"
  },
  "writing-guidelines": {
    "name": "ui.skillDisplay.writing-guidelines.name",
    "description": "ui.skillDisplay.writing-guidelines.description"
  }
};
