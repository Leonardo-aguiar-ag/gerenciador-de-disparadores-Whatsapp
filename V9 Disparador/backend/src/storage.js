const fs = require('fs');
const path = require('path');
const { now } = require('./models');
const COLLECTIONS = ['campaigns', 'contacts', 'messages', 'optOuts', 'processedEvents', 'scriptVersions', 'businessNumbers', 'contactEvents', 'funnelStages', 'settings'];
const emptyStore = () => Object.fromEntries(COLLECTIONS.map(key => [key, []]));
function createStore(file) {
  const filename = path.resolve(file || process.env.DATA_FILE || path.join(process.cwd(), 'data/store.json'));
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  let data;
  try { data = JSON.parse(fs.readFileSync(filename, 'utf8')); } catch { data = emptyStore(); write(data); }
  for (const key of COLLECTIONS) if (!Array.isArray(data[key])) data[key] = [];
  function write(next) { fs.writeFileSync(filename, JSON.stringify(next, null, 2) + '\n'); }
  return {
    file: filename, all: () => data, save: () => write(data),
    insert: (collection, item) => { if (!data[collection]) data[collection] = []; data[collection].push(item); write(data); return item; },
    replace: (collection, item) => { const i = data[collection].findIndex(x => x.id === item.id); if (i < 0) throw new Error('Registro não encontrado'); item.updatedAt = now(); data[collection][i] = item; write(data); return item; },
    remove: (collection, predicate) => { const before = data[collection].length; data[collection] = data[collection].filter(x => !predicate(x)); write(data); return before - data[collection].length; }
  };
}
module.exports = { createStore, COLLECTIONS };
