# Theia: Upstream Benefits and Future-Proof Strategy

## Your question

When we fork or build our own system on Theia, can we follow up and get all benefits from the source (Theia) future developments, security patches, and new functions? If yes, what is the best future-proof approach?

## Short answer

**Yes.** You can get upstream benefits. The **most future-proof** approach is **not to fork the Theia repo** but to **compose your own application** that depends on Theia via **npm package versions** and add your own **Theia extensions**. Then you get security patches and new features by **bumping Theia package versions** and fixing any breaking changes. For hotfixes before a release, you can **cherry-pick** specific commits from upstream and use local package resolutions.

## Two ways to “build on Theia”

### 1. Compose an app (recommended, most future-proof)

- You have a **separate repo** (e.g. `tools/theia-desktop` or your product shell repo) that is **not** a fork of `eclipse-theia/theia`.
- Your app’s `package.json` depends on **published Theia packages** from npm (e.g. `@theia/core`, `@theia/workspace`, `@theia/terminal`, …) at a **version** (e.g. `1.65.0`).
- Your **custom features** (sovereign chat panel, backlog panel, runtime health, memory view) are implemented as **Theia extensions** (separate npm packages in your monorepo or repo).
- **Upstream benefits:** You get security patches and new functions by upgrading: change `@theia/core` (and others) to the new version, run tests, fix API breakages. No merge from a fork; you stay on released, supported versions.
- **Eclipse Theia IDE (“Theia Blueprint”)** is an example of this: it’s a product built by composing Theia packages and adding its own extensions; you can use it as a template and add your extensions.

### 2. Fork or clone Theia and patch

- You clone or fork `eclipse-theia/theia`, check out a tag (e.g. `v1.43.0`), and apply your own patches or build a custom frontend.
- **Upstream benefits:** You can **cherry-pick** specific commits from Theia’s `master` (e.g. a security fix or bugfix) onto your branch and rebuild. Official docs: [Consuming Theia fixes without upgrading](https://theia-ide.org/docs/consume_theia_fixes_master). For small, independent fixes this works well.
- **Limitation:** If the fix depends on many other changes since your version, cherry-pick can be painful. Long-term, staying on an old fork means you miss new features and may accumulate technical debt. So this is better for **short-term hotfixes** than as the main strategy.

## Best future-proof initiative (summary)

1. **Build your product as a “composed” Theia app** (like Theia IDE Blueprint): depend on `@theia/*` from **npm at a released version**; implement sovereign panels and behavior as **Theia extensions** in your repo.
2. **Upgrade Theia periodically** (e.g. when a new minor/patch is released): bump versions, run your test suite and manual checks, fix breaking API changes. Document the upgrade in your repo (e.g. “Tested with Theia 1.65”).
3. **If you need a fix before the next release:** use the “consume fixes without upgrading” workflow: clone Theia, checkout your version, cherry-pick the commit(s), build, and point your app’s `package.json` resolutions to the local Theia packages until the next Theia release includes the fix.
4. **Do not** maintain a long-lived fork of the whole Theia repo as your main line of development; that makes it harder to pull in upstream improvements.

## References

- [Build your own IDE/Tool (composing applications)](https://theia-ide.org/docs/composing_applications)
- [Extending/Adopting the Theia IDE (Blueprint)](https://theia-ide.org/docs/blueprint_documentation)
- [Consuming Theia fixes without upgrading](https://theia-ide.org/docs/consume_theia_fixes_master)
