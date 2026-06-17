const http = require('http');
const fs = require('fs');
const path = require('path');
const root = __dirname;
const port = 3500;
const mime = { '.html':'text/html;charset=utf-8', '.css':'text/css;charset=utf-8',
               '.js':'application/javascript;charset=utf-8', '.png':'image/png',
               '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.ico':'image/x-icon' };
http.createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/') p = '/index.html';
  const file = path.join(root, p);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'text/plain' });
    res.end(data);
  });
}).listen(port, () => console.log(`Server running at http://localhost:${port}/`));
