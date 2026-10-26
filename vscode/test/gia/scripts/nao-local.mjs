// Driver não GIẢ cho test tiến trình: chỉ sống (argv khớp `nao-local.mjs` như driver thật).
console.log(`nao-local giả pid ${process.pid} cổng ${process.env.GEN_STAGE_PORT ?? '8787'}`);
setInterval(() => undefined, 1 << 30);
