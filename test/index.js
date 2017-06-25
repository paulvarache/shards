const should = require('should');
const fs = require('fs');
const Shards = require('../').build;

function countImport(doc, file) {
    let m = doc.match(new RegExp(`<p data-test="">${file}</p>`, 'ig'));
    return m.length;
}

function ensureContainsOnce(filename, imports) {
    return new Promise((resolve, reject) => {
        fs.readFile(filename, (err, contents) => {
            if (err) {
                return reject(err);
            }
            contents = contents.toString();
            imports.forEach(i => countImport(contents, i).should.be.equal(1))
            resolve();
        });
    });
}

describe('Basics', () => {
    it('should make a unique bundle containing all files imported', (done) => {
        const expectedShards = {};
        expectedShards[__dirname + '/.tmp/01/dist/index.html'] = ['index.html', 'elements/a.html', 'elements/b.html'];
        Shards({
            root: __dirname + '/resources/01',
            shell: 'index.html',
            dest: __dirname + '/.tmp/01/dist'
        }).then((files) => {
            const shardFiles = Object.keys(expectedShards);
            files.should.be.an.Array();
            files.should.have.length(shardFiles.length);
            Object.keys(expectedShards).forEach(shard => {
                files.should.containEql(shard);
            });
            Promise.all(Object.keys(expectedShards).map(shardKey => {
                return ensureContainsOnce(shardKey, expectedShards[shardKey]);
            })).then(() => {
                done();
            }).catch(done);
        });
    });

    it('should make three bundles split by lazy imports', (done) => {
        const expectedShards = {};
        expectedShards[__dirname + '/.tmp/02/dist/index.html'] = ['index.html', 'elements/a.html'];
        expectedShards[__dirname + '/.tmp/02/dist/elements/lazy-a.html'] = ['elements/lazy-a.html', 'elements/b.html'];
        expectedShards[__dirname + '/.tmp/02/dist/elements/lazy-b.html'] = ['elements/lazy-b.html'];
        Shards({
            root: __dirname + '/resources/02',
            shell: 'index.html',
            dest: __dirname + '/.tmp/02/dist'
        }).then((files) => {
            const shardFiles = Object.keys(expectedShards);
            files.should.be.an.Array();
            files.should.have.length(shardFiles.length);
            Object.keys(expectedShards).forEach(shard => {
                files.should.containEql(shard);
            });
            Promise.all(Object.keys(expectedShards).map(shardKey => {
                return ensureContainsOnce(shardKey, expectedShards[shardKey]);
            })).then(() => {
                done();
            }).catch(done);
        });
    });
});