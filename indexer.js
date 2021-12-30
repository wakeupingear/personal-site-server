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

    addToIndex(key, value, obj, index) {
        if (!("nn" in obj)) obj.nn = 1;
        else obj.nn++;
        if (index == key.length) {
            if (!("results" in obj)) obj.results = [value];
            else obj.results.push(value);
            return obj;
        }
        if (!(key.charAt(index) in obj)) obj[key.charAt(index)] = {};
        obj[key.charAt(index)] = this.addToIndex(key, value, obj[key.charAt(index)], index + 1);
        return obj;
    }

    removeFromIndex(key, value, obj, index) { //MUST guarantee that key exists
        if (obj == null || (index < key.length && !(key.charAt(index) in obj))) return obj;
        if (obj.nn == 1) {
            delete obj[key.charAt(index)];
            return null;
        }
        obj.nn--;
        if (index == key.length) {
            if ("results" in obj) {
                //if (!obj.results.includes(value)) return obj;
                if (obj.results.length == 1) delete obj.results;
                else obj.results.splice(obj.results.indexOf(value), 1);
            }
            return obj;
        }
        obj[key.charAt(index)] = this.removeFromIndex(key, value, obj[key.charAt(index)], index + 1);
        //delete obj[key.charAt(index)]; //dubious
        return obj;
    }

    add(input) {
        const values = input.split(' ');
        if (values.length == 0) return;
        let key = "";
        let keyIsDone = false;
        let index = 0;
        let val = null;
        const valuesToIndex = [];
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
                valuesToIndex.push(values[index]);
                if (!(type in val)) val[type] = [values[index]]; //add alias entry
                else if (!val[type].includes(values[index])) { //technically slow but I won't have many entries for any specific category for one person
                    val[type].push(values[index]); //add to existing aliases
                }
                else valuesToIndex.pop();
            }
            index++;
        }
        valuesToIndex.forEach(value => {
            this.index = this.addToIndex(value, key, this.index, 0);
        });
        if (!(key in this.data)) {
            if (key.length > this.data.maxLength) this.data.maxLength = key.length;
            const splitKey = key.split(' ');
            for (let i = 1; i < splitKey.length; i++)
                this.index = this.addToIndex(splitKey[i], key, this.index, 0);
            this.index = this.addToIndex(key, key, this.index, 0);
        }
        this.data[key] = val;
    }

    eachRecursive(obj) {
        Object.keys(obj).forEach(k => {
            if (typeof obj[k] == "object" && obj[k] !== null) this.eachRecursive(obj[k]);
            else if (k != "nn") {
                this.result.add(obj[k]);
            }
        });
    }

    search(query) {
        if (query.length > this.data.maxLength) return [];
        let index = 0;
        let current = this.index;
        while (index < query.length) {
            if (current == null || !(query.charAt(index) in current)) {
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

    remove(key) {
        const searchArray = this.search(key);
        if (searchArray.length == 0) return;
        const obj = searchArray[0];
        const fKey = obj.name;
        if (!(fKey in this.data)) return;
        const splitKey = fKey.split(' ');
        for (let i = 1; i < splitKey.length; i++)
            this.index = this.removeFromIndex(splitKey[i], fKey, this.index, 0);
        Object.keys(obj).forEach(element => {
            if (element !== "name") {
                obj[element].forEach(item => {
                    this.index = this.removeFromIndex(item, fKey, this.index, 0);
                });
            }
        });
        this.index = this.removeFromIndex(key, fKey, this.index, 0);
        if (this.index == null) this.index = { "nn": 0 };
    }

    save() {
        fs.writeFileSync(this.indexPath, JSON.stringify(this.index));
        fs.writeFileSync(this.dataPath, JSON.stringify(this.data));
    }

    print() {
        console.log(util.inspect(this.index, { showHidden: false, depth: null, colors: true, compact: true }))
    }
}

module.exports = {
    Indexer
};