#!/usr/bin/env node
/**
 * Create LLD-001..010 issues in mvp-factory-control from the template.
 * Already run once: issues #437–446. See docs/SOVEREIGN_PROJECT_BOARD_SSOT.md.
 * Run from repo root: node scripts/create-lld-issues-mvp-factory-control.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const repo = 'moldovancsaba/mvp-factory-control';
const templatePath = path.join(__dirname, '../docs/SOVEREIGN_ISSUE_TEMPLATE_MVP_FACTORY_CONTROL.md');
const template = fs.readFileSync(templatePath, 'utf8');

const sectionRe = /^## (LLD-(\d{3})): ([^\n]+)\n\n\*\*Issue title:\*\* `\[LLD-\d+\] ([^`]+)`\n\n\*\*Issue body:\*\*\n\n```markdown\n([\s\S]*?)```/gm;
const results = [];
let m;
while ((m = sectionRe.exec(template)) !== null) {
  const id = m[1];
  const num = m[2];
  const titleMatch = m[4];
  const body = m[5].trim();
  const title = `[${id}] ${titleMatch.trim()}`;

  const bodyFile = path.join(__dirname, `../.tmp-lld-${num}.body.md`);
  fs.mkdirSync(path.dirname(bodyFile), { recursive: true });
  fs.writeFileSync(bodyFile, body, 'utf8');

  try {
    const out = execSync(
      `gh issue create --repo ${repo} --title ${JSON.stringify(title)} --body-file ${JSON.stringify(bodyFile)}`,
      { encoding: 'utf8' }
    );
    const issueUrl = out.trim();
    const issueNum = issueUrl.split('/').pop();
    results.push({ id, title, issueNum, issueUrl });
    console.log(id, '->', issueUrl);
  } catch (e) {
    console.error(id, 'failed:', e.message);
  } finally {
    try { fs.unlinkSync(bodyFile); } catch (_) {}
  }
}


console.log('\nCreated', results.length, 'issues.');
if (results.length) {
  console.log('\nIssue numbers for SSOT:');
  results.forEach(r => console.log(`${r.id} -> #${r.issueNum} ${r.issueUrl}`));
}
