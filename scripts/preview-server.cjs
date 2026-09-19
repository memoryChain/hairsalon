const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 4179);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.ttf': 'font/ttf', '.css': 'text/css' };
const server = http.createServer((req, res) => {
    try {
        const url = new URL(req.url, 'http://127.0.0.1');
        const pathname = decodeURIComponent(url.pathname);
        const base = pathname.startsWith('/fonts/') ? path.join(root, 'assets/race/fonts') : path.join(root, 'preview');
        const relative = pathname.startsWith('/fonts/') ? pathname.slice(7) : pathname === '/' ? 'index.html' : pathname.slice(1);
        let file = path.resolve(base, relative);
        if (!file.startsWith(base + path.sep)) { res.writeHead(403); res.end(); return; }
        if (!path.extname(file)) file += '.js';
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end('资源不存在'); return; }
        res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        fs.createReadStream(file).pipe(res);
    } catch { res.writeHead(400); res.end('请求无效'); }
});
server.listen(port, '127.0.0.1', () => console.log(`独立原型预览：http://127.0.0.1:${port}`));
