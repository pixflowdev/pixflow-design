import { access, chmod, mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { tmpdir } from "node:os";
import path, { join } from "node:path";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const runWebStandaloneAfterPack = require("../resources/web-standalone-after-pack.cjs") as (context: unknown) => Promise<void>;

const CONFIG_ENV = "OD_TOOLS_PACK_WEB_STANDALONE_HOOK_CONFIG";
const darwinSymlinkIt = process.platform === "win32" ? it.skip : it;

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writePackage(packageRoot: string, packageName: string): Promise<void> {
  await mkdir(packageRoot, { recursive: true });
  await writeFile(
    join(packageRoot, "package.json"),
    `${JSON.stringify({ name: packageName, version: "0.0.0" }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(join(packageRoot, "index.js"), "module.exports = {};\n", "utf8");
}

async function writePnpmLinkedPackage(standaloneRoot: string, packageName: string): Promise<string> {
  const packageDirectoryName = `${packageName}@0.0.0`.split("/").join("+");
  const packageRoot = join(standaloneRoot, "node_modules", ".pnpm", packageDirectoryName, "node_modules", packageName);
  const hoistPath = join(standaloneRoot, "node_modules", ".pnpm", "node_modules", packageName);
  await writePackage(packageRoot, packageName);
  await mkdir(path.dirname(hoistPath), { recursive: true });
  await symlink(packageRoot, hoistPath);
  return packageRoot;
}

async function writeRootWebPackage(resourcesRoot: string): Promise<void> {
  const webPackageRoot = join(resourcesRoot, "app", "node_modules", "@open-design", "web");
  await mkdir(join(webPackageRoot, "dist", "sidecar"), { recursive: true });
  await writeFile(join(webPackageRoot, "package.json"), "{\"name\":\"@open-design/web\"}\n", "utf8");
  await writeFile(join(webPackageRoot, "dist", "sidecar", "index.js"), "module.exports = {};\n", "utf8");
}

async function writeStandaloneFixture(
  workspaceRoot: string,
  options: { includeHoistedNext: boolean; includeWebNext: boolean; useAbsolutePnpmSymlinks?: boolean },
): Promise<string> {
  const standaloneRoot = join(workspaceRoot, "apps", "web", ".next", "standalone");
  const sourceWebRoot = join(standaloneRoot, "apps", "web");
  const hoistRoot = join(standaloneRoot, "node_modules", ".pnpm", "node_modules");

  if (options.useAbsolutePnpmSymlinks) {
    const nextPackageRoot = options.includeHoistedNext ? await writePnpmLinkedPackage(standaloneRoot, "next") : null;
    await writePnpmLinkedPackage(standaloneRoot, "react");
    await writePnpmLinkedPackage(standaloneRoot, "react-dom");
    await writePnpmLinkedPackage(standaloneRoot, "styled-jsx");
    if (options.includeWebNext && nextPackageRoot != null) {
      await mkdir(join(sourceWebRoot, "node_modules"), { recursive: true });
      await symlink(nextPackageRoot, join(sourceWebRoot, "node_modules", "next"));
    }
  } else {
    if (options.includeHoistedNext) {
      await writePackage(join(hoistRoot, "next"), "next");
    }
    await writePackage(join(hoistRoot, "react"), "react");
    await writePackage(join(hoistRoot, "react-dom"), "react-dom");
    await writePackage(join(hoistRoot, "styled-jsx"), "styled-jsx");
    if (options.includeWebNext) {
      await writePackage(join(sourceWebRoot, "node_modules", "next"), "next");
    }
  }

  await mkdir(join(sourceWebRoot, ".next", "static"), { recursive: true });
  await mkdir(join(sourceWebRoot, "dist", "sidecar"), { recursive: true });
  await writeFile(join(sourceWebRoot, "dist", "sidecar", "next-cache-handler.js"), 'export default class PackagedNextCache {}\n');
  await writeFile(
    join(sourceWebRoot, "server.js"),
    `module.exports = { outputFileTracingRoot: ${JSON.stringify(workspaceRoot)} };\n`,
    "utf8",
  );
  await mkdir(join(standaloneRoot, "node_modules", ".bin"), { recursive: true });
  await writeFile(
    join(standaloneRoot, "node_modules", ".bin", "loose-envify.CMD"),
    `@SET "NODE_PATH=${workspaceRoot}\\node_modules\\.pnpm\\node_modules"\n`,
    "utf8",
  );
  await writeFile(join(sourceWebRoot, ".next", "BUILD_ID"), "fixture\n", "utf8");

  await mkdir(join(workspaceRoot, "apps", "web", ".next", "static"), { recursive: true });
  await writeFile(join(workspaceRoot, "apps", "web", ".next", "static", "client.js"), "client();\n", "utf8");

  return standaloneRoot;
}

async function runFixture(options: {
  includeHoistedNext?: boolean;
  includeWebNext: boolean;
  macAdhocBundleSign?: boolean;
  omitMacAdhocBundleSign?: boolean;
  omitRootWebPackage?: boolean;
  omitCacheHandler?: boolean;
  moduleServerBootstrap?: boolean;
  omitCommonjsServer?: boolean;
  platformName?: "darwin" | "win32";
  requireRootWebPackageAudit?: boolean;
  useAbsolutePnpmSymlinks?: boolean;
  writeMacCodeBundleFixture?: boolean;
}): Promise<{
  appOutDir: string;
  auditReportPath: string;
  destinationRoot: string;
  root: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "open-design-web-standalone-hook-"));
  const workspaceRoot = join(root, "workspace");
  const standaloneSourceRoot = await writeStandaloneFixture(workspaceRoot, {
    includeHoistedNext: options.includeHoistedNext ?? true,
    includeWebNext: options.includeWebNext,
    useAbsolutePnpmSymlinks: options.useAbsolutePnpmSymlinks,
  });
  if (options.omitCacheHandler) await rm(join(standaloneSourceRoot, 'apps/web/dist/sidecar/next-cache-handler.js'));
  if (options.moduleServerBootstrap) {
    const web = join(standaloneSourceRoot, 'apps/web');
    await writeFile(join(web, 'server.cjs'), await readFile(join(web, 'server.js')));
    await writeFile(join(web, 'server.js'), "import './server.cjs';\n");
    await writeFile(join(web, 'package.json'), '{"name":"@open-design/web","type":"module"}\n');
  }
  if (options.omitCommonjsServer) await rm(join(standaloneSourceRoot, 'apps/web/server.cjs'), { force: true });
  const platformName = options.platformName ?? "win32";
  const appOutDir = join(root, "builder", platformName === "darwin" ? "mac-arm64" : "win-unpacked");
  const resourcesRoot = platformName === "darwin"
    ? join(appOutDir, "Open Design.app", "Contents", "Resources")
    : join(appOutDir, "resources");
  const appPath = join(appOutDir, "Open Design.app");
  const auditReportPath = join(root, "audit.json");
  const configPath = join(root, "config.json");
  const oldConfigEnv = process.env[CONFIG_ENV];

  await mkdir(resourcesRoot, { recursive: true });
  if (platformName === "darwin" && options.writeMacCodeBundleFixture) {
    const frameworksRoot = join(appPath, "Contents", "Frameworks");
    const electronFrameworkRoot = join(frameworksRoot, "Electron Framework.framework");
    await mkdir(join(electronFrameworkRoot, "Resources"), { recursive: true });
    await mkdir(join(electronFrameworkRoot, "Versions", "A", "Resources"), { recursive: true });
    await mkdir(join(electronFrameworkRoot, "Versions", "Current", "Resources"), { recursive: true });
    await writeFile(join(electronFrameworkRoot, "Electron Framework"), "binary\n", "utf8");
    await writeFile(join(electronFrameworkRoot, "Versions", "A", "Electron Framework"), Buffer.from([0xcf, 0xfa, 0xed, 0xfe]));
    await writeFile(join(electronFrameworkRoot, "Versions", "Current", "Electron Framework"), "binary\n", "utf8");
    await mkdir(join(frameworksRoot, "ReactiveObjC.framework"), { recursive: true });
    await mkdir(join(frameworksRoot, "Open Design Helper.app"), { recursive: true });
    const helpersRoot = join(electronFrameworkRoot, "Versions", "A", "Helpers");
    await mkdir(helpersRoot, { recursive: true });
    await writeFile(join(helpersRoot, "chrome_crashpad_handler"), Buffer.from([0xcf, 0xfa, 0xed, 0xfe]));
  }
  if (options.omitRootWebPackage !== true) {
    await writeRootWebPackage(resourcesRoot);
  }
  await writeFile(
    configPath,
    `${JSON.stringify(
      {
        auditReportPath,
        ...(options.omitMacAdhocBundleSign ? {} : { macAdhocBundleSign: options.macAdhocBundleSign ?? false }),
        pruneCopiedSharp: false,
        pruneRootNext: false,
        pruneRootSharp: false,
        ...(options.requireRootWebPackageAudit == null
          ? {}
          : { requireRootWebPackageAudit: options.requireRootWebPackageAudit }),
        resourceName: "open-design-web-standalone",
        standaloneSourceRoot,
        version: 1,
        webPublicSourceRoot: join(workspaceRoot, "apps", "web", "public"),
        webStaticSourceRoot: join(workspaceRoot, "apps", "web", ".next", "static"),
        workspaceRoot,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  process.env[CONFIG_ENV] = configPath;
  try {
    await runWebStandaloneAfterPack({
      appOutDir,
      electronPlatformName: platformName,
      packager: { appInfo: { productFilename: "Open Design" } },
    });
  } catch (error) {
    await rm(root, { force: true, recursive: true });
    throw error;
  } finally {
    if (oldConfigEnv == null) {
      delete process.env[CONFIG_ENV];
    } else {
      process.env[CONFIG_ENV] = oldConfigEnv;
    }
  }

  return {
    appOutDir,
    auditReportPath,
    destinationRoot: join(resourcesRoot, "open-design-web-standalone"),
    root,
  };
}

describe("web standalone afterPack hook", () => {
  it('fails packaging when the ESM bootstrap is missing its generated CommonJS companion', async () => {
    let copied: Awaited<ReturnType<typeof runFixture>> | undefined;
    try {
      await expect(runFixture({ includeWebNext: true, moduleServerBootstrap: true, omitCommonjsServer: true })
        .then(fixture => { copied = fixture; return fixture; })).rejects.toThrow(/server\.cjs/);
    } finally { if (copied) await rm(copied.root, { force: true, recursive: true }); }
  });
  it('preserves an ESM bootstrap, generated CommonJS server and ESM cache handler together', async () => {
    const fixture = await runFixture({ includeWebNext: true, moduleServerBootstrap: true });
    try {
      const web = join(fixture.destinationRoot, 'apps/web');
      expect(JSON.parse(await readFile(join(web, 'package.json'), 'utf8')).type).toBe('module');
      const result = execFileSync(process.execPath, ['--input-type=module', '-e',
        `await import(${JSON.stringify(pathToFileURL(join(web, 'server.js')).href)}); const {default: Handler} = await import(${JSON.stringify(pathToFileURL(join(web, 'dist/sidecar/next-cache-handler.js')).href)}); console.log(Handler.name);`,
      ], { encoding: 'utf8', windowsHide: true });
      expect(result.trim()).toBe('PackagedNextCache');
      expect(await readFile(join(web, 'server.cjs'), 'utf8')).not.toContain(fixture.root);
    } finally { await rm(fixture.root, { force: true, recursive: true }); }
  });
  it('fails packaging when the compiled cache handler was not traced', async () => {
    await expect(runFixture({ includeWebNext: true, omitCacheHandler: true })).rejects.toThrow(/next-cache-handler/);
  });
  it("deduplicates win32 copied standalone Next while retaining the app-local Next package", async () => {
    const fixture = await runFixture({ includeWebNext: true });

    try {
      expect(await pathExists(join(fixture.destinationRoot, "node_modules", "next"))).toBe(false);
      expect(await pathExists(join(fixture.destinationRoot, "node_modules", ".pnpm", "node_modules", "next"))).toBe(false);
      expect(await pathExists(join(fixture.destinationRoot, "apps", "web", "node_modules", "next", "package.json"))).toBe(true);
      expect(await readFile(join(fixture.destinationRoot, "apps", "web", "dist", "sidecar", "next-cache-handler.js"), 'utf8')).toContain('PackagedNextCache');

      const report = JSON.parse(await readFile(fixture.auditReportPath, "utf8")) as {
        copiedAudit: { resolvedModules: Record<string, string>; brokenSymlinks: string[] };
        copiedBuildResiduePrune: Array<{ count: number }>;
        copiedNextDedupe: { removedPaths: Array<{ reason: string }>; retainedPath: string };
        copiedNextDedupeAudit: { resolvedNextPackagePath: string; remainingPaths: string[] };
        copiedSourcePathAudit: { matches: unknown[] };
        copiedSourcePathScrub: Array<{ files: string[] }>;
      };
      const resolvedNextPath = report.copiedNextDedupeAudit.resolvedNextPackagePath.split(path.sep).join("/");

      expect(report.copiedNextDedupe.removedPaths.map((entry) => entry.reason)).toEqual([
        "copied standalone root next public-hoist duplicate",
        "copied standalone pnpm-hoisted next duplicate superseded by app-local next",
      ]);
      expect(report.copiedNextDedupe.retainedPath.split(path.sep).join("/")).toMatch(
        /apps\/web\/node_modules\/next$/,
      );
      expect(report.copiedNextDedupeAudit.remainingPaths).toEqual([]);
      expect(resolvedNextPath).toMatch(
        /open-design-web-standalone\/apps\/web\/node_modules\/next\/package\.json$/,
      );
      expect(report.copiedAudit.brokenSymlinks).toEqual([]);
      expect(report.copiedSourcePathAudit.matches).toEqual([]);
      expect(report.copiedSourcePathScrub[0].files).toContain("apps/web/server.js");
      expect(report.copiedBuildResiduePrune[0].count).toBeGreaterThan(0);
      expect(report.copiedAudit.resolvedModules["next/package.json"].split(path.sep).join("/")).toMatch(
        /open-design-web-standalone\/apps\/web\/node_modules\/next\/package\.json$/,
      );
      expect(await pathExists(join(fixture.destinationRoot, "node_modules", ".bin", "loose-envify.CMD"))).toBe(false);
      const server = await readFile(join(fixture.destinationRoot, "apps", "web", "server.js"), "utf8");
      expect(server).not.toContain(fixture.root);
      expect(server).toContain("__PACKAGED_OPEN_DESIGN_WEB_STANDALONE_ROOT__");
    } finally {
      await rm(fixture.root, { force: true, recursive: true });
    }
  });

  it("fails the win32 Next dedupe when no copied Next package exists", async () => {
    await expect(runFixture({ includeHoistedNext: false, includeWebNext: false })).rejects.toThrow(
      /copied standalone app-local Next package missing/,
    );
  });

  it("defaults the mac ad-hoc signing hook option off for win32 configs", async () => {
    const fixture = await runFixture({ includeWebNext: true, omitMacAdhocBundleSign: true });

    try {
      const report = JSON.parse(await readFile(fixture.auditReportPath, "utf8")) as {
        macAdhocBundleSign: unknown[];
        platformName: string;
      };

      expect(report.platformName).toBe("win32");
      expect(report.macAdhocBundleSign).toEqual([]);
    } finally {
      await rm(fixture.root, { force: true, recursive: true });
    }
  });

  it("allows win32 prebundle mode to omit the root web package audit", async () => {
    const fixture = await runFixture({
      includeWebNext: true,
      omitRootWebPackage: true,
      requireRootWebPackageAudit: false,
    });

    try {
      const report = JSON.parse(await readFile(fixture.auditReportPath, "utf8")) as {
        rootWebPackageAudit: unknown;
      };

      expect(report.rootWebPackageAudit).toBeNull();
    } finally {
      await rm(fixture.root, { force: true, recursive: true });
    }
  });

  darwinSymlinkIt("rewrites darwin copied pnpm symlinks to stay inside the packaged resource", async () => {
    const fixture = await runFixture({
      includeWebNext: true,
      platformName: "darwin",
      useAbsolutePnpmSymlinks: true,
    });

    try {
      const report = JSON.parse(await readFile(fixture.auditReportPath, "utf8")) as {
        copiedAudit: { externalSymlinks: string[]; resolvedModules: Record<string, string> };
      };
      const copiedNextLink = join(fixture.destinationRoot, "apps", "web", "node_modules", "next");
      const nextTarget = await readlink(copiedNextLink);

      expect(path.isAbsolute(nextTarget)).toBe(false);
      expect(report.copiedAudit.externalSymlinks).toEqual([]);
      expect(report.copiedAudit.resolvedModules["next/package.json"].split(path.sep).join("/")).toMatch(
        /open-design-web-standalone\/node_modules\/\.pnpm\/next@0\.0\.0\/node_modules\/next\/package\.json$/,
      );
    } finally {
      await rm(fixture.root, { force: true, recursive: true });
    }
  });

  darwinSymlinkIt("signs versioned mac frameworks at their Current version path", async () => {
    const codesignRoot = await mkdtemp(join(tmpdir(), "open-design-fake-codesign-"));
    const codesignBin = join(codesignRoot, "bin");
    const codesignLog = join(codesignRoot, "codesign.log");
    const oldPath = process.env.PATH;
    const oldCodesignLog = process.env.OD_FAKE_CODESIGN_LOG;

    await mkdir(codesignBin, { recursive: true });
    await writeFile(
      join(codesignBin, "codesign"),
      "#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"$OD_FAKE_CODESIGN_LOG\"\n",
      "utf8",
    );
    await chmod(join(codesignBin, "codesign"), 0o755);

    process.env.PATH = `${codesignBin}${path.delimiter}${oldPath ?? ""}`;
    process.env.OD_FAKE_CODESIGN_LOG = codesignLog;

    let fixture: Awaited<ReturnType<typeof runFixture>> | null = null;
    try {
      fixture = await runFixture({
        includeWebNext: true,
        macAdhocBundleSign: true,
        platformName: "darwin",
        writeMacCodeBundleFixture: true,
      });

      const report = JSON.parse(await readFile(fixture.auditReportPath, "utf8")) as {
        macAdhocBundleSign: string[];
      };
      const signedTargets = report.macAdhocBundleSign.map((target) => target.split(path.sep).join("/"));
      const codesignInvocations = await readFile(codesignLog, "utf8");

      expect(signedTargets).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/Electron Framework\.framework\/Versions\/Current$/),
          expect.stringMatching(/ReactiveObjC\.framework$/),
          expect.stringMatching(/Open Design Helper\.app$/),
          expect.stringMatching(/Open Design\.app$/),
        ]),
      );
      expect(signedTargets).not.toContainEqual(expect.stringMatching(/Electron Framework\.framework$/));
      const crashpadIndex = signedTargets.findIndex(target => target.endsWith('/Helpers/chrome_crashpad_handler'));
      const frameworkIndex = signedTargets.findIndex(target => target.endsWith('/Electron Framework.framework/Versions/Current'));
      expect(crashpadIndex).toBeGreaterThanOrEqual(0);
      expect(crashpadIndex).toBeLessThan(frameworkIndex);
      expect(crashpadIndex).toBeLessThan(signedTargets.findIndex(target => target.endsWith('/Versions/A/Electron Framework')));
      await expect(
        readlink(join(
          fixture.appOutDir,
          "Open Design.app",
          "Contents",
          "Frameworks",
          "Electron Framework.framework",
          "Versions",
          "Current",
        )),
      ).resolves.toBe("A");
      await expect(
        readlink(join(
          fixture.appOutDir,
          "Open Design.app",
          "Contents",
          "Frameworks",
          "Electron Framework.framework",
          "Electron Framework",
        )),
      ).resolves.toBe("Versions/Current/Electron Framework");
      await expect(
        readlink(join(
          fixture.appOutDir,
          "Open Design.app",
          "Contents",
          "Frameworks",
          "Electron Framework.framework",
          "Resources",
        )),
      ).resolves.toBe("Versions/Current/Resources");
      expect(codesignInvocations.split(path.sep).join("/")).toContain(
        "Electron Framework.framework/Versions/Current",
      );
    } finally {
      if (fixture != null) {
        await rm(fixture.root, { force: true, recursive: true });
      }
      await rm(codesignRoot, { force: true, recursive: true });
      if (oldPath == null) {
        delete process.env.PATH;
      } else {
        process.env.PATH = oldPath;
      }
      if (oldCodesignLog == null) {
        delete process.env.OD_FAKE_CODESIGN_LOG;
      } else {
        process.env.OD_FAKE_CODESIGN_LOG = oldCodesignLog;
      }
    }
  });
});
