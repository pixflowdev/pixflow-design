import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { createBridgeStartupShortcutScripts } from "../src/win/custom-installer.js";
import { resolveWinInstallIdentity } from "../src/win/identity.js";

describe("resolveWinInstallIdentity", () => {
  it("keeps the default namespace on the canonical Windows display name", () => {
    expect(resolveWinInstallIdentity({ namespace: "default" })).toMatchObject({
      displayName: "Pixflow Design",
      shortcutName: "Pixflow Design.lnk",
      uninstallerName: "Uninstall Pixflow Design.exe",
    });
  });

  it("uses the canonical Windows display name for stable release namespaces", () => {
    expect(resolveWinInstallIdentity({ namespace: "release-stable-win" })).toMatchObject({
      appPathsKey: "Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Pixflow Design.exe",
      displayName: "Pixflow Design",
      registryKey: "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Open Design-release-stable-win",
      shortcutName: "Pixflow Design.lnk",
      uninstallerName: "Uninstall Pixflow Design.exe",
    });
  });

  it("uses first-class beta display identity for beta release namespaces", () => {
    expect(resolveWinInstallIdentity({ namespace: "release-beta-win" })).toMatchObject({
      appPathsKey: "Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Pixflow Design Beta.exe",
      displayName: "Pixflow Design Beta",
      registryKey: "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Open Design-release-beta-win",
      shortcutName: "Pixflow Design Beta.lnk",
      uninstallerName: "Uninstall Pixflow Design Beta.exe",
    });
  });

  it("keeps non-release beta-like namespaces isolated from the real beta channel identity", () => {
    expect(resolveWinInstallIdentity({ namespace: "beta-local-flow" })).toMatchObject({
      appPathsKey: "Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Pixflow Design beta-local-flow.exe",
      displayName: "Pixflow Design beta-local-flow",
      registryKey: "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Open Design-beta-local-flow",
      shortcutName: "Pixflow Design beta-local-flow.lnk",
      uninstallerName: "Uninstall Pixflow Design beta-local-flow.exe",
    });
  });

  it("uses first-class preview display identity for preview release namespaces", () => {
    expect(resolveWinInstallIdentity({ namespace: "release-preview-win" })).toMatchObject({
      appPathsKey: "Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Pixflow Design Preview.exe",
      displayName: "Pixflow Design Preview",
      registryKey: "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Open Design-release-preview-win",
      shortcutName: "Pixflow Design Preview.lnk",
      uninstallerName: "Uninstall Pixflow Design Preview.exe",
    });
  });

  it("uses first-class nightly display identity for nightly release versions and namespaces", () => {
    expect(resolveWinInstallIdentity({
      appVersion: "0.8.0.nightly.2",
      namespace: "release-stable-win",
    })).toMatchObject({
      appPathsKey: "Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Pixflow Design Nightly.exe",
      displayName: "Pixflow Design Nightly",
      registryKey: "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Open Design-release-stable-win",
      shortcutName: "Pixflow Design Nightly.lnk",
      uninstallerName: "Uninstall Pixflow Design Nightly.exe",
    });
    expect(resolveWinInstallIdentity({ namespace: "release-nightly-win" })).toMatchObject({
      displayName: "Pixflow Design Nightly",
      shortcutName: "Pixflow Design Nightly.lnk",
    });
  });

  it("keeps the registry DisplayName free of the package version", async () => {
    const source = await readFile(new URL("../src/win/custom-installer.ts", import.meta.url), "utf8");
    expect(source).toContain('WriteRegStr HKCU "${registryKey}" "DisplayName" "${productName}"');
    expect(source).not.toContain('"DisplayName" "${productName} \\${APP_VERSION}"');
  });

  it("checks the silent install target directory for running instances before overwriting files", async () => {
    const source = await readFile(new URL("../src/win/custom-installer.ts", import.meta.url), "utf8");
    const silentCheck = source.slice(source.indexOf("silent_check:"), source.indexOf("IfFileExists \"$INSTDIR\\\\${exeName}\" existing_install"));
    expect(silentCheck).toContain('IfFileExists "$INSTDIR\\\\${exeName}" 0 silent_detect_running_instances');
    expect(silentCheck).toContain('StrCpy $RunningInstancesInstallRoot "$INSTDIR"');
    expect(silentCheck.indexOf('StrCpy $RunningInstancesInstallRoot "$INSTDIR"')).toBeLessThan(
      silentCheck.indexOf("Call DetectRunningInstances"),
    );
  });

  it("passes the bridge executable name into running-instance detection so stale installs are closed", async () => {
    const source = await readFile(new URL("../src/win/custom-installer.ts", import.meta.url), "utf8");
    expect(source).toContain('const runningProcessName = PRODUCT_BRIDGE_TRAY_MODE ? exeName : "";');
    expect(source).toContain("[string]$ProcessName");
    expect(source).toContain("$expectedProcessName");
    expect(source).toContain('"$ExistingInstallLocation" "${runningProcessName}"');
    expect(source).toContain('"$INSTDIR" "$INSTDIR" "${runningProcessName}"');
  });

  it("syncs launcher runtime metadata after a successful Windows install", async () => {
    const source = await readFile(new URL("../src/win/custom-installer.ts", import.meta.url), "utf8");
    expect(source).toContain("Function SyncLauncherRuntime");
    expect(source).toContain("buildInitialLauncherRuntimeDescriptor(config, packagedVersion)");
    expect(source).toContain('Push "event=launcher_runtime_after_write path=${runtimePath}"');
    expect(source.indexOf('Push "event=registry_after_write key=${registryKey} appPathsKey=${appPathsKey}"')).toBeLessThan(
      source.indexOf("Call SyncLauncherRuntime"),
    );
    expect(source.indexOf("Call SyncLauncherRuntime")).toBeLessThan(source.indexOf('Push "install section done"'));
  });

  it("keeps installer diagnostic log events ASCII-only for silent overwrite", async () => {
    const source = await readFile(new URL("../src/win/custom-installer.ts", import.meta.url), "utf8");
    expect(source).toContain('Push "existing installation found; silent install will update app files and preserve user data"');
    expect(source).not.toContain('Push "$(ExistingInstallSilentOverwrite)"');
  });

  it("migrates bridge tray installs from legacy startup scripts to an icon-bearing shortcut", async () => {
    const source = await readFile(new URL("../src/win/custom-installer.ts", import.meta.url), "utf8");
    expect(source).toContain("function createBridgeStartupShortcutScripts");
    expect(source).toContain('Delete "$SMSTARTUP\\\\Pixflow Design Bridge.cmd"');
    expect(source).toContain('CreateShortCut "$SMSTARTUP\\\\${shortcutName}" "$INSTDIR\\\\${exeName}" "" "${installedIconPath}" 0');
    expect(source).toContain('Delete "$SMSTARTUP\\\\${shortcutName}"');
    expect(source).toContain("createBridgeStartupShortcutScripts(PRODUCT_BRIDGE_TRAY_MODE");

    const bridgeScripts = createBridgeStartupShortcutScripts(
      true,
      "Pixflow Design Bridge.lnk",
      "Pixflow Design Bridge.exe",
      "$INSTDIR\\resources\\icon.ico",
    );
    expect(bridgeScripts.install).toContain('CreateShortCut "$SMSTARTUP\\Pixflow Design Bridge.lnk"');
    expect(bridgeScripts.install).toContain('"$INSTDIR\\Pixflow Design Bridge.exe"');
    expect(bridgeScripts.install).toContain('"$INSTDIR\\resources\\icon.ico"');
    expect(bridgeScripts.uninstall).toContain('Delete "$SMSTARTUP\\Pixflow Design Bridge.lnk"');
    expect(createBridgeStartupShortcutScripts(false, "Pixflow Design.lnk", "Pixflow Design.exe", "$INSTDIR\\resources\\icon.ico"))
      .toEqual({ install: "", uninstall: "" });
  });

  it("removes the current legacy bridge startup filename during source-install migration", async () => {
    const source = await readFile(new URL("../../pixflow-design-bridge/install.mjs", import.meta.url), "utf8");
    const cleanup = source.slice(source.indexOf("async function removeLegacyWindowsAutostart"), source.indexOf("async function readJson"));
    expect(cleanup).toContain("path.join(startupDir, 'Pixflow Design Bridge.cmd')");
    expect(cleanup).toContain("['/Delete', '/TN', 'Pixflow Design Bridge', '/F']");
  });
});
