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

const job = schedule.scheduleJob('* * 3 * * *', function(){
    console.log("Restarting...");
    process.exit(0);
});

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
    sitePort = 80;
}

const dayPath = path.resolve("./archive/" + new Date().toISOString().substring(0, 10));
try {
    if (!fs.existsSync(dayPath)) {
        fs.mkdirSync(dayPath)
    }
} catch (err) {
    console.error(err)
}



let auth = "";
fs.readFile(__dirname + '/password.txt', function (err, data) {
    if (err) {
        throw err;
    }
    auth = ("admin:" + data.toString()).replace(/[^\x00-\x7F]/g, "").replace(/(\r\n|\n|\r)/gm, "");
});

const hostUsername = os.userInfo().username;
const localTest = (hostUsername !== "pi" && hostUsername !== "root");
const reactDir = (process.argv.length > 2 ? process.argv[2] : path.resolve("../personal-site-21/"));
if (!localTest) {
    const reactApp = express();
    reactApp.use(express.static(path.join(reactDir, 'build')));
    reactApp.get('/.well-known/acme-challenge/9dQPhqJkntU8ttUeIL6EOM2w8gF2gPnArJtXnmzMvrw', function (req, res) {
        res.sendFile('/home/pi/personal-site-server/a-challenge');
    });
    reactApp.get('/.well-known/acme-challenge/OnvDPYbfbx_Ldu0JZVmYITFIBoPkDE5gdK7IoM8M0u8', function (req, res) {
        res.sendFile('/home/pi/personal-site-server/b-challenge');
    });
    reactApp.get('/outset', function (req, res) {
        res.sendFile(reactDir + "/src/outset-site/")
    });
    reactApp.get('/coding', function (req, res) {
        res.sendFile(reactDir + "/src/coding/")
    });
    reactApp.get('*', function (req, res) {
        res.sendFile(reactDir + "/build/index.html");
    });
    https.createServer(siteOptions, reactApp).listen(sitePort);
}

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

let artPath="";
apiApp.get('/archive/*', function (req, res) {
    const filePath=path.resolve("./"+req.path);
    res.sendFile(filePath);
});
apiApp.get('/art', function (req, res) {
    if (artPath==="") res.status(404).send({ data: false});
    else {
        res.send({data: artPath});
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
            return;
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
    // accessing the file
    const myFile = req.files.file;
    //  mv() method places the file inside public directory
    let filePath=dayPath + "/" + myFile.name;
    filePath=filePath.substring(filePath.indexOf("archive/"));
    if (req.path.includes("/art")) artPath=filePath;
    myFile.mv(filePath, function (err) {
        if (err) {
            console.log(err)
            return res.status(500).send({ msg: "Error occured" });
        }
        // returing the response with file path and name
        return res.send({ name: myFile.name, path: filePath });
    });
})
if (!localTest) https.createServer(apiOptions, apiApp).listen(apiPort);
else apiApp.listen(apiPort);