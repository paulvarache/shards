const DepTree = require('./dep-tree');

function generateTreeMap(opts) {
    let tree = new DepTree(opts);
    return tree.build().then(root => {
        return new Promise((resolve, reject) => {
            let flat = {};
            function iterate(node) {
                node.name = node.path;
                if (node.parent) {
                    node.parent = node.parent.name;
                } else {
                    node.parent = "";
                }
                delete node.endpoint;
                delete node.path;
                delete node.lazy;
                let children = node.children;
                delete node.children;
                if (children && children.length) {
                    children.forEach(iterate);
                }
                flat[node.name] = node;
            }
            iterate(root);
            flat = Object.keys(flat).map(key => {
                return flat[key];
            });
            console.log(JSON.stringify(flat));
        });
    });
}

module.exports = {
    generateTreeMap
}