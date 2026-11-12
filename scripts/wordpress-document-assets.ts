import { build } from 'esbuild';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve as resolvePath } from 'node:path';

/** Publish browser modules as .js for WordPress hosts without a .mjs MIME mapping. */
async function copyBrowserModules(source: string, target: string) {
  await cp(source, target, {
    recursive: true,
    filter: path => !/(?:^|[/\\])types(?:$|[/\\])/.test(path) && !/\.m?js$/.test(path),
  });
  const files = await readdir(source, { recursive: true, withFileTypes: true });
  await Promise.all(files.filter(file => file.isFile() && /\.m?js$/.test(file.name)).map(async file => {
    const path = join(file.parentPath, file.name);
    const relativePath = relative(source, path).replace(/\.mjs$/, '.js');
    const script = await readFile(path, 'utf8');
    await writeFile(join(target, relativePath), script.replace(/(\.mjs)(?=["'`])/g, '.js'));
  }));
}

/** The reader and its workers are same-origin assets, loaded on attachment use. */
export async function buildWordPressDocumentAssets(root: string, appDir: string) {
  const web = join(root, 'apps/web');
  const resolve = createRequire(join(web, 'package.json')).resolve;
  const output = resolvePath(appDir, 'documents');
  const pdf = dirname(resolve('pdfjs-dist/package.json'));
  const tess = dirname(resolve('tesseract.js/package.json'));
  const core = dirname(resolve('tesseract.js-core/package.json'));
  const lang = dirname(resolve('@tesseract.js-data/eng/package.json'));
  const legacy = dirname(resolve('@silurus/ooxml-legacy-office/doc'));
  const ooxml = dirname(resolve('@silurus/ooxml/docx'));
  await Promise.all(['pdf', 'ocr', 'legacy', 'licenses'].map(name => mkdir(join(output, name), { recursive: true })));
  await Promise.all([
    build({
      absWorkingDir: web,
      entryPoints: { reader: join(web, 'src/pixflow/document-reader-entry.ts') },
      outdir: output,
      format: 'esm', platform: 'browser', target: 'es2022', bundle: true, splitting: true,
      chunkNames: 'chunks/[name]-[hash]', minify: true, legalComments: 'eof',
    }),
    ...['cmaps', 'standard_fonts', 'wasm'].map(name => cp(join(pdf, name), join(output, 'pdf', name), { recursive: true })),
    cp(join(pdf, 'build/pdf.worker.min.mjs'), join(output, 'pdf/pdf.worker.min.js')),
    cp(join(tess, 'dist/worker.min.js'), join(output, 'ocr/worker.min.js')),
    ...['tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm'].map(name => cp(join(core, name), join(output, 'ocr', name))),
    cp(join(lang, '4.0.0_best_int/eng.traineddata.gz'), join(output, 'ocr/eng.traineddata.gz')),
    copyBrowserModules(legacy, join(output, 'legacy')),
    copyBrowserModules(ooxml, join(output, 'ooxml')),
    cp(join(pdf, 'LICENSE'), join(output, 'licenses/pdfjs.txt')),
    cp(join(tess, 'LICENSE.md'), join(output, 'licenses/tesseract.txt')),
    cp(join(core, 'LICENSE'), join(output, 'licenses/tesseract-core.txt')),
    writeFile(join(output, 'licenses/tesseract-english-model.txt'),
      'English trained data (4.0.0_best_int), distributed by naptha/tessdata.\n'
      + 'Source and licence: https://github.com/naptha/tessdata (Apache-2.0, included in tesseract-core.txt).\n'),
    cp(join(legacy, '../LICENSE'), join(output, 'licenses/legacy-office.txt')),
    cp(join(legacy, '../THIRD_PARTY_NOTICES.md'), join(output, 'licenses/legacy-office-notices.md')),
    cp(join(ooxml, '../LICENSE'), join(output, 'licenses/ooxml.txt')),
    cp(join(ooxml, '../THIRD_PARTY_NOTICES.md'), join(output, 'licenses/ooxml-notices.md')),
    cp(join(dirname(resolve('officeparser/slim')), '../LICENSE'), join(output, 'licenses/officeparser.txt')),
  ]);
}
