const fs = require('fs');
let text = fs.readFileSync('test_step14_rag.js', 'utf8');

// Using regex to fix the template literal issue
text = text.replace(/_label:\s*Vital \$\{i\},/g, '  _label: `Vital ${i}`,');
text = text.replace(/_label:\s*`Vital \$\{i\}`,/g, '  _label: `Vital ${i}`,');
text = text.replace(/_sourceId:\s*`v-\$\{i\}`,/g, '  _sourceId: `v-${i}`,');
text = text.replace(/_sourceId:\s*v-\$\{i\},/g, '  _sourceId: `v-${i}`,');

fs.writeFileSync('test_step14_rag.js', text);
console.log("Fixed syntax issues.");
