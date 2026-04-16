const express = require("express");
const callRoutes = require("./routes/callRoutes");

const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.use("/", callRoutes);
app.use("/audio", express.static("public/audio"));

module.exports = app;