import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workerName = "service-worker.js";
const outputDirectory = path.resolve(process.argv[2] || "dist");
const templatePath = fileURLToPath(
  new URL("./service-worker.template.js", import.meta.url),
);

function excluded(relativePath) {
  const parts = relativePath.split("/");
  return (
    // Expo preserves package paths for exported runtime fonts/images, including
    // assets/node_modules/.pnpm. Only root hidden paths are non-export metadata.
    parts[0].startsWith(".") ||
    ["ios", "android", "server", "api", "node_modules"].includes(parts[0]) ||
    /^_expo\/static\/js\/(ios|android)\//.test(relativePath) ||
    /\.(map|hbc|apk|aab|ipa)$/i.test(relativePath) ||
    [workerName, "_redirects", "_headers", "Thumbs.db"].includes(relativePath)
  );
}

async function exportedFiles(directory, prefix = "") {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (excluded(relativePath)) continue;
    const location = path.join(directory, entry.name);
    if (entry.isDirectory())
      files.push(...(await exportedFiles(location, relativePath)));
    else if (entry.isFile()) files.push(relativePath);
    else
      throw new Error(
        `The export contains an unsupported symbolic link or special file: ${relativePath}`,
      );
  }
  return files.sort();
}

try {
  if (!(await stat(path.join(outputDirectory, "index.html"))).isFile())
    throw new Error("The exported index.html is not a regular file.");
  const files = await exportedFiles(outputDirectory);
  const template = await readFile(templatePath, "utf8");
  const hash = createHash("sha256").update(template);
  const assets = [];
  for (const file of files) {
    const contents = await readFile(path.join(outputDirectory, file));
    hash.update(JSON.stringify([file, contents.length])).update(contents);
    assets.push({
      // EAS Hosting resolves Expo's literal package @/+ paths differently from
      // percent-encoded aliases. Preserve these safe path characters while
      // escaping spaces, #, ?, %, and other unsafe filename characters.
      path: file
        .split("/")
        .map((part) =>
          encodeURIComponent(part).replace(/%40/g, "@").replace(/%2B/g, "+"),
        )
        .join("/"),
      sha256: createHash("sha256").update(contents).digest("hex"),
    });
  }
  // URL generation is part of the cache contract, as well as file contents.
  // Changing encoded paths must never reuse an active cache from an older worker.
  const version = hash.update(JSON.stringify(assets)).digest("hex");
  const worker = template
    .replace("__ACEWISE_BUILD_VERSION__", JSON.stringify(version))
    .replace("__ACEWISE_PRECACHE_ASSETS__", JSON.stringify(assets, null, 2));
  await writeFile(path.join(outputDirectory, workerName), worker);
  process.stdout.write(
    `Generated ${workerName}: ${files.length} offline files, version ${version.slice(0, 12)}.\n`,
  );
} catch (error) {
  process.stderr.write(
    `Offline build failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
