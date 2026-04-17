require("dotenv").config({ override: true });
const http = require("http");
const app = require("./src/app");
const initMediaStream = require("./src/websocket/mediaStreamServer");

console.log("✅ server.js loaded");

const server = http.createServer(app);

// ✅ attach websocket upgrade handler
initMediaStream(server);

const PORT = 3000;

server.listen(PORT, () => {
    console.log(`🚀 Server running on ${PORT}`);
});