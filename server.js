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
const bodyParser = require("body-parser");

const publicIp = require('public-ip');
const { exit } = require('process');
let IPV4 = "POOP";
publicIp.v4().then(ip => {
    IPV4 = ip;
});

const hostUsername = os.userInfo().username;
let localTest = (hostUsername !== "pi" && hostUsername !== "root");

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
    localTest = true;
    sitePort = 3000; //80 is redirected here by iptables
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

//claps
let claps = 0;
let clapPath = path.resolve("./claps.txt");
if (!localTest) clapPath = path.resolve("/home/pi/personal-site-server/claps.txt");
if (!fs.existsSync(clapPath)) {
    fs.writeFile(clapPath, "0", function (err) {
        if (err) {
            return console.log(err);
        }
        console.log("New clap file created");
    });
}
fs.readFile(clapPath, function (err, data) {
    if (err) {
        console.log("Error reading claps");
        return;
    }
    claps = Number(data.toString());
});

//save
const save = function () {
    fs.writeFile(clapPath, claps, function (err) {
        if (err) {
            return console.log(err);
        }
        console.log("Saved claps");
    });
}
if (!localTest) {
    const job = schedule.scheduleJob('0 0 3 * * *', function () {
        save();
        console.log("Restarting...");
        process.exit(0);
    });
}

const memProfile = schedule.scheduleJob('*/10 * * * *', function () {
    console.log("Memory usage: " + process.memoryUsage().heapUsed / 1024 / 1024 + "MB");
});

//password
let auth = "";
fs.readFile(__dirname + '/password.txt', function (err, data) {
    if (err) {
        throw err;
    }
    auth = ("admin:" + data.toString()).replace(/[^\x00-\x7F]/g, "").replace(/(\r\n|\n|\r)/gm, "");
});

//GH token
let github = "";
fs.readFile(__dirname + '/github.txt', function (err, data) {
    if (err) {
        throw err;
    }
    github = data.toString();
});

let reactDir = process.argv[2];
if (process.argv.length < 3) {
    reactDir = path.resolve("../personal-site-21");
}
console.log("Using react dir: " + reactDir);
let emotiveDir = "/home/pi/emotive";

const reactApp = express();
reactApp.use(express.static(reactDir));
reactApp.set('view engine', 'jade');
reactApp.get('/.well-known/acme-challenge/qjf_Z7xGMsV_3HrIbOBbqIo_P2JVc8hZ8YHaHpx5wEI', function (req, res) {
    res.sendFile('/home/pi/personal-site-server/a-challenge');
});
reactApp.get('/.well-known/acme-challenge/JNKPVRgLLlPr6hoz7YZtddhsI_TEs3HnfXgjjv1sM-g', function (req, res) {
    res.sendFile('/home/pi/personal-site-server/b-challenge');
});
reactApp.get('/files/*', function (req, res) {
    const filePath = path.resolve(reactDir + "/public/" + req.path);
    if (!fs.existsSync(filePath)) {
        res.status(404).send("File not found");
    }
    else res.sendFile(filePath);
});
reactApp.get('/outset*', function (req, res) {
    if (req.path == "/outset" || req.path == "/outset/" || req.path == "/outset/index.html") {
        res.sendFile(reactDir + "/build/index.html");
    }
    else {
        let endFile = req.path.substring(req.path.indexOf("/outset") + 7);
        if (endFile === "") endFile = "index.html";
        res.sendFile(path.resolve(reactDir + "/src/assets/outsetPage/" + endFile));
    }
});
reactApp.get('/coding', function (req, res) {
    res.sendFile(reactDir + "/src/coding/");
});
reactApp.get('/coding*', function (req, res) {
    let file = reactDir + "/src/coding/" + req.path.substring(req.path.indexOf("/coding") + 7);
    res.sendFile(file);
});
reactApp.get('/youtube', function (req, res) { res.redirect('https://www.youtube.com/channel/UCImSybcXB8pCtulA-_T0WCw'); });
reactApp.get('/linkedin', function (req, res) { res.redirect('https://www.linkedin.com/in/will-farhat-12b89817b'); });
reactApp.get('/github', function (req, res) { res.redirect('https://github.com/willf668/'); });
reactApp.get('/resume', function (req, res) { res.redirect('https://github.com/willf668/resume/raw/main/WillFarhatResume.pdf'); });
reactApp.get('/twitter', function (req, res) { res.redirect('https://twitter.com/will_farhat'); });
reactApp.get('/instagram', function (req, res) { res.redirect('https://www.instagram.com/will_farhat/'); });

reactApp.get('*', function (req, res) {
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
    res.send({ data: fileList });
});
apiApp.get('/clap', function (req, res) {
    res.send({ data: claps });
});
apiApp.get('/newClap', function (req, res) {
    claps++;
    res.status(200).send({ data: claps });
});
apiApp.get('/art', function (req, res) {
    if (artPath === "") res.status(404).send({ data: false });
    else {
        res.send({ data: artPath });
    }
});
apiApp.use(bodyParser.urlencoded({ extended: false }));
apiApp.use(bodyParser.json());

let emotion = 0;
apiApp.post('/emotion', function (req, res) {
    emotion = req.body;
    res.send("Ok");
});
apiApp.get('/emotion', function (req, res) {
    res.send({ data: emotion });
});

//NFT api port
let nftStatus = false;
apiApp.get('/nftStatus', function (req, res) {
    res.send({ data: nftStatus });
});

apiApp.use((req, res, next) => {
    if (req.headers["user-agent"] !== undefined) {
        if ((req.headers["user-agent"]).includes("GitHub-Hookshot")) {
            res.send("OK buddy <3");

            //save data
            save();

            const ls = spawn('bash', ['sudo', '/home/pi/personal-site-server/website_update.sh', '>', '/home/pi/personal-site-server/out.log'], {
                detached: true
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
apiApp.get('/github', function (req, res) {
    res.send({ data: github });
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
            return res.status(200).send({ data: myFile.name });
        }
    });
})
if (!localTest) https.createServer(apiOptions, apiApp).listen(apiPort);
else apiApp.listen(apiPort);
console.log("API app listening on port " + apiPort);


//Emotive
//#region Emotive
const emotiveApp = express();
emotiveApp.use(cors({
    origin: '*'
}));
emotiveApp.set('port', 8000);
emotiveApp.get('*', function (req, res) {
    const endpoint = req.path.replace(/%20/g, " ");
    if (endpoint === "/files") res.sendFile(emotiveDir + "/frontend/build/index.html");
    else if (endpoint.indexOf("/files") === 0) {
        res.sendFile(path.resolve(emotiveDir + "/frontend/build" + endpoint));
    }
    else if (fs.existsSync(emotiveDir + "/frontend/build" + endpoint)) res.sendFile(emotiveDir + "/frontend/build" + endpoint);
    else res.sendFile(emotiveDir + "/frontend/build/index.html");
});
emotiveApp.listen(emotiveApp.get('port'));

const emotiveApi = express();
emotiveApi.use(cors({
    origin: '*'
}));
emotiveApi.set('port', 9000);
emotiveApi.get('*', (req, res) => {
    //send the file in ../frontend/build/
    let trim = req.path.replace('/game', '').trim();
    if (trim === "") trim += "/index.html";
    res.sendFile(path.resolve(emotiveDir + '/emotive-game/build/' + trim));
});
//emotiveApi.listen(emotiveApi.get('port'));
//console.log("EMOTIVE listening on ports " + emotiveApp.get('port') + " and " + emotiveApi.get('port'));
//#endregion

//NFTs are bad
const nftStatusPath = reactDir + "/../are-nfts-good/";
const twitterAPI = require(path.resolve(nftStatusPath + "/backend/index.js"));
const twitter = new twitterAPI();
const hashtags="\n#nfts #nft #nftart #nftartist #nftcollector #cryptoart #digitalart #nftcommunity #art #crypto #ethereum #blockchain #cryptocurrency #cryptoartist #opensea #nftcollectors #bitcoin #nftdrop #nftcollectibles #artist #d #eth #openseanft #nftartists #artwork";
const yesWeight=1, noWeight=20;
const getTwitterData = function () {
    console.log("Grabbling oldest poll...")
    twitter.getMostRecentTweet('areNftsGood').then(data => {
        nftStatus=(data&&data.polls&&data.polls.options&&data.polls.options.length==2&&data.polls.options[0].votes*yesWeight>data.polls.options[1].votes*noWeight);
        twitter.createPoll("Are NFTs Good?"+hashtags, ["Yes", "No"], 1440);
        console.log("Tweeting new poll...");
    });
}
const twitterJob = schedule.scheduleJob('0 0 10 * * *', getTwitterData);
const nftStatusApp = express();
nftStatusApp.use(cors({
    origin: '*'
}));
nftStatusApp.get('*', (req, res) => {
    let file = (req.path !== "/" ? req.path : "index.html");
    res.sendFile(path.resolve(nftStatusPath + "/frontend/" + file));
});
nftStatusApp.set('port', 2496);
nftStatusApp.listen(nftStatusApp.get('port'));
console.log("NFT STATUS listening on port " + nftStatusApp.get('port'));