const path = require('node:path');
const { setup, check } = require('../electron/services.cjs');
const root = path.resolve('.runtime');
setup(root, console.log).then(() => check(root)).then(console.log).catch(error => { console.error(error.message); process.exitCode = 1; });
