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
const nodemailer = require("nodemailer");
const dns = require('dns');
const { TwitterApi } = require('twitter-api-v2');
const Instagram = require('instagram-web-api');
const esrever = require('esrever');
const async = require('async');
const easyimg = require('easyimage');

const publicIp = require('public-ip');
const { exit } = require('process');
let IPV4 = "POOP";
publicIp.v4().then(ip => {
    IPV4 = ip;
});

const Indexer = require('friends-js'); //I made this!!!

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
    sitePort = 2000;
}

//Archive setup
let dayPath = path.resolve("./archive/");
if (dayPath == "/archive") dayPath = path.resolve("/home/pi/personal-site-server/archive");
const archiveFilePath = path.resolve(dayPath + "/files/");
try {
    if (!fs.existsSync(dayPath)) fs.mkdirSync(dayPath);
    if (!fs.existsSync(archiveFilePath)) {
        fs.mkdirSync(archiveFilePath);
        fs.mkdirSync(archiveFilePath + "/private");
        fs.mkdirSync(archiveFilePath + "/public");
    }
    dayPath += "/" + new Date().toISOString().substring(0, 10);
    dayPath = path.resolve(dayPath);
    if (!fs.existsSync(dayPath)) {
        fs.mkdirSync(dayPath);
    }
} catch (err) {
    console.error(err);
}

//Memory logging
const memProfile = schedule.scheduleJob('*/10 * * * *', function () {
    console.log("Memory usage: " + process.memoryUsage().heapUsed / 1024 / 1024 + "MB");
});

//Secret variables
let auth = "";
let secrets = null;
let secretsPath = path.resolve("./secrets.json");
if (!localTest) secretsPath = path.resolve("/home/pi/personal-site-server/secrets.json");

//save/load
let claps = 42;
let clapPath = path.resolve("./claps.txt");
if (clapPath == "/claps.txt") clapPath = "/home/pi/personal-site-server/claps.txt";
const save = () => {
    const secretString = JSON.stringify(secrets);
    try {
        fs.writeFileSync(secretsPath, secretString);
        console.log("Saved");
    } catch (err) {
        console.log('Error writing Metadata.json:' + err.message)
    }
}
const load = () => {
    secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf8'));
    auth = ("admin:" + secrets.password).replace(/[^\x00-\x7F]/g, "").replace(/(\r\n|\n|\r)/gm, "");
    secrets.ip = "POOP";
    publicIp.v4().then(ip => {
        secrets.ip = ip;
    });
    if (!("writusViews" in secrets)) secrets.writusViews = 0;
    secrets.latestArtTwitter = "https://twitter.com/willFarhatDaily";
    secrets.latestArtInstagram = "https://www.instagram.com/willfarhatdaily/";
    secrets.dailyArtPath = "";

    if (fs.existsSync(clapPath)) {
        fs.writeFileSync(clapPath, claps.toString());
    }
    claps = parseInt(fs.readFileSync(clapPath, 'utf8'));
}
load();

if (!localTest) {
    const restartJob = schedule.scheduleJob('0 0 3 * * *', function () {
        console.log("Restarting...");
        process.exit(0);
    });
    const saveJob = schedule.scheduleJob('0 * * * * *', function () {
        console.log("Saving...");
        save();
    });
}

//Directory setup
let reactDir = process.argv[2];
if (process.argv.length < 3) {
    reactDir = path.resolve("../personal-site-21");
}
console.log("Using react dir: " + reactDir);
let emotiveDir = "/home/pi/emotive";

const send404 = function (req, res) {
    let host = req.protocol + '://' + req.get('host');
    res.redirect(host + "/404");
}

const sendSubdomain = function (thisApp,startPath,endpoint,secretCounter="") {
    thisApp.get(startPath, function (req, res) {
        if (secretCounter !== "") secrets[secretCounter]++;
        let file = path.resolve(reactDir + endpoint+"/index.html");
        res.sendFile(file);
    });
    thisApp.get(startPath+"*", function (req, res) {
        let file = reactDir + endpoint + req.path.substring(req.path.indexOf(startPath) + startPath.length);
        res.sendFile(path.resolve(file));
    });
}

//Frontend setup
//#region Frontend
const reactApp = express();
reactApp.use(express.static(reactDir));
const sendRoot = function (req, res) {
    res.sendFile(reactDir + "/build/index.html");
}
reactApp.set('view engine', 'jade');
reactApp.get('/.well-known/acme-challenge/' + secrets.challengeAKey, function (req, res) {
    res.sendFile('/home/pi/personal-site-server/a-challenge');
});
reactApp.get('/.well-known/acme-challenge/' + secrets.challengeBKey, function (req, res) {
    res.sendFile('/home/pi/personal-site-server/b-challenge');
});
reactApp.get('/chadmin', (req, res) => sendRoot(req, res));
reactApp.get('/chadmin/files', (req, res) => sendRoot(req, res));
reactApp.get('/files/*', function (req, res) {
    const filePath = path.resolve(archiveFilePath + "/public/" + req.path.replace("/files/", ""));
    if (!fs.existsSync(filePath)) send404(req, res);
    else res.sendFile(filePath);
});
reactApp.get('/chadmin/files/*', function (req, res, next) {
    if (req.path == "/chadmin/files/") next();
    else send404(req, res);
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

//coding site
sendSubdomain(reactApp,"/coding","/src/coding");

//488 game
sendSubdomain(reactApp,"/neighborhood","../488-solo-game")

//writeus
sendSubdomain(reactApp,"/writus","/../hacksc-22","writusViews");

//links
reactApp.get('/youtube', function (req, res) { res.redirect('https://www.youtube.com/channel/UCImSybcXB8pCtulA-_T0WCw'); });
reactApp.get('/linkedin', function (req, res) { res.redirect('https://www.linkedin.com/in/will-farhat'); });
reactApp.get('/github', function (req, res) { res.redirect('https://github.com/willf668/'); });
reactApp.get('/resume', function (req, res) { res.redirect('https://github.com/willf668/resume/raw/main/WillFarhatResume.pdf'); });
reactApp.get('/twitter', function (req, res) { res.redirect('https://twitter.com/will_farhat'); });
reactApp.get('/instagram', function (req, res) { res.redirect('https://www.instagram.com/will_farhat/'); });
const pages = new Set();
["inc", "outset", "emotive", "jam", "research", "youtube", "thk", "cfe", "remotion", "freehand", "writus"].forEach(pages.add, pages);
reactApp.get('*', function (req, res) {
    if (req.path == "/404") {
        res.sendFile(path.resolve(reactDir + "/public/404.html"));
        return;
    }
    const endpoint = req.path.replace(/%20/g, " ");
    if (endpoint === "/files") res.sendFile(reactDir + "/build/index.html");
    else if (endpoint.indexOf("/files") === 0) {
        res.sendFile(path.resolve(reactDir + "/build" + endpoint));
    }
    else if (fs.existsSync(reactDir + "/build" + endpoint)) res.sendFile(reactDir + "/build" + endpoint);
    else if (endpoint !== "/" && !pages.has(endpoint.substring(1))) send404(req, res);
    else sendRoot(req, res);
});
if (!localTest) https.createServer(siteOptions, reactApp).listen(sitePort);
else reactApp.listen(sitePort);
console.log("React app listening on port " + sitePort);
//#endregion

//Dead man's switch
//#region Death
function stillAlive(existingTimeout) {
    if (existingTimeout !== undefined) clearTimeout(existingTimeout);
    return setTimeout(() => {
        dns.resolve('www.google.com', function (err) {
            if (err) {
                process.exit(0);
            }

            if (!secrets.alive) return;
            console.log("He's dead, Jim.");
            //get current year
            secrets.date = new Date().getFullYear().toString();
            secrets.alive = false;
            save();
            fs.readFile(path.resolve("./will/emailData.json"), function (err, data) {
                if (err) {
                    throw err;
                }
                const emailData = JSON.parse(data.toString());

                let transporter = nodemailer.createTransport({
                    service: "gmail",
                    auth: {
                        user: emailData.senderEmail,
                        pass: emailData.password
                    }
                });
                let messages = new Map();
                const emailBody = fs.readFileSync(path.resolve("./will/emailBody.txt"), 'utf8');
                emailData.contacts.forEach(person => {
                    const greeting = "Hi " + person.name + ",\n\n";
                    let emailText = greeting + emailBody;
                    person.messages.forEach(message => {
                        messages.set(message, path.resolve("./will/" + message));
                        emailText += fs.readFileSync(path.resolve("./will/" + message), 'utf8');
                    });
                    transporter.sendMail({
                        from: '"Will Farhat" <' + emailData.senderEmail + '>',
                        to: person.email,
                        subject: "Will's Will",
                        text: emailText
                    });
                });
                messages.forEach((path, message) => {
                    fs.unlinkSync(path);
                    messages.delete(message);
                });
            });
        });
    }, 1209600000);
}
let deadManSwitch = stillAlive(undefined);
//#endregion

//API
//#region API
const apiApp = express();
apiApp.use(cors({
    origin: '*'
}));
apiApp.use(fileupload());
apiApp.get('/alive', function (req, res) {
    res.send({ data: secrets.alive });
});
apiApp.get('/date', function (req, res) {
    res.send({ data: secrets.date });
});
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
apiApp.get('/fileList/*', function (req, res) {
    const fileDir = path.resolve(archiveFilePath + req.path.replace("/fileList", ""));
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
//Emotive API endpoints
let emotion = 0;
apiApp.post('/emotion', function (req, res) {
    emotion = req.body;
    res.send("Ok");
});
apiApp.get('/emotion', function (req, res) {
    res.send({ data: emotion });
});
//NFT API endpoints
let nftStatus = false;
apiApp.get('/nftStatus', function (req, res) {
    res.send({ data: nftStatus });
});
//API authentication
apiApp.use((req, res, next) => {
    if (req.headers["user-agent"] !== undefined) {
        if (false && (req.headers["user-agent"]).includes("GitHub-Hookshot")) {
            res.send("OK buddy <3");

            //save data
            save();

            const ls = spawn('bash', ['/home/pi/personal-site-server/website_update.sh', '>', '/home/pi/personal-site-server/out.log'], {
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
    if (secrets.alive) deadManSwitch = stillAlive(deadManSwitch);
    return next();
});
apiApp.get('/secrets/*', function (req, res) {
    const name = req.path.replace("/secrets/", "");
    if (!(name in secrets)) {
        return res.status(404).send({ data: false });
    }
    res.send({ data: secrets[name] });
});
apiApp.get('/chadmin/files/*', function (req, res) {
    const filePath = path.resolve(archiveFilePath + "/private/" + req.path.replace("/chadmin/files/", ""));
    if (!fs.existsSync(filePath)) send404(req, res);
    else res.sendFile(filePath);
});
//Contacts
let contactPath = path.resolve("./contactsInfo.json");
if (contactPath == "/contactsInfo.json") contactPath = path.resolve("/home/pi/personal-site-server/contactsInfo.json");
if (fs.existsSync(contactPath)) {
    const contacts = new Indexer(contactPath);
    apiApp.get('/contacts/search/*', function (req, res) {
        const query = req.path.replace('/contacts/search/', '').replace(/%20/g, " ").trim();
        const results = contacts.search(query);
        res.send({ data: results });
    });
}
//File uploading
apiApp.post('/upload*', (req, res) => {
    if (!req.files) {
        return res.status(500).send({ msg: "No file attached" });
    }
    const myFile = req.files.file;
    let filePath = dayPath;
    if (req.path.includes("upload/files")) filePath = path.resolve(archiveFilePath + "/public");
    else if (req.path.includes("upload/chadmin/files")) filePath = path.resolve(archiveFilePath + "/private");
    filePath = path.resolve(filePath, myFile.name);
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
});
const validFormats = [".MP4", ".MOV", ".JPG", ".JPEG", ".PNG", ".BMP"];
apiApp.post('/dailyArt/upload', (req, res) => {
    if (!req.files) {
        return res.status(500).send({ msg: "No file attached" });
    }
    const myFile = req.files.file;
    if (!validFormats.includes(path.extname(myFile.name).toUpperCase())) {
        return res.status(500).send({ msg: "Invalid file format" });
    }
    secrets.dailyArtPath = path.resolve(dayPath, myFile.name);
    console.log("Daily art: " + secrets.dailyArtPath);
    myFile.mv(secrets.dailyArtPath, function (err) {
        if (err) {
            console.log(err)
            return res.status(500).send({ msg: "Error occured" });
        }
        return res.status(200).send({ data: secrets.dailyArtPath });
    });
});
apiApp.post('/dailyArt/submit', (req, res) => {
    if (secrets.dailyArtPath === "") res.status(500).send({ data: false });
    let tags = "#pixeldalies #pixelart #pixelartist #art #8bit #digitalart";
    let twitterAccounts = "@will_farhat @Pixel_Dailies ";
    const title = req.body.title.trim();
    (async () => {
        secrets.latestArtTwitter = "";
        secrets.latestArtInstagram = "";
        async.series([
            async () => {
                const tClient = new TwitterApi({
                    appKey: secrets.dailyTwitter.apiKey,
                    appSecret: secrets.dailyTwitter.apiKeySecret,
                    accessToken: secrets.dailyTwitter.accessToken,
                    accessSecret: secrets.dailyTwitter.accessTokenSecret,
                }).readWrite;
                const mediaIds = await Promise.all([
                    tClient.v1.uploadMedia(secrets.dailyArtPath)
                ]);
                let tBody = esrever.reverse(title + "\n" + twitterAccounts + tags);
                while (tBody.length > 280) {
                    tBody = tBody.substring(tBody.indexOf(" ") + 1);
                }
                tBody = esrever.reverse(tBody);
                const newTweet = await tClient.v1.tweet(tBody, { media_ids: mediaIds });
                secrets.latestArtTwitter = "https://twitter.com/willFarhatDaily/status/" + newTweet.id_str;
            },
            async () => {
                let instaPath = secrets.dailyArtPath;
                let isCopy = false;
                const pathUpper = instaPath.toUpperCase();
                if (!pathUpper.includes(".JPG") && !pathUpper.includes(".JPEG")) {
                    isCopy = true;
                    const tmp_extless = instaPath.substring(0, instaPath.indexOf(".")) + ".jpg";
                    await easyimg.convert({ src: instaPath, dst: tmp_extless, quality: 80 });
                    instaPath = tmp_extless;
                }
                const instaCreds = { username: "willfarhatdaily", password: secrets.password };
                const iClient = new Instagram(instaCreds);
                await iClient.login(instaCreds);
                const { media } = await iClient.uploadPhoto({ photo: instaPath, caption: title + "\n" + tags, post: 'feed' }).catch((err) => {
                    console.log("Instagram error")
                });
                if (isCopy) fs.unlink(instaPath, () => console.log("Removed temp file"));
                secrets.latestArtInstagram = `https://www.instagram.com/p/${media.code}/`;
            }
        ], (err, results) => {
            if (!secrets.latestArtInstagram && !secrets.latestArtTwitter) res.status(221).send();
            else if (!secrets.latestArtTwitter) res.status(222).send();
            else if (!secrets.latestArtInstagram) res.status(223).send();
            else res.status(200).send();
        });
    })();
});
if (!localTest) https.createServer(apiOptions, apiApp).listen(apiPort);
else apiApp.listen(apiPort);
console.log("API app listening on port " + apiPort);
//#endregion


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
//#region NFTs
const nftStatusPath = reactDir + "/../are-nfts-good/";
const twitterNFT = new (require(path.resolve(nftStatusPath + "/backend/index.js")))();
const hashtags = "\n#nfts #nft #nftart #nftartist #nftcollector #cryptoart #digitalart #nftcommunity #art #crypto #ethereum #blockchain #cryptocurrency #cryptoartist #opensea #nftcollectors #bitcoin #nftdrop #nftcollectibles #artist #d #eth #openseanft #nftartists #artwork";
const yesWeight = 1, noWeight = 1;
const getTwitterData = function () {
    console.log("Grabbling oldest poll...");
    twitterNFT.getMostRecentTweet('areNftsGood').then(data => {
        nftStatus = (data && data.polls && data.polls.options && data.polls.options.length == 2 && data.polls.options[0].votes * yesWeight > data.polls.options[1].votes * noWeight);
        twitterNFT.createPoll("Are NFTs Good?" + hashtags, ["Yes", "No"], 1440);
        console.log("Tweeting new poll...");
    });
}
const nftJob = schedule.scheduleJob('0 0 10 * * *', getTwitterData);
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
//#endregion
