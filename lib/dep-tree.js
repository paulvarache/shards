const path = require('path');
const fs = require('fs');
const parse5 = require('parse5');

class DepTree {
    constructor(opts) {
        this.opts = opts;
        this.nodeCache = {};
    }
    build() {
        let root = {};
        root.endpoint = this.opts.shell;
        root.path = path.join(this.opts.root, this.opts.shell);
        return this.createChildren(root).then(() => {
            this.root = root;
            return root;
        });
    }
    createChildren(node) {
        let dir = path.dirname(node.path);
        // Grabs all the dependencies from the entry point
        return this.getDependencies(node.path).then(deps => {
            let tasks,
                p;
            node.children = deps;
            // Normalise the paths
            tasks = node.children.map(childNode => {
                if (childNode.endpoint.charAt(0) === '/') {
                    childNode.path = path.join(this.opts.root, childNode.endpoint);
                } else {
                    childNode.path = path.join(dir, childNode.endpoint);
                }
                childNode.parent = node;
                return childNode;
            }).filter(child => {
                p = node;
                // Lookup the tree to see if the file was already imported in that path before
                while (p) {
                    // We hit the top of the dep path
                    if (!p.parent) {
                        return true;
                    }
                    if (p.path === child.path) {
                        return false;
                    }
                    p = p.parent;
                }
                return true;
            }).map(child => {
                return this.createChildren(child);
            });
            return Promise.all(tasks);
        });
    }
    /**
     * Reads an entry file and generate the tree of dependencies
     * @param {*} filePath 
     * @param {*} ignoreLazy 
     * @param {*} noCache 
     */
    getDependencies(filePath, ignoreLazy, noCache) {
        // Node was parsed before, just return a copy of it
        if (this.nodeCache[filePath]) {
            let copy = this.nodeCache[filePath].map(file => {
                return Object.assign({}, file);
            });
            return Promise.resolve(copy);
        }
        return new Promise((resolve) => {
            let document, files;
            // Read the contents of the file
            fs.readFile(filePath, (err, file) => {
                let content, size;
                if (err) {
                    console.log(`Could not read '${filePath}'`);
                    return resolve([]);
                }
                content = file.toString();
                size = content.length;
                // Parse the DOM
                document = parse5.parse(content, {
                    treeAdapter: parse5.treeAdapters.default
                });
                // Gett all the import links from this document
                files = this.lookForImport(document).map(node => {
                    return {
                        endpoint: node.href,
                        lazy: node.lazy,
                        size
                    };
                });
                if (!noCache) {
                    this.nodeCache[filePath] = files.slice(0);
                }
                return resolve(files);
            });
        });
    }
    /**
     * Returns all the links from a node, recursively
     */
    lookForImport(document) {
        let links = [];
        function iterate(node) {
            let isImport, isLazy, hrefValue;
            if (node.tagName === 'link') {
                node.attrs.forEach(attr => {
                    if (attr.name === 'rel' && (['import', 'lazy-import'].indexOf(attr.value) !== -1)) {
                        isImport = true;
                        isLazy = (attr.value === 'lazy-import');
                    }
                    if (attr.name === 'href') {
                        hrefValue = attr.value;
                    }
                    if (isImport && hrefValue) {
                        links.push({
                            href: hrefValue,
                            lazy: isLazy
                        });
                    }
                });
            }
            if (node.childNodes) {
                node.childNodes.forEach(iterate);
            }
        }
        iterate(document);
        return links;
    }
}

module.exports = DepTree;