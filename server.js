const express = require('express');
const fs = require('fs');
const http = require('http');
const https = require('https');
const basicAuth = require('express-basic-auth');
const path = require('path');
const cors = require('cors');
const { exec } = require('child_process');

const publicIp = require('public-ip');
let IPV4 = "POOP";
publicIp.v4().then(ip => {
    IPV4 = ip;
});

let siteOptions = {},apiOptions={};
let sitePort=443, apiPort=5000;
try {
    siteOptions.key = fs.readFileSync('/etc/letsencrypt/live/willfarhat.com/privkey.pem');
    siteOptions.cert = fs.readFileSync('/etc/letsencrypt/live/willfarhat.com/cert.pem');
	siteOptions.ca = fs.readFileSync('/etc/letsencrypt/live/willfarhat.com/chain.pem');
	
	apiOptions.key = fs.readFileSync('/etc/letsencrypt/live/api.willfarhat.com/privkey.pem');
	apiOptions.cert = fs.readFileSync('/etc/letsencrypt/live/api.willfarhat.com/cert.pem');
        apiOptions.ca = fs.readFileSync('/etc/letsencrypt/live/api.willfarhat.com/chain.pem');
}
catch {
    console.log("No SSL files found, falling back to HTTP");
    sitePort=80;
}

let auth = "";
fs.readFile(__dirname + '/password.txt', function (err, data) {
    if (err) {
        throw err;
    }
    auth = ("admin:" + data.toString()).replace(/[^\x00-\x7F]/g, "").replace(/(\r\n|\n|\r)/gm, "");
});

const reactApp = express();
const reactDir = (process.argv.length > 2 ? process.argv[2] : path.resolve("../personal-site-21/"));
reactApp.use(express.static(path.join(reactDir, 'build')));
reactApp.get('/.well-known/acme-challenge/9dQPhqJkntU8ttUeIL6EOM2w8gF2gPnArJtXnmzMvrw',function(req,res){
	res.sendFile('/home/pi/personal-site-server/a-challenge');
});
reactApp.get('/.well-known/acme-challenge/OnvDPYbfbx_Ldu0JZVmYITFIBoPkDE5gdK7IoM8M0u8',function(req,res){
	res.sendFile('/home/pi/personal-site-server/b-challenge');
});
reactApp.get('*', function (req, res) {
    res.sendFile(reactDir + "/build/index.html");
});
https.createServer(siteOptions, reactApp).listen(sitePort);

const apiApp = express();
apiApp.use(cors({
    origin: '*'
}));
apiApp.use((req, res, next) => {
const newAuth=((new Buffer(req.headers.authorization,"base64")).toString("ascii")).replace(/[^\x00-\x7F]/g, "").replace(/(\r\n|\n|\r)/gm, "");
if (auth != newAuth) {
        res.send({ data: false });
        return;
    }
    return next();
});
apiApp.get('/reset', function (req, res) {
    exec('/home/pi/website_update.sh');
});
apiApp.get('/ip', function (req, res) {
    res.send({ data: IPV4 });
});
https.createServer(apiOptions, apiApp).listen(apiPort);
