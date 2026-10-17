import { installEditorSaveGuard, type EditorRevisions } from './editor-save-guard';

const host = window as unknown as { pixflowEditorRevisions?: EditorRevisions; pixflowSaveGuardInstalled?: boolean };
if (host.pixflowEditorRevisions && !host.pixflowSaveGuardInstalled) {
  host.pixflowSaveGuardInstalled = true;
  installEditorSaveGuard(host.pixflowEditorRevisions, () => {
    window.dispatchEvent(new CustomEvent('pixflow-design:editor-save-conflict'));
    if (document.getElementById('pixflow-editor-save-conflict')) return;
    const notice = document.createElement('div');
    notice.id = 'pixflow-editor-save-conflict';
    notice.setAttribute('role', 'alert');
    notice.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:2147483647;max-width:480px;width:calc(100% - 48px);padding:16px 20px;border-radius:16px;background:#292929;color:#f3f3f3;font:13px/1.5 system-ui;box-shadow:0 8px 32px #0004;';
    const title = document.createElement('strong');
    title.textContent = 'This editor is behind the saved version';
    const message = document.createElement('div');
    message.textContent = 'Saving was blocked to protect newer changes. Keep a copy of your unsaved work, then reload this tab and reconcile the latest version.';
    message.style.marginTop = '4px';
    notice.append(title, message);
    document.body.append(notice);
  });
}
