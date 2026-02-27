# Global Standards Enforcement



## Overview
This automation enforces Pull Request standards across all repositories in the GitHub Organization. It ensures that every PR targeting the default (`main`) branch includes a valid Jira ticket key and a descriptive title (at least 10 characters).

### Key Features:
* **Global Enforcement:** Runs automatically on all organization repositories via GitHub Rulesets.
* **Auto-Formatting:** Automatically fetches Jira ticket titles and appends them to the PR description.
* **Non-Blocking Red CI:** If standards are not met, the CI check turns **Red**, but the "Merge" button remains active.
* **Slack Accountability Alert:** If a developer bypasses the Red CI and merges a non-compliant PR, an alert is sent to the `#team-chat` Slack channel tagging the author.
* **Centralized Opt-Out:** Specific repositories can be excluded via a central JSON file.

---

## 1. GitHub App Setup (Restrictive Security)
To securely checkout the central configuration files across the organization, we use a GitHub App. For maximum security (Principle of Least Privilege), this App should *only* have access to this central configuration repository.

1. Go to **Organization Settings > Developer Settings > GitHub Apps > New GitHub App**.
2. Name it (e.g., `PR-Standards-Bot`). Uncheck **Active** under Webhooks.
3. Under **Repository permissions**, set **Contents** to **Access: Read-only**.
4. Create the App, note the **App ID**, and click **Generate a private key** (`.pem` file).
5. On the left sidebar, click **Install App**. Install it on your Organization, but choose **Only select repositories** and explicitly select your `github-automation-center` repository.

---

## 2. Organization Actions Permissions (Preventing 403 Errors)
Because this workflow automatically updates PR descriptions with Jira links, the GitHub Actions runner requires write permissions. 



1. Go to **Organization Settings > Actions > General**.
2. Scroll down to the **Workflow permissions** section.
3. Change the selection from *Read repository contents and packages permissions* to **Read and write permissions**.
4. Click **Save**. *(Note: This can also be configured on a per-repository basis if global write access is not desired).*

---

## 3. Organization Secrets
Configure the following secrets in **Organization Settings > Secrets and variables > Actions**:

| Secret Name | Description |
| :--- | :--- |
| `ORG_APP_ID` | The numeric App ID of the internal GitHub App. |
| `ORG_APP_PRIVATE_KEY` | The private key (`.pem` file contents) for the internal GitHub App. |
| `JIRA_API_TOKEN` | A Jira API token with read access to issues. |
| `JIRA_USER_EMAIL` | The email address associated with the Jira API token (Required for Jira Cloud). |
| `SLACK_WEBHOOK_URL` | An Incoming Webhook URL for the target Slack channel. |

---

## 4. Repository Structure (`github-automation-center`)
This centralized repository acts as the "Control Tower". It must contain the following three files on the `main` branch:

* **`excluded_repos.json`** (Root directory): A simple JSON array containing the names of any repositories that should be exempt from these PR standards.
* **`validate-pr.js`** (Root directory): The Node.js script that parses the PR title/branch, connects to the Jira API for validation, enforces strict failure logic if the ticket is fake, and updates the PR description.
* **`.github/workflows/global-pr-standards.yml`**: The GitHub Actions workflow file that orchestrates the token generation, triggers the validation script on the `opened` and `edited` PR events, and handles the Slack webhook if a non-compliant PR is merged.

---

## 5. Global Activation Instructions
To deploy this workflow to all repositories:

1. Navigate to **Organization Settings > Repository > Rulesets**.
2. Click **New ruleset > New branch ruleset**.
3. Set **Name** to `Enforce PR Standards`.
4. Under **Target repositories**, select **All repositories**.
5. Under **Target branches**, select **Include default branch** (targets `main`).
6. Under **Rules**, check **Require workflows to pass before merging**.
7. Click **Add workflow** and select `.github/workflows/global-pr-standards.yml` from the `github-automation-center` repository.
8. ⚠️ **Ensure "Block bypass" is UNCHECKED** so developers can still merge in emergencies (which is what triggers the Slack accountability alert).
9. Click **Save changes**.