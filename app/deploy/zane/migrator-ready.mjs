import { createServer } from 'node:http';

const port = Number.parseInt(process.env.MIGRATOR_PORT ?? '8080', 10);
createServer((request, response) => {
  if (request.url === '/ready') {
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('ready\n');
    return;
  }
  response.writeHead(404).end();
}).listen(port, '0.0.0.0');
