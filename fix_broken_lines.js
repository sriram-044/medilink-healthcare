const fs = require('fs');
let text = fs.readFileSync('test_step14_rag.js', 'utf8');
text = text.replace(/_sourceId:\s*\x0B?-\\,/g, '  _sourceId: `v-${i}`,');
text = text.replace(/_label:\s*Vital \\,/g, '  _label: `Vital ${i}`,');
fs.writeFileSync('test_step14_rag.js', text);
