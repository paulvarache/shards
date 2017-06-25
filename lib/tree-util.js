let TreeUtil = {
    removeChild (node, child) {
        let idx = node.children.indexOf(child);
        if (idx >= 0) {
            node.children.splice(idx, 1);
            child.parent = null;
        }
    },
    getParentBundle (node, inclLazy) {
        if (!node.parent) {
            return node;
        }
        do {
            node = node.parent;
        } while (node.parent && (!node.lazy || inclLazy));
        return node;
    },
    findLeaves (root) {
        let leaves = [];
        function iterate(node) {
            if (node.children && node.children.length) {
                node.children.forEach(iterate);
            } else if (!node.moved) {
                // Leaf
                leaves.push(node);
            }
        }
        iterate(root);
        return leaves;
    }
};

module.exports = TreeUtil;