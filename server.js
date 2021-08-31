const express = require('express');
const basicAuth = require('express-basic-auth');
const path = require('path');
const cors = require('cors');

const publicIp = require('public-ip');
let IPV4 = "POOP";
publicIp.v4().then(ip => {
    IPV4 = ip;
});

const fs = require('fs');
let password = "";
fs.readFile(__dirname + '/password.txt', function (err, data) {
    if (err) {
        throw err;
    }
    password = data.toString();
});

const reactApp = express();
const reactDir = (process.argv.length > 2 ? process.argv[2] : path.resolve("../personal-site-21/"));
reactApp.use(express.static(path.join(reactDir, 'build')));
reactApp.get('*', function (req, res) {
    res.sendFile(reactDir + "/build/index.html");
});
reactApp.listen(80);

const apiApp = express();
apiApp.use(cors({
    origin: '*'
}));
apiApp.get('/api/ip', function (req, res) {
    res.send({data:IPV4});
}
);
apiApp.listen(5000);