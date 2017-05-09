import { request, createServer } from 'http';

import WebSocket, { Server } from 'ws';
import express from 'express';

const port = process.env.PORT || 8080;

const baseOptions = {
  method: 'GET',
  socketPath: '/var/run/docker.sock'
};

const dockerAPIRequest = path => {
  return new Promise((res, rej) => {
    let buffer = '';

    const r = request({ ...baseOptions, path }, response => {
      response.on('data', chunk => (buffer = buffer + chunk));
      response.on('end', () => res(buffer));
    });

    r.on('error', rej);

    r.end();
  });
};

const fetchData = () =>
  Promise.all([
    dockerAPIRequest('/nodes').then(JSON.parse),
    dockerAPIRequest('/services').then(JSON.parse),
    dockerAPIRequest('/tasks').then(JSON.parse)
  ]).then(([nodes, services, tasks]) => ({
    nodes,
    services,
    tasks
  }));

// start the polling

let latestData = {};
setInterval(() => {
  fetchData().then(it => (latestData = it));
}, 500);

// set up the application

const app = express();

app.use(express.static('client'));
app.get('/_health', (req, res) => res.end());
app.get('/data', (req, res) => {
  fetchData().then(it => res.send(it)).catch(e => res.send(e.toString()));
});

// set up the server

const server = createServer();
const wsServer = new Server({
  path: '/stream',
  server
});

server.on('request', app);

wsServer.on('connection', ws => {
  const interval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(latestData, null, 2));
    }
  }, 200);

  ws.on('close', () => clearInterval(interval));
});

server.listen(port, () => {
  console.log(`Listening on ${port}`);
});

export default server;
