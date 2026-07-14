# Security Policy

## Supported Versions

Until PageVault publishes versioned releases, security fixes are applied to the latest commit on `main`. Older commits and private downstream modifications are not separately maintained.

## Reporting a Vulnerability

Do not disclose a suspected vulnerability in a public issue, discussion, pull request, or other public channel.

Use GitHub's private vulnerability reporting for this repository:

1. Open the repository's **Security** tab.
2. Select **Advisories**.
3. Select **Report a vulnerability** and create a private report.

Include the affected commit or deployment mode, reproduction steps, expected impact, relevant configuration, and any suggested mitigation. Remove credentials, uploaded private content, and other secrets from the report.

The maintainers will use the private advisory to investigate, coordinate a fix, and agree on disclosure timing. Please wait for that coordination before publishing technical details.

For deployment hardening and trust boundaries, see [docs/security.md](./docs/security.md).
