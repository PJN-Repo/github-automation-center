const { 
  GITHUB_TOKEN, JIRA_TOKEN, JIRA_USER, JIRA_DOMAIN, 
  PR_NUMBER, REPO_FULL_NAME, PR_BODY_INPUT
} = process.env;

// Fallbacks to prevent bash undefined errors
const PR_TITLE = process.env.PR_TITLE || "";
const BRANCH_NAME = process.env.BRANCH_NAME || "";
const PR_BODY = PR_BODY_INPUT || "";

const JIRA_MARKER_START = "<!-- JIRA-INFO-START -->";
const JIRA_MARKER_END = "<!-- JIRA-INFO-END -->";

async function run() {
  console.log(`Checking PR #${PR_NUMBER} in ${REPO_FULL_NAME}...`);

  // 1. Extract Jira Keys (Case Insensitive)
  const jiraRegex = /([a-zA-Z]+-\d+)/g;

  // Clean the body to remove the automated Jira block so we don't re-scan our own table
  let cleanBody = PR_BODY;
  if (PR_BODY.includes(JIRA_MARKER_START) && PR_BODY.includes(JIRA_MARKER_END)) {
     const removeRegex = new RegExp(`${JIRA_MARKER_START}[\\s\\S]*?${JIRA_MARKER_END}`, 'g');
     cleanBody = PR_BODY.replace(removeRegex, '');
  }

  const rawKeys = [
    ...(PR_TITLE.match(jiraRegex) || []),
    ...(BRANCH_NAME.match(jiraRegex) || []),
    ...(cleanBody.match(jiraRegex) || [])
  ];
  
  const keys = new Set(rawKeys.map(k => k.toUpperCase()));

  // 2. Validate Description Length (10 chars rule)
  const cleanTitle = PR_TITLE.replace(jiraRegex, '').replace(/[\[\]\(\)]/g, '').trim();
  if (cleanTitle.length < 10) {
    console.error(`❌ PR Title description is too short (${cleanTitle.length} chars). Must be at least 10.`);
    process.exit(1);
  }

  // 3. Fetch Jira Titles (Strict Mode)
  // Initialize Markdown Table Header (Modern "Callout" Style as requested)
  let jiraList = "> | Ticket | Type | Summary |\n> |:---:|:---:|:---|\n";
  let validTicketCount = 0; 
  
  const authHeader = `Basic ${Buffer.from(`${JIRA_USER}:${JIRA_TOKEN}`).toString('base64')}`;

  for (const key of keys) {
    console.log(`Checking Jira for ticket: ${key}...`);
    try {
      const res = await fetch(`https://${JIRA_DOMAIN}/rest/api/3/issue/${key}`, {
        headers: { 'Authorization': authHeader, 'Accept': 'application/json' }
      });
      
      if (res.ok) {
        const data = await res.json();
        const f = data.fields;
        const type = f.issuetype ? f.issuetype.name : "Task";
        const summary = (f.summary || "No Summary").replace(/\|/g, '-'); // Escape pipes for table

        jiraList += `> | [${key}](https://${JIRA_DOMAIN}/browse/${key}) | ${type} | ${summary} |\n`;
        console.log(`✅ Validated real Jira ticket: ${key}`);
        validTicketCount++;
      } else {
        console.error(`⚠️ Jira returned HTTP ${res.status} for ${key}. Ticket might not exist or lacks permissions.`);
      }
    } catch (e) {
      console.error(`❌ Error connecting to Jira for ${key}:`, e.message);
    }
  }

  // 4. Update PR Description
  let newBody = PR_BODY;
  const hasExistingBlock = PR_BODY.includes(JIRA_MARKER_START);
  const shouldUpdate = process.env.SKIP_UPDATE !== 'true';

  if (shouldUpdate) {
    if (validTicketCount > 0) {
        const infoBlock = `${JIRA_MARKER_START}\n>[!NOTE]\n>### 🎫 Related Jira Tickets\n${jiraList}${JIRA_MARKER_END}`;
        
        if (hasExistingBlock) {
           const replaceRegex = new RegExp(`${JIRA_MARKER_START}[\\s\\S]*?${JIRA_MARKER_END}`);
           newBody = PR_BODY.replace(replaceRegex, infoBlock);
        } else {
           newBody = `${infoBlock}\n\n${PR_BODY}`;
        }
    } else if (hasExistingBlock) {
        console.log("ℹ️ No valid tickets found. Removing existing Jira block from description.");
        const replaceRegex = new RegExp(`${JIRA_MARKER_START}[\\s\\S]*?${JIRA_MARKER_END}`);
        newBody = PR_BODY.replace(replaceRegex, ''); // Replaces with empty string
    }

    if (newBody !== PR_BODY) {
      console.log("Updating PR description...");
      const patchRes = await fetch(`https://api.github.com/repos/${REPO_FULL_NAME}/pulls/${PR_NUMBER}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ body: newBody })
      });
      
      if (!patchRes.ok) {
        console.error(`⚠️ Failed to update PR description: HTTP ${patchRes.status}`);
      }
    }
  }
  
  // 5. Final Failure Check
  if (validTicketCount === 0) {
    if (keys.size === 0) {
       console.error("❌ No Jira ticket key found in title, branch name, or description.");
    } else {
       console.error("❌ STRICT FAILURE: Could not validate ANY of the provided Jira tickets. Ensure the ticket actually exists!");
    }
    process.exit(1); 
  }
  
  console.log("✅ All PR standards met successfully!");
}

run().catch(err => { 
  console.error("❌ An unexpected error occurred:", err); 
  process.exit(1); 
});
