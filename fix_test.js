const fs = require('fs');
let content = fs.readFileSync('test_step14_rag.js', 'utf8');

// The issue was that powershell regex replacement replaced something wrong, or I can just fix it properly.
// Actually, I can just replace `await testAsync('Patient auth context: patientId = own userId', async () => {` with `(async () => {\nawait testAsync('Patient auth context: patientId = own userId', async () => {`
// Let's remove the wrapper I added first if it's there.
content = content.replace(/^\(async \(\) => \{\n/g, '');
content = content.replace(/\n\}\)\(\);\n$/g, '\n');

// Then apply it safely:
let firstTestIdx = content.indexOf(`await testAsync('Patient auth context: patientId = own userId',`);
if (firstTestIdx !== -1) {
    let before = content.slice(0, firstTestIdx);
    let after = content.slice(firstTestIdx);
    
    // Also remove the `process.exit(1);` at the end or keep it inside the async function.
    let newContent = before + "(async () => {\ntry {\n" + after + "\n} catch(e) { console.error(e); process.exit(1); }\n})();\n";
    fs.writeFileSync('test_step14_rag.js', newContent);
    console.log("Fixed successfully.");
} else {
    console.log("Could not find the first test.");
}
