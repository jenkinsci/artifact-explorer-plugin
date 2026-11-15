# AGENTS.md — Jenkins Artifact Explorer Plugin (`artifact-explorer`)

## Overview
- **Plugin ID**: `artifact-explorer`
- **Repository**: `jenkinsci/artifact-explorer-plugin`
- **Java Package**: `io.jenkins.plugins.artifactexplorer`
- **Jenkins Baseline**: `2.555.x` (`org.jenkins-ci.plugins:plugin:6.2236.v12dd4c483242`, Java 17 / 21+)

Provides an interactive, searchable file tree explorer, inline previewer (code, logs, Markdown, images, JSON/YAML/XML), and build-page summary decorator for Jenkins run and job artifacts.

---

## Build, Test & Verification Commands

### Prerequisites
- **JDK**: Java 21 (recommended) or Java 17+
- **Maven**: Apache Maven `3.9+`

### Core Maven Commands
```bash
# Full build, unit/integration tests, SpotBugs, and Enforcer checks (always run before opening a PR)
mvn clean verify

# Run unit tests only (skipping slow InjectedTest Jelly/taglib scan during inner-loop iteration)
mvn test -Dtest=!InjectedTest

# Run a single test class or method
mvn test -Dtest=ArtifactExplorerTest
mvn test -Dtest=ArtifactTreeSanitizeTest#sanitizePathRejectsTraversal

# Run SpotBugs and Maven Enforcer checks directly
mvn spotbugs:check enforcer:enforce

# Package the .hpi artifact without running tests
mvn clean package -DskipTests

# Start a local development Jenkins instance at http://localhost:8080/jenkins
mvn hpi:run
```

---

## Architecture & Source Layout

- `src/main/java/io/jenkins/plugins/artifactexplorer/`
  - `ArtifactExplorerAction.java` — Main Stapler action serving the Explorer UI, artifact metadata tree JSON, and safe inline preview endpoints.
  - `ArtifactExplorerActionFactory.java` — `TransientActionFactory` attaching the explorer to `Run` and `Job` instances.
  - `ArtifactExplorerFilter.java` — Servlet filter supporting optional redirection of the classic `/artifact/` browser when configured.
  - `ArtifactSummaryDecorator.java` — Injects the interactive artifact tree summary widget onto build status pages.
  - `ArtifactTree.java` — Builds and sanitizes the hierarchical artifact tree model with configurable entry limits.
  - `ExplorerConfiguration.java` — `GlobalConfiguration` singleton (`maxEntries`, `replaceClassicBrowser`).
  - `MarkdownRenderer.java` — Safe CommonMark rendering for `.md` artifact previews.
- `src/main/resources/io/jenkins/plugins/artifactexplorer/`
  - `ArtifactExplorerAction/` — `index.jelly`, `body.jelly`, `explorer.js`, `explorer.css`
  - `ArtifactSummaryDecorator/` — `header.jelly`, `footer.jelly`
  - `ExplorerConfiguration/` — `config.jelly`, `help-*.html`
- `src/main/webapp/`
  - `css/summary-tree.css`, `js/summary-tree.js` — Static assets for the build summary tree decorator.
- `src/test/java/io/jenkins/plugins/artifactexplorer/`
  - `ArtifactExplorerTest.java`, `ArtifactTreeSanitizeTest.java`, `RoutingAssumptionsTest.java`

---

## Coding, Security & UI Guardrails

1. **Path Traversal & Artifact Access Security**:
   - Always sanitize relative artifact paths through `ArtifactTree` normalization before resolving `VirtualFile` instances. Reject any path containing `..` segments or escaping the artifact root.
   - Enforce `Run.ARTIFACTS` / `Item.READ` permission checks on all Stapler `do*` endpoints.
2. **Jenkins CSP & Theme Compliance**:
   - Do not use inline `<script>` or inline `onclick=` attributes in `.jelly` views; bind all event listeners in external JS (`explorer.js`, `summary-tree.js`) using `data-*` attributes.
   - Use Jenkins CSS custom properties (`var(--background)`, `var(--text-color)`, `var(--border-color)`) so dark and light themes render cleanly.
   - Never use raw emojis in UI strings or templates; use SVG icons or Jenkins Symbols (`<l:icon>`).
   - Never call native browser `alert()`, `confirm()`, or `prompt()`; use stylized inline banners, modals, or toast feedback.
3. **Pull Request & Dependency Hygiene**:
   - Keep BOM/parent POM version bumps separate from feature or bugfix PRs unless required by a new API dependency.
   - Ensure `mvn spotbugs:check` and `mvn test` pass with zero warnings before pushing.
