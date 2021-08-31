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
let auth="";
fs.readFile(__dirname + '/password.txt', function (err, data) {
    if (err) {
        throw err;
    }
    let userPass="admin:"+data.toString();
    auth=Buffer.from(userPass).toString("base64");
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
apiApp.use((req, res, next) => {
    if (auth!=req.headers.authorization) {
        res.send({data:false});
        return;
    }
    return next();
});
apiApp.get('/api/ip', function (req, res) {
    res.send({data:IPV4});
}
);
apiApp.listen(5000);