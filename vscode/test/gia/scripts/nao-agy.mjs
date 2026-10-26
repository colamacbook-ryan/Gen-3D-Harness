// Driver não GIẢ cho test tiến trình: chỉ sống (argv khớp `nao-agy.mjs` như driver thật).
console.log(`nao-agy giả pid ${process.pid} cổng ${process.env.GEN_STAGE_PORT ?? '8787'}`);
setInterval(() => undefined, 1 << 30);
