import { createHash } from "node:crypto";
import { chmod, copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ToolPackConfig } from "../config.js";
import { execFileAsync } from "./commands.js";

// Match the Windows dictation release, without requiring build tools on users' Macs.
const revision = "d1be6fde11ac6e0407606b4e42fe72d34add8037";
const sourceSha256 = "645445da884df6dbd52b30f82d7be7c01d1767c938714e477e786b88d529e9f4";
const sourceBytes = 9631456;

export function verifyMacDictationSource(bytes: Buffer): void {
  if (bytes.length !== sourceBytes || createHash("sha256").update(bytes).digest("hex") !== sourceSha256) {
    throw new Error("Mac dictation source archive failed verification");
  }
}

export async function bundleMacDictation(config: ToolPackConfig, resourceRoot: string): Promise<void> {
  if (process.platform !== "darwin" || !["arm64", "x64"].includes(process.arch)) {
    throw new Error("Mac dictation must be built on a supported Mac architecture");
  }
  const arch = process.arch === "x64" ? "x86_64" : "arm64";
  const root = join(config.roots.cacheRoot, "dictation", `${revision}-${arch}-cpu-v2`);
  const source = join(root, `whisper.cpp-${revision}`);
  const build = join(root, "build");
  const binary = join(build, "bin", "whisper-cli");
  const complete = join(root, "complete.json");
  await mkdir(root, { recursive: true });
  const cached = await readFile(complete, "utf8").catch(() => null);
  const currentHash = await readFile(binary).then(data => createHash("sha256").update(data).digest("hex"), () => null);
  if (!currentHash || cached !== JSON.stringify({ revision, arch, sha256: currentHash })) {
    const archive = join(root, "source.tar.gz");
    let bytes = await readFile(archive).catch(() => null);
    if (!bytes) {
      const response = await fetch(`https://codeload.github.com/ggml-org/whisper.cpp/tar.gz/${revision}`, {
        signal: AbortSignal.timeout(120_000), credentials: "omit",
      });
      if (!response.ok) throw new Error(`Mac dictation source download failed: ${response.status}`);
      bytes = Buffer.from(await response.arrayBuffer());
      verifyMacDictationSource(bytes);
      await writeFile(archive + ".partial", bytes);
      await rename(archive + ".partial", archive);
    }
    verifyMacDictationSource(bytes);
    await execFileAsync("tar", ["-xzf", archive, "-C", root]);
    await rm(build, { recursive: true, force: true });
    const cmake = process.env.CMAKE_BIN?.trim() || "cmake";
    await execFileAsync(cmake, ["-S", source, "-B", build,
      "-DCMAKE_BUILD_TYPE=Release", `-DCMAKE_OSX_ARCHITECTURES=${arch}`, "-DCMAKE_OSX_DEPLOYMENT_TARGET=12.0",
      "-DBUILD_SHARED_LIBS=OFF", "-DWHISPER_BUILD_TESTS=OFF", "-DWHISPER_BUILD_EXAMPLES=ON",
      "-DWHISPER_BUILD_SERVER=OFF", "-DWHISPER_BUILD_IS_DEV=OFF", "-DWHISPER_CURL=OFF",
      "-DGGML_NATIVE=OFF", "-DGGML_METAL=OFF", "-DGGML_OPENMP=OFF",
      // Upstream BLAS opts into macOS 13.3 APIs even with an older deployment target.
      "-DGGML_BLAS=OFF",
      "-DGGML_AVX=OFF", "-DGGML_AVX2=OFF", "-DGGML_FMA=OFF", "-DGGML_F16C=OFF", "-DGGML_BMI2=OFF",
    ]);
    await execFileAsync(cmake, ["--build", build, "--config", "Release", "--target", "whisper-cli", "--parallel", "4"]);
    await execFileAsync("lipo", [binary, "-verify_arch", arch]);
    await execFileAsync(binary, ["--help"]);
    const sha256 = createHash("sha256").update(await readFile(binary)).digest("hex");
    await writeFile(complete, JSON.stringify({ revision, arch, sha256 }));
  }
  const destination = join(resourceRoot, "bin", "libexec", "whisper");
  await mkdir(destination, { recursive: true });
  await copyFile(binary, join(destination, "whisper-cli"));
  await chmod(join(destination, "whisper-cli"), 0o755);
  await copyFile(join(source, "LICENSE"), join(destination, "LICENSE"));
  await writeFile(join(destination, "BUILD.txt"), `whisper.cpp b5454\nSource: https://github.com/ggml-org/whisper.cpp/tree/${revision}\nArchive SHA-256: ${sourceSha256}\nArchitecture: ${arch}\nStatic CPU engine; macOS deployment target 12.0.\n`);
}
