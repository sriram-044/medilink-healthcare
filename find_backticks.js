const fs = require('fs');
const lines = fs.readFileSync('test_step14_rag.js', 'utf8').split('\n');
lines.forEach((l, i) => {
  if (l.includes('`')) {
    console.log(i + 1, l.trim());
  }
});
