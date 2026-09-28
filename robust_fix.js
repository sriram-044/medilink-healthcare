const fs = require('fs');
let t = fs.readFileSync('test_step14_rag.js', 'utf8');

// The file was damaged by PowerShell replacing all backticks and ${} variables.
// Let's fix the specific known damaged lines.
t = t.replace(/_label:\s*Vital \\,/g, '  _label: `Vital ${i}`,');
t = t.replace(/_sourceId:\s*v-\\,/g, '  _sourceId: `v-${i}`,');
t = t.replace(/return \{ _id: id \|\| \`\$\{role\}-test-id\`, role \};/g, 'return { _id: id || `${role}-test-id`, role };');
t = t.replace(/return \{ _id: id \|\| \`\$\{role\}-test-id\`\, role \};/g, 'return { _id: id || `${role}-test-id`, role };');
t = t.replace(/return \{ _id: id \|\| \$\{role\}-test-id, role \};/g, 'return { _id: id || `${role}-test-id`, role };');
t = t.replace(/return \{ _id: id \|\| \`\$\{role\}-test-id\`, role \};/g, 'return { _id: id || `${role}-test-id`, role };');

// Also, the original test Async issues need to be wrapped.
t = t.replace(/^\(async \(\) => \{\ntry \{\n/g, '');
t = t.replace(/\n\} catch\(e\) \{ console\.error\(e\); process\.exit\(1\); \}\n\}\)\(\);\n/g, '');
t = t.replace(/\n\}\)\(\);\n$/g, '\n');

// Replace await testAsync
t = "(async () => {\ntry {\n" + t + "\n} catch(e) { console.error(e); process.exit(1); }\n})();\n";

fs.writeFileSync('test_step14_rag.js', t);
console.log('Fixed file.');
