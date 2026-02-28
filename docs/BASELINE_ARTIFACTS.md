# Baseline Artifacts - v0.1-launch-candidate

This manifest freezes baseline artifacts for rollback integrity.

- Tag: `v0.1-launch-candidate`
- Commit: `ba4c885c2b1eb836341655f7543370ecdf9bdd78`

## Artifact List
- `/apps-script/Code.gs`
- `/apps-script/appsscript.json`
- `/docs/*`
- `/templates/*`
- `/tests/TEST_SCENARIOS.md`

## SHA-256 Checksums
```text
6dc803088709a729c353ee67d8cee7bd9177ca616abdc1eb05e956d158816ee6  apps-script/Code.gs
60fbfe91f42fd8a64b960692cd286e33d95bafb16628b3dade42aea00887cb70  apps-script/appsscript.json
a11601945192520de0804bb6cf5b32a138d8d6a521faf16b6ca4950f49cb8207  docs/72H_EXECUTION_CHECKLIST.md
4b76fffea5461770913e79129ca495291d6275663165013a26e899eda9ed9e26  docs/OFFER_ONE_PAGER.md
311776dd918df6dc39f035c7136457c0177152bfb93a7a896cadc2823aa3d52e  docs/PROD_CUTOVER_CHECKLIST.md
70345414d84670cd5ecc8d84a50c1cbc07d1a839aff9712dfe633ea753e4ddaf  docs/SALES_CALL_SCRIPT.md
811cfd011a39bfbf0d5f91cb3ed66ef525209da761af87f29c86e0f9976a82f3  docs/SETUP_RUNBOOK.md
bc850ea7e5ed9af7381eed73fd6c62a3f48ff4b0694d43db67df03a8b79003a4  docs/WEEK1_OPS_PLAYBOOK.md
eb4b28888ca8e70ed13a289b9d11391c006db170f6e4861666f4d0d120f21439  templates/email_step_1.txt
ad6d34c43abc8b256c5c47299730517725ea906955dcca3c0e8c963368c696b5  templates/email_step_2.txt
d91a0cc6ffd792d3a389edc5cac40944fb5bdbe6283b09ed04070f4dfcc0cc0f  templates/email_step_3.txt
fe4d4046b2a74ccb3121bf7bd0a76100730386b9eaf6662fa8167192dd45b2b1  templates/lead_intake_sample.csv
0ef96d06fb2b8b961e102ea9b9676ec6331d193f2a61284ce82de4a5398e5e4a  templates/linkedin_dm_step_1.txt
3ab7dc7e4ccc86c2c7cb9924c8ee3f3efd3c5185c6a8d1bedb10861d43ac4504  templates/webhook_reply_payload.json
3d4898e8e622fc2e66668cf24297540191982ba0d0704f18fd98a02be71f3c02  templates/webhook_stripe_payload.json
8b982f8ea041869cf8df820364569c4227a3592fbd1adafcd2fdc5835e7104c8  tests/TEST_SCENARIOS.md
```

## Verification Command
```bash
shasum -a 256 apps-script/Code.gs apps-script/appsscript.json docs/*.md templates/* tests/TEST_SCENARIOS.md
```
