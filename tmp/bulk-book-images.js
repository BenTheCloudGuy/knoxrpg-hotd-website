// One-off in-pod bulk image downloader.
// Downloads art + maps for every owned/downloaded book that has no images yet.
// Run inside the hotd-website pod: node /tmp/bulk-book-images.js
const path = require("path");
const APP = "/app";
const { pgPool } = require(path.join(APP, "db/pool"));
const ddbBookImages = require(path.join(APP, "lib/ddb-book-images"));

function log(msg) {
  const t = new Date().toISOString().slice(11, 19);
  console.log(`[${t}] ${msg}`);
}

(async () => {
  try {
    await ddbBookImages.ensureTable(pgPool);
    const { rows: dl } = await pgPool.query(
      `SELECT DISTINCT lower(trim(unnest(string_to_array(source, ',')))) AS code
         FROM (SELECT source FROM monsters WHERE source IS NOT NULL
               UNION ALL SELECT source FROM magic_items WHERE source IS NOT NULL
               UNION ALL SELECT source FROM spells WHERE source IS NOT NULL) q`
    );
    const downloaded = dl.map((r) => r.code).filter(Boolean);
    const { rows: hi } = await pgPool.query("SELECT DISTINCT book_code FROM ddb_book_images");
    const hasImg = new Set(hi.map((r) => r.book_code));
    const todo = downloaded.filter((c) => !hasImg.has(c)).sort();
    log(`downloaded codes: ${downloaded.length}; already have images: ${hasImg.size}; to process: ${todo.length}`);
    const totals = { art: 0, maps: 0, uploaded: 0, published: 0, skipped: 0, failed: 0, booksWithImages: 0, noImages: 0 };
    let i = 0;
    for (const code of todo) {
      i++;
      try {
        const r = await ddbBookImages.downloadBookImages(pgPool, code, { onLog: () => {} });
        totals.art += r.art || 0; totals.maps += r.maps || 0; totals.uploaded += r.uploaded || 0;
        totals.published += r.published || 0; totals.skipped += r.skipped || 0; totals.failed += r.failed || 0;
        if ((r.art || 0) + (r.maps || 0) > 0) totals.booksWithImages++; else totals.noImages++;
        log(`[${i}/${todo.length}] ${code}: +${r.art} art +${r.maps} maps (found ${r.found}, failed ${r.failed})`);
      } catch (e) {
        totals.noImages++;
        log(`[${i}/${todo.length}] ${code}: ERROR ${e.message}`);
      }
    }
    log(`DONE: ${totals.art} art + ${totals.maps} maps across ${totals.booksWithImages} book(s); ` +
        `${totals.noImages} yielded none/failed; ${totals.uploaded} uploaded, ${totals.published} published.`);
    process.exit(0);
  } catch (e) {
    log("FATAL " + (e.stack || e.message));
    process.exit(1);
  }
})();
