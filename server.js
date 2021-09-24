const express = require('express');
const fileupload = require("express-fileupload");
const fs = require('fs');
const https = require('https');
const basicAuth = require('express-basic-auth');
const schedule = require('node-schedule');
const path = require('path');
const cors = require('cors');
const { spawn } = require('child_process');
const os = require('os');

const publicIp = require('public-ip');
const { exit } = require('process');
let IPV4 = "POOP";
publicIp.v4().then(ip => {
    IPV4 = ip;
});

const hostUsername = os.userInfo().username;
const localTest = (hostUsername !== "pi" && hostUsername !== "root");
if (!localTest) {
    const job = schedule.scheduleJob('0 0 3 * * *', function () {
        console.log("Restarting...");
        process.exit(0);
    });
}

let siteOptions = {}, apiOptions = {};
let sitePort = 443, apiPort = 5000;
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
    if (localTest) sitePort = 2000;
    else sitePort = 80;
}

let dayPath = path.resolve("./archive/");
try {
    if (!fs.existsSync(dayPath)) {
        fs.mkdirSync(dayPath);
    }
    dayPath += "/" + new Date().toISOString().substring(0, 10);
    dayPath = path.resolve(dayPath);
    if (!fs.existsSync(dayPath)) {
        fs.mkdirSync(dayPath);
    }
} catch (err) {
    console.error(err);
}

let auth = "";
fs.readFile(__dirname + '/password.txt', function (err, data) {
    if (err) {
        throw err;
    }
    auth = ("admin:" + data.toString()).replace(/[^\x00-\x7F]/g, "").replace(/(\r\n|\n|\r)/gm, "");
});

let reactDir = process.argv[2];
if (process.argv.length < 3) {
    reactDir = path.resolve("../personal-site-21");
}
console.log("Using react dir: " + reactDir);

const reactApp = express();
reactApp.use(express.static(reactDir));
reactApp.set('view engine', 'jade');
reactApp.get('/.well-known/acme-challenge/9dQPhqJkntU8ttUeIL6EOM2w8gF2gPnArJtXnmzMvrw', function (req, res) {
    res.sendFile('/home/pi/personal-site-server/a-challenge');
});
reactApp.get('/.well-known/acme-challenge/OnvDPYbfbx_Ldu0JZVmYITFIBoPkDE5gdK7IoM8M0u8', function (req, res) {
    res.sendFile('/home/pi/personal-site-server/b-challenge');
});
reactApp.get('/files/*', function (req, res) {
    const filePath = path.resolve(reactDir + "/public/" + req.path);
    if (!fs.existsSync(filePath)) {
        res.status(404).send("File not found");
    }
    else res.sendFile(filePath);
});
/*reactApp.get('/outset*', function (req, res) {
    let endFile = req.path.substring(req.path.indexOf("/outset") + 7);
    if (endFile==="") endFile="index.html";
    console.log(endFile)
    res.sendFile(path.resolve(reactDir + "/src/outset-site/"+endFile));
});*/
reactApp.get('/coding', function (req, res) {
    res.sendFile(reactDir + "/src/coding/");
});
reactApp.get('*', function (req, res) {
    console.log(req.path)
    const endpoint = req.path.replace(/%20/g, " ");
    if (endpoint === "/files") res.sendFile(reactDir + "/build/index.html");
    else if (endpoint.indexOf("/files") === 0) {
        res.sendFile(path.resolve(reactDir + "/build" + endpoint));
    }
    else if (fs.existsSync(reactDir + "/build" + endpoint)) res.sendFile(reactDir + "/build" + endpoint);
    else res.sendFile(reactDir + "/build/index.html");
});
if (!localTest) https.createServer(siteOptions, reactApp).listen(sitePort);
else reactApp.listen(sitePort);
console.log("React app listening on port " + sitePort);

const apiApp = express();
apiApp.use(cors({
    origin: '*'
}));
apiApp.use(fileupload());
apiApp.get('/html5game*', function (req, res) {
    res.sendFile(reactDir + "/public/personal-site-game/build" + req.path);
});
apiApp.get('/favicon.ico', function (req, res) {
    res.sendFile(reactDir + "/public/personal-site-game/build/favicon.ico");
});
apiApp.get('/game', function (req, res) {
    res.sendFile(reactDir + "/public/personal-site-game/build/index.html");
});

let artPath = "";
apiApp.get('/archive/*', function (req, res) {
    const filePath = path.resolve("./" + req.path);
    res.sendFile(filePath);
});
apiApp.get('/fileList', function (req, res) {
    const fileDir = path.resolve(reactDir + "/public/files/")
    const fileList = fs.readdirSync(fileDir);
    res.send({data: fileList});
});
apiApp.get('/art', function (req, res) {
    if (artPath === "") res.status(404).send({ data: false });
    else {
        res.send({ data: artPath });
    }
});
apiApp.use((req, res, next) => {
    if (req.headers["user-agent"] !== undefined) {
        if ((req.headers["user-agent"]).includes("GitHub-Hookshot")) {
            res.send("OK buddy <3");
            const out = fs.openSync('/home/pi/out.log', 'a');
            const ls = spawn('bash', ['/home/pi/website_update.sh', '>', '/home/pi/log.out'], {
                detached: true,
                stdio: ['ignore', out, out]
            });
            ls.unref();
            process.exit(0);
        }
    }
    let newAuth = "";
    if (req.headers.authorization !== undefined) newAuth = ((Buffer.from(req.headers.authorization, "base64")).toString("ascii")).replace(/[^\x00-\x7F]/g, "").replace(/(\r\n|\n|\r)/gm, "");
    if (auth != newAuth) {
        res.send({ data: false });
        return;
    }
    return next();
});
apiApp.get('/ip', function (req, res) {
    res.send({ data: IPV4 });
});

apiApp.post('/upload*', (req, res) => {
    if (!req.files) {
        return res.status(500).send({ msg: "No file attached" })
    }
    const myFile = req.files.file;
    let filePath = path.resolve(reactDir + (req.path.replace("/upload/files", "")) + "/public/files/" + myFile.name);
    if (req.path.includes("upload/art")) {
        filePath = dayPath + "/" + myFile.name;
        artPath = filePath.substring(filePath.indexOf("archive"));
    }
    console.log("Uploading file: " + filePath);
    myFile.mv(filePath, function (err) {
        if (err) {
            console.log(err)
            return res.status(500).send({ msg: "Error occured" });
        }
        else {
            return res.status(200).send({data: myFile.name});
        }
    });
})
if (!localTest) https.createServer(apiOptions, apiApp).listen(apiPort);
else apiApp.listen(apiPort);
console.log("API app listening on port " + apiPort);
