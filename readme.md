# Shards

[![Build Status](https://travis-ci.org/paulvarache/shards.svg?branch=master)](https://travis-ci.org/paulvarache/shards)

Generates a tree of HTML imports dependencies and split bundles based on the lazy imports

Useful to bundle apps using HTML Imports with code splitting by view but not only. Instead of declaring a view, just declare a `lazy-import` and shards will create a new `lazy endpoint` from it and resolve in which bundle it should be embedded.

This way, a lazy loaded view, can have lazy loaded subview or sections, if files are specific to these subsections, they will be bundled outside of the view.

## Usage

As this tool answers a very specific need, the API is simple. Provide the root folder of your application, the main entry point (as `shell`) relative to the root as well as the destination directory for the bundled files.

```js
const Shards = require('shards');

Shards.build({
    root: __dirname + '/src',
    shell: 'index.html',
    dest: __dirname + '/dist'
}).then(bundles => {
    /* bundles is an array of paths to the generated bundles */
}).catch(e => { /* Error managment */ })
```

## Future

In the future we intend to make the interface more customisable and let build tools (e.g. gulp) integrate shards more easily.

We're also working on a visualisation tool that will display the dependency tree before and after the bundling with data about the size of every endpoint users can land on.
