let fs = require('fs');
let path = require('path');
let mkdirp = require('mkdirp');
let Vulcan = require('vulcanize');

const TreeUtil = require('./tree-util');
const DepTree = require('./dep-tree');

const INFO = 0;

function LOG(level, msg) {
    console.log(msg);
}

function punlink(filename) {
    return new Promise((resolve, reject) => {
        fs.unlink(filename, (e) => {
            if (e) {
                return reject(e);
            }
            resolve();
        });
    });
}

class Shards {
    constructor(opts) {
        this.opts = opts;
        this.tree = new DepTree(opts);
    }

    makeTree() {
        return this.tree.build();
    }

    static getFlatDepsFromNode(node) {
        let deps = [];
        // Get all dependencies from the tree as an array of path
        function iterate(node) {
            if (deps.indexOf(node.path) === -1) {
                deps.push(node.path);
            }
            if (node.children && node.children.length) {
                node.children.forEach(iterate);
            }
        }
        iterate(node);
        return deps;
    }

    /**
     * Take the children of a bundle and generate the bundle itself, excluding the common deps
     * @param {*} children 
     * @param {*} bundlePath 
     * @param {*} deps 
     * @param {*} dest 
     * @param {*} root 
     */
    static vulcanizeBundle(children, bundlePath, file, deps, dest, rootPath) {
        return new Promise((resolve, reject) => {
            let needed = children.map(c => c.path),
                exclude, vulcan, fd, absPath, relPath;
            needed.push(bundlePath);
            // Exclude contains all the dependencies except the one needed. This tricks vulcanize into only bundling what we tell it to
            exclude = deps.filter(path => needed.indexOf(path) === -1);
            absPath = path.resolve(rootPath);
            relPath = path.relative(absPath, file);
            vulcan = new Vulcan({
                abspath: absPath,
                inlineScripts: true,
                inlineCss: true,
                stripExcludes: exclude.map(p => path.relative(absPath, p)),
                stripComments: true
            });

            vulcan.process(relPath, (err, doc) => {
                if (err) {
                    reject(err);
                } else {
                    let outPath = path.join(dest, path.relative(rootPath, bundlePath));
                    mkdirp.sync(path.dirname(outPath));
                    fd = fs.openSync(outPath, 'w');
                    fs.writeSync(fd, doc);
                    resolve(outPath);
                }
            });
        });
    }

    build(opts) {
        return this.makeTree(opts).then(node => {
            let leaves = TreeUtil.findLeaves(node),
                endpoints = Shards.getAllEndpoints(node),
                similar, bundles = {}, found, copy;

            endpoints.forEach(endpoint => {
                bundles[endpoint.path] = [];
            });

            while (leaves[0] && leaves[0] !== node) {
                // Grab all nodes referencing the same file
                similar = Shards.getAllByPath(node, leaves[0].path);
                // Find the bundle the file belongs to
                found = Shards.bundleLeaf(leaves[0], similar);
                // Add a copy of the leaf to the bundle registery
                bundles[found] = bundles[found] || [];
                copy = Object.assign({}, leaves[0]);
                copy.parent = null;
                if (bundles[found].map(node => node.path).indexOf(copy.path) === -1) {
                    bundles[found].push(copy);
                }
                // Remove all the similar nodes from the tree as the bundle was found
                similar.forEach(l => {
                    if (l.parent) {
                        TreeUtil.removeChild(l.parent, l);
                    }
                });

                leaves = TreeUtil.findLeaves(node);
                leaves.forEach(leaf => {
                    if (leaf.lazy) {
                        TreeUtil.removeChild(leaf.parent, leaf);
                    }
                });
                leaves = TreeUtil.findLeaves(node);
            }

            if (this.opts.debug) {
                Object.keys(bundles).forEach(key => {
                    console.log(key);
                    console.log(bundles[key].map(dep => `\t|${dep.path}`).join('\n'));
                });
            }

            return bundles;
        }).then(bundles => {
            return Promise.all(Object.keys(bundles).map(bundlePath => {
                // Generate temporary files containing the bundles' dependencies
                return Shards.generateBundleContent(bundlePath, bundles[bundlePath]);
            })).then((bundleFiles) => {
                // Grab the tree again
                return this.makeTree()
                    .then(Shards.getFlatDepsFromNode)
                    .then(deps => {
                        // Create all the bundles
                        return Promise.all(Object.keys(bundles).map((bundlePath, index) => {
                            return Shards.vulcanizeBundle(bundles[bundlePath], bundlePath, bundleFiles[index], deps, this.opts.dest, this.opts.root);
                        }));
                    })
                    .catch(e => {
                        return Shards.cleanFiles(bundleFiles).then(() => {
                            throw e;
                        });
                    }).then((builtFiles) => {
                        return Shards.cleanFiles(bundleFiles).then(() => builtFiles);
                    });
            });
        }).catch(err => {
            throw err;
        });
    }

    static generateBundleContent(bundlePath, deps) {
        let dir = path.dirname(bundlePath),
            files = deps.map(c => c.path),
            fileContent, tmpBundlePath, extension, fd, url

        files.push(bundlePath);

        fileContent = files.reduce((acc, dep) => {
            url = path.relative(dir, dep);
            return acc += `<link rel="import" href="${url}">\n`;
        }, '');

        tmpBundlePath = bundlePath.split('.');
        extension = tmpBundlePath.pop();

        tmpBundlePath.push('bundle');
        tmpBundlePath.push(extension);
        tmpBundlePath = tmpBundlePath.join('.');

        mkdirp.sync(dir);
        fd = fs.openSync(tmpBundlePath, 'w');
        fs.writeSync(fd, fileContent);
        return tmpBundlePath;
    }

    static getAllByPath(node, path) {
        let results = [];
        function iterate(node) {
            if (node.path === path) {
                results.push(node);
            }
            if (node.children && node.children.length) {
                node.children.forEach(n => iterate(n));
            }
        }
        iterate(node);
        return results;
    }

    static bundleLeaf(leaf, similar) {
        let lowestCommonNode,
            longestPath,
            parentsPath,
            it,
            p;
        // Create the dependencies path for each similar node e.g.
        // ['a.html', 'b.html', 'c.html']
        // ['a.html', 'b.html', 'c.html']
        // ['e.html', 'd.html', 'c.html']
        let paths = similar.reduce((acc, l) => {
            parentsPath = [];
            p = l;
            do {
                p = TreeUtil.getParentBundle(p);
                parentsPath.unshift(p);
            } while (p.parent);
            acc.push(parentsPath);
            return acc;
        }, []);

        // Grab the longest dependency path of all the similar nodes
        longestPath = paths.reduce((acc, p) => acc < p.length ? p.length : acc, 0);

        // Start iterating at the end of the path
        it = longestPath - 1;

        // Move up towards the root if not all the paths are the same
        while (it > 0 && !paths.every(p => p[it] && p[it].path === paths[0][it].path)) {
            it--;
        }

        // All the paths are the same, this is the lowest common ancestor in the tree
        lowestCommonNode = paths[0][it];

        // Remove the bundle node if all of its children have been processed. A reference to the node is kept in `endpoints`
        if (lowestCommonNode.parent && lowestCommonNode.children.every(c => c.moved)) {
            TreeUtil.removeChild(lowestCommonNode.parent, lowestCommonNode);
        }

        return lowestCommonNode.path;
    }

    static getAllEndpoints(node) {
        let endpoints = [];
        function iterate(node) {
            if (node.lazy && endpoints.map(e => e.path).indexOf(node.path) === -1) {
                endpoints.push(node);
            }
            if (node.children && node.children.length) {
                node.children.forEach(iterate);
            }
        }
        iterate(node);
        return endpoints;
    }

    static cleanFiles(files) {
        return Promise.all(files.map(punlink));
    }
}

module.exports = (opts) => {
    let s = new Shards(opts);
    return s.build();
};
