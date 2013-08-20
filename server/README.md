# wristmap-server

This part does the actual screen image assembly, fetching tiles from their source and stitching them into a pixel buffer that gets sent a few rows at a time to the watch.

`npm install` in this directory to prepare dependencies, then `npm start`.

**NOTE**: 'canvas' dependency Requires Cairo and a bunch of its dependencies to all be installed