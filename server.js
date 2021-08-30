const express = require('express');
const path = require('path');
const app = express();

const dir = (process.argv.length>2 ? process.argv[2] : __dirname);
app.use(express.static(path.join(dir, 'build')));

app.get('/', function (req, res) {
    res.sendFile(path.join(dir, 'build', 'index.html'));
});

app.listen(80);