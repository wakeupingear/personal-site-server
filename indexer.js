const fs = require('fs');
const util = require('util');

class Indexer {
    createFile(path, value) {
        fs.mkdirSync(path, { recursive: true });
        fs.rmdirSync(path);
        fs.writeFileSync(path, value);
    }

    constructor(indexPath, dataPath) {
        this.indexPath = indexPath;
        if (!fs.existsSync(indexPath)) {
            this.index = {};
            this.createFile(indexPath, JSON.stringify(this.index));
        }
        else this.index = JSON.parse(fs.readFileSync(indexPath));
        this.dataPath = dataPath;
        if (!fs.existsSync(dataPath)) {
            this.data = {};
            this.data.maxLength = 0;
            this.createFile(dataPath, JSON.stringify(this.data));
        }
        else this.data = JSON.parse(fs.readFileSync(dataPath));
        this.result = new Set();
    }

    checkWordType(word) {
        if (word.charAt(0) == "@") {
            return "social"
        }
        if (word.includes("@")) {
            return "email";
        }
        return "word";
    }

    addToIndex(key, obj, index) {
        if (index == key.length) {
            if (!("results" in obj)) obj.results = [key];
            else obj.results.push(key);
            return obj;
        }
        if (!(key.charAt(index) in obj)) obj[key.charAt(index)] = {};
        obj[key.charAt(index)] = this.addToIndex(key, obj[key.charAt(index)], index + 1);
        return obj;
    }

    add(input) {
        const values = input.split(' ');
        if (values.length == 0) return;
        let key = "";
        let keyIsDone = false;
        let index = 0;
        let val = null;
        while (index < values.length) {
            if (values[index] === "") continue;
            let type = this.checkWordType(values[index]); //get type of split item
            if (type == "word" && !keyIsDone) {  //add to the key
                if (key != "") key += " ";
                key += values[index]; //extend key
            }
            else {
                if (type == "word") type = "alias";
                if (!keyIsDone) { //End of keys
                    if (key in this.data) val = this.data[key];
                    else val = {};
                }
                keyIsDone = true;
                if (!(type in val)) val[type] = [values[index]]; //add alias entry
                else if (!val[type].includes(values[index])) { //technically slow but I won't have many entries for any specific category for one person
                    val[type].push(values[index]); //add to existing aliases
                }
            }
            index++;
        }
        if (!(key in this.data)) {
            if (key.length > this.data.maxLength) this.data.maxLength = key.length;
            this.index = this.addToIndex(key, this.index, 0);
        }
        this.data[key] = val;
        //console.log(util.inspect(this.index, { showHidden: false, depth: null, colors: true, compact: true }))
    }

    eachRecursive(obj) {
        Object.keys(obj).forEach(k => {
            if (typeof obj[k] == "object" && obj[k] !== null) this.eachRecursive(obj[k]);
            else {
                this.result.add(obj[k]);
            }
        });
    }

    search(query) {
        if (query.length > this.data.maxLength) return [];
        let index = 0;
        let current = this.index;
        while (index < query.length) {
            if (!(query.charAt(index) in current)) {
                return [];
            }
            current = current[query.charAt(index)];
            index++;
        }
        this.result = new Set();
        this.eachRecursive(current);
        const dataArr = [];
        this.result.forEach(entry => {
            dataArr.push({ ...this.data[entry], "name": entry });
        });
        return dataArr;
    }

    save() {
        fs.writeFileSync(this.indexPath, JSON.stringify(this.index));
        fs.writeFileSync(this.dataPath, JSON.stringify(this.data));
    }
}

module.exports = {
    Indexer
};