const fs = require('node:fs');
const path = require('node:path');

function loadGame() {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
  const match = html.match(/<script>([\s\S]*)<\/script>/);
  if (!match) throw new Error('index.html has no <script> block');
  const tmpDir = path.join(__dirname, '..', '.tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const file = path.join(tmpDir, `game-${process.pid}.js`);
  fs.writeFileSync(file, match[1]);
  delete require.cache[require.resolve(file)];
  return require(file);
}

module.exports = { loadGame };
